require "rails_helper"

RSpec.describe Moderation::LlmVerifier do
  let(:anthropic_url) { "https://api.anthropic.com/v1/messages" }

  let(:listing) do
    {
      "jeId" => "16680095",
      "title" => "Commercial space in Madrid",
      "priceUsd" => 1_250_000.0,
      "city" => "Madrid",
      "country" => "Spain",
      "realEstateType" => "commercial",
      "imageCount" => 8,
      "lqi" => 70.0,
      "descriptionLength" => 320,
      "description" => "A great commercial unit",
      "livingArea" => 150.0,
      "chatGptPropertyCondition" => 0
    }
  end

  let(:matches) do
    [
      { rule_name: "low_price", rule_category: "simple_code", tier: "auto", action: "notice",
        message: nil, details: "price below threshold" },
      { rule_name: "commercial_property", rule_category: "auto_ai", tier: "verify", action: "reject",
        message: "No commercial", details: "matched 'commercial'" },
      { rule_name: "former_manual_rule", rule_category: "former_manual", tier: "verify", action: "flag",
        message: nil, details: "fm details" }
    ]
  end

  def claude_response(text, input_tokens: 300, output_tokens: 90)
    {
      model: "claude-haiku-4-5-20251001",
      content: [ { type: "text", text: text } ],
      usage: { input_tokens: input_tokens, output_tokens: output_tokens }
    }.to_json
  end

  around { |example| with_env("ANTHROPIC_API_KEY" => "test-key") { example.run } }

  it "sends the verification prompt with max_tokens 500 and the configured model/temperature" do
    claude_stub = stub_request(:post, anthropic_url)
      .with(headers: { "x-api-key" => "test-key", "anthropic-version" => "2023-06-01" }) do |req|
        body = JSON.parse(req.body)
        prompt = body.dig("messages", 0, "content")

        body["model"] == "claude-verifier" &&
          body["max_tokens"] == 500 &&
          body["temperature"] == 0.1 &&
          prompt.include?("FLAGGED RULES TO VERIFY:") &&
          prompt.include?("• [auto_ai] commercial_property (action: reject): matched 'commercial'") &&
          prompt.include?("• [former_manual] former_manual_rule (action: flag): fm details") &&
          !prompt.include?("low_price") && # simple_code matches are not sent for verification
          prompt.include?("- Price: $1,250,000") &&
          prompt.include?("- Location: Madrid, Spain") &&
          prompt.include?("- GPT condition score: 0/5 (unidentifiable)")
      end
      .to_return(status: 200, body: claude_response(
        { scores: { condition: 4, watermark: false, quality: 0.8, policyOk: false },
          assessment: "Clearly commercial.", recommendation: "reject", confidence: 0.95,
          notice: nil }.to_json
      ))

    result = described_class.call(listing, matches, model: "claude-verifier", temperature: 0.1)

    expect(claude_stub).to have_been_requested
    expect(result["recommendation"]).to eq("reject")
    expect(result["confidence"]).to eq(0.95)
    expect(result["assessment"]).to eq("Clearly commercial.")
    expect(result["model"]).to eq("claude-verifier")
    expect(result["tokensUsed"]).to eq(390)
  end

  it "shows 'Price on request' and 'None' for missing price and rules" do
    stub_request(:post, anthropic_url)
      .with { |req|
        prompt = JSON.parse(req.body).dig("messages", 0, "content")
        prompt.include?("- Price: Price on request") && prompt.include?("FLAGGED RULES TO VERIFY:\nNone")
      }
      .to_return(status: 200, body: claude_response("{\"recommendation\":\"approve\",\"confidence\":0.9}"))

    result = described_class.call({ "jeId" => "1", "title" => "T" }, [], model: "m", temperature: 0)
    expect(result["recommendation"]).to eq("approve")
  end

  it "strips markdown fences before parsing" do
    stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response(
      "```json\n{\"recommendation\":\"approve\",\"confidence\":0.92}\n```"
    ))

    result = described_class.call(listing, matches, model: "m", temperature: 0)
    expect(result["recommendation"]).to eq("approve")
    expect(result["confidence"]).to eq(0.92)
  end

  it "falls back to manual / confidence 0.3 when the response is not JSON" do
    stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response(
      "I think this listing is probably fine but I cannot produce JSON right now." * 20
    ))

    result = described_class.call(listing, matches, model: "claude-x", temperature: 0.1)

    expect(result["recommendation"]).to eq("manual")
    expect(result["confidence"]).to eq(0.3)
    expect(result["scores"]).to eq("condition" => 3, "watermark" => false, "quality" => 0.5, "policyOk" => true)
    expect(result["assessment"].length).to be <= 500
    expect(result["model"]).to eq("claude-x")
  end

  it "raises on API errors so the caller can route to manual" do
    stub_request(:post, anthropic_url).to_return(status: 500, body: "boom")

    expect do
      described_class.call(listing, matches, model: "m", temperature: 0)
    end.to raise_error(Ai::ClaudeClient::ApiError)
  end

  it "raises when no API key is configured" do
    with_env("ANTHROPIC_API_KEY" => nil) do
      expect do
        described_class.call(listing, matches, model: "m", temperature: 0)
      end.to raise_error(Ai::ClaudeClient::MissingApiKeyError)
    end
  end
end
