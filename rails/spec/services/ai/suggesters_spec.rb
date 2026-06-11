require "rails_helper"

RSpec.describe "AI suggesters" do
  let(:anthropic_url) { "https://api.anthropic.com/v1/messages" }

  def claude_response(text)
    {
      model: "claude-haiku-4-5-20251001",
      content: [ { type: "text", text: text } ],
      usage: { input_tokens: 100, output_tokens: 200 }
    }.to_json
  end

  around { |example| with_env("ANTHROPIC_API_KEY" => "test-key") { example.run } }

  describe Ai::RuleSuggester do
    it "sends the rule prompt (max_tokens 2000) and returns the parsed suggestion" do
      suggestion = {
        "name" => "no_castles_under_1m", "displayName" => "No cheap castles",
        "description" => "d", "category" => "simple_code", "tier" => "auto",
        "enabled" => false, "action" => "reject", "priority" => 40,
        "config" => { "conditions" => [ { "field" => "priceUsd", "operator" => "<", "value" => 1_000_000 } ] },
        "sellerMessage" => "msg"
      }

      claude_stub = stub_request(:post, anthropic_url)
        .with do |req|
          body = JSON.parse(req.body)
          body["model"] == "claude-haiku-4-5-20251001" &&
            body["max_tokens"] == 2000 &&
            body.dig("messages", 0, "content").include?('USER\'S DESCRIPTION: "reject castles under 1M"')
        end
        .to_return(status: 200, body: claude_response(suggestion.to_json))

      expect(described_class.call(description: "reject castles under 1M")).to eq(suggestion)
      expect(claude_stub).to have_been_requested
    end

    it "extracts JSON from surrounding prose" do
      stub_request(:post, anthropic_url)
        .to_return(status: 200, body: claude_response("Sure! Here you go: {\"name\":\"x\"} enjoy"))

      expect(described_class.call(description: "x")).to eq("name" => "x")
    end

    it "raises a descriptive error when no JSON can be extracted" do
      stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response("no json here"))

      expect { described_class.call(description: "x") }
        .to raise_error(Ai::SuggestionParsing::SuggestionParseError, /Failed to parse AI suggestion/)
    end
  end

  describe Ai::ListSuggester do
    it "sends the list prompt (max_tokens 4000) and returns the parsed suggestion" do
      suggestion = {
        "name" => "sold_keywords", "displayName" => "Sold keywords", "description" => "d",
        "category" => "real_estate.availability",
        "items" => [ { "value" => "sold", "type" => "exact" } ]
      }

      claude_stub = stub_request(:post, anthropic_url)
        .with do |req|
          body = JSON.parse(req.body)
          body["max_tokens"] == 4000 &&
            body.dig("messages", 0, "content").include?('USER\'S DESCRIPTION: "sold keywords"')
        end
        .to_return(status: 200, body: claude_response(suggestion.to_json))

      expect(described_class.call(description: "sold keywords")).to eq(suggestion)
      expect(claude_stub).to have_been_requested
    end
  end
end
