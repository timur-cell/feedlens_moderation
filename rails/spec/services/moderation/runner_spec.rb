require "rails_helper"

RSpec.describe Moderation::Runner do
  let(:anthropic_url) { "https://api.anthropic.com/v1/messages" }

  def claude_body(text)
    {
      model: "claude-haiku-4-5-20251001",
      content: [ { type: "text", text: text } ],
      usage: { input_tokens: 100, output_tokens: 50 }
    }.to_json
  end

  def param_scan_text
    { verdict: "ok", flags: [], summary: "Parameters look consistent", confidence: 0.95 }.to_json
  end

  def llm_text(recommendation:, confidence:, notice: nil)
    { scores: { condition: 4, watermark: false, quality: 0.8, policyOk: true },
      assessment: "Verified the flags.", recommendation: recommendation,
      confidence: confidence, notice: notice }.to_json
  end

  describe "deterministic reject path (end-to-end)" do
    around { |example| with_env("ANTHROPIC_API_KEY" => nil, "IMPLIO_STUB" => nil) { example.run } }

    let!(:rule) do
      create(:rule, name: "price_too_low", category: "simple_code", tier: "auto", action: "reject",
                    priority: 10, seller_message: "Price below our standards.",
                    config: { "conditions" => [ { "field" => "priceUsd", "operator" => "<", "value" => 490_000 } ] },
                    match_count: 2)
    end

    let(:listing) { create(:listing, je_id: "16680095", price_usd: 100_000.0, category: "real_estate") }

    it "rejects, persists everything and returns the camelCase contract" do
      result = described_class.call(listing)

      expect(result[:outcome]).to eq("rejected")
      expect(result[:llmTriggered]).to be(false)
      expect(result[:confidence]).to eq(1.0)
      expect(result[:visionAnalyzed]).to be(false)
      expect(result[:aiScanVerdict]).to eq("reject").or eq("ok") # deterministic-only scan verdict
      expect(result[:ruleMatches]).to eq([ {
        "ruleName" => "price_too_low",
        "ruleCategory" => "simple_code",
        "tier" => "auto",
        "action" => "reject",
        "message" => "Price below our standards.",
        "details" => result[:ruleMatches].first["details"]
      } ])

      # ModerationResult persisted
      mod = ModerationResult.last
      expect(mod.listing).to eq(listing)
      expect(mod.outcome).to eq("rejected")
      expect(mod.llm_triggered).to be(false)
      expect(mod.seller_message).to eq("Price below our standards.")
      expect(mod.confidence).to eq(1.0)
      expect(mod.rule_matches.first["ruleName"]).to eq("price_too_low")

      # Listing status updated
      expect(listing.reload.moderation_status).to eq("rejected")

      # Rule stats updated
      expect(rule.reload.match_count).to eq(3)
      expect(rule.last_matched_at).to be_present

      # AI param scan ran deterministically (no key) and was persisted
      expect(AiParameterScan.where(listing_id: listing.id).count).to eq(1)

      # No LLM / Implio HTTP at all (no key + Implio stub default ON)
      expect(WebMock).not_to have_requested(:post, anthropic_url)
      expect(WebMock).not_to have_requested(:post, "https://api.implio.com/v1/ads")
    end

    it "approves clean listings" do
      clean = create(:listing, je_id: "20000001", price_usd: 900_000.0)
      result = described_class.call(clean)

      expect(result[:outcome]).to eq("approved")
      expect(result[:ruleMatches]).to eq([])
      expect(clean.reload.moderation_status).to eq("approved")
      expect(rule.reload.match_count).to eq(2) # unchanged
    end
  end

  describe "needs_llm path" do
    let!(:auto_ai_rule) do
      create(:rule, name: "commercial_detector", category: "auto_ai", tier: "verify", action: "reject",
                    priority: 30, seller_message: "No commercial properties.",
                    config: { "patterns" => [ "commercial" ], "fields" => [ "title" ] })
    end

    let(:listing) do
      create(:listing, je_id: "16680096", title: "Commercial space in Madrid", price_usd: 1_000_000.0)
    end

    around { |example| with_env("ANTHROPIC_API_KEY" => "test-key", "IMPLIO_STUB" => nil) { example.run } }

    it "auto-rejects on a high-confidence LLM reject (above threshold)" do
      # First Claude call = param scan, second = LLM verification
      stub_request(:post, anthropic_url).to_return(
        { status: 200, body: claude_body(param_scan_text) },
        { status: 200, body: claude_body(llm_text(recommendation: "reject", confidence: 0.95)) }
      )

      result = described_class.call(listing)

      expect(result[:outcome]).to eq("rejected")
      expect(result[:llmTriggered]).to be(true)
      expect(result[:confidence]).to eq(0.95)
      names = result[:ruleMatches].map { |m| m["ruleName"] }
      expect(names).to eq(%w[commercial_detector llm_assessment])
      expect(result[:ruleMatches].last["tier"]).to eq("auto")

      mod = ModerationResult.last
      expect(mod.llm_response["recommendation"]).to eq("reject")
      expect(mod.llm_response["model"]).to eq("claude-haiku-4-5-20251001")
      expect(mod.seller_message).to eq("Your listing does not meet our listing standards.")
      expect(listing.reload.moderation_status).to eq("rejected")
    end

    it "routes to manual below the confidence threshold" do
      stub_request(:post, anthropic_url).to_return(
        { status: 200, body: claude_body(param_scan_text) },
        { status: 200, body: claude_body(llm_text(recommendation: "reject", confidence: 0.5)) }
      )

      result = described_class.call(listing)

      expect(result[:outcome]).to eq("manual")
      expect(result[:llmTriggered]).to be(true)
      expect(result[:confidence]).to eq(0.5)
      expect(result[:ruleMatches].last).to include("ruleName" => "llm_assessment", "tier" => "manual")
      expect(listing.reload.moderation_status).to eq("manual")
    end

    it "approves on a high-confidence approve" do
      stub_request(:post, anthropic_url).to_return(
        { status: 200, body: claude_body(param_scan_text) },
        { status: 200, body: claude_body(llm_text(recommendation: "approve", confidence: 0.93)) }
      )

      expect(described_class.call(listing)[:outcome]).to eq("approved")
    end

    it "routes to manual when the LLM call fails" do
      stub_request(:post, anthropic_url).to_return(
        { status: 200, body: claude_body(param_scan_text) },
        { status: 500, body: "boom" }
      )

      result = described_class.call(listing)

      expect(result[:outcome]).to eq("manual")
      expect(result[:llmTriggered]).to be(false)
      expect(result[:confidence]).to eq(0)
    end

    it "routes to manual without LLM when no API key is configured" do
      with_env("ANTHROPIC_API_KEY" => nil) do
        result = described_class.call(listing)

        expect(result[:outcome]).to eq("manual")
        expect(result[:llmTriggered]).to be(false)
        expect(WebMock).not_to have_requested(:post, anthropic_url)
      end
    end

    it "respects the enable_auto_moderation toggle" do
      Setting.create!(key: Setting::KEY, enable_auto_moderation: false)
      stub_request(:post, anthropic_url).to_return(
        { status: 200, body: claude_body(param_scan_text) },
        { status: 200, body: claude_body(llm_text(recommendation: "reject", confidence: 0.99)) }
      )

      expect(described_class.call(listing)[:outcome]).to eq("manual")
    end
  end

  describe "on-demand vision (step 3b)" do
    let!(:auto_ai_rule) do
      create(:rule, name: "commercial_detector", category: "auto_ai", tier: "verify", action: "reject",
                    priority: 30, config: { "patterns" => [ "commercial" ], "fields" => [ "title" ] })
    end
    let!(:hybrid_rule) do
      create(:rule, name: "bad_condition_vision", category: "hybrid_vision", tier: "auto", action: "reject",
                    priority: 20, seller_message: "Images show poor condition.",
                    config: { "scoreThresholds" => { "condition" => 3, "conclusion" => 3 } })
    end

    let(:listing) do
      create(:listing, je_id: "16680097", title: "Commercial ruin", price_usd: 1_000_000.0,
                       image_urls: [ "https://img.example/1.jpg" ])
    end

    let(:vision_result) do
      Ai::VisionAnalyzer::EMPTY_RESULT.merge(
        "property_condition" => 1.5, "conclusion" => 2.0, "watermark_share" => 0,
        "image_quality" => "low", "image_type" => "Real photo",
        "model" => "claude-haiku-4-5-20251001", "llm" => "claude"
      )
    end

    around { |example| with_env("ANTHROPIC_API_KEY" => nil, "IMPLIO_STUB" => nil) { example.run } }

    it "runs vision, patches the listing and lets new hybrid auto-rejects short-circuit" do
      expect(Ai::VisionAnalyzer).to receive(:analyze)
        .with(image_urls: [ "https://img.example/1.jpg" ], title: "Commercial ruin", je_id: "16680097")
        .and_return(vision_result)

      result = described_class.call(listing)

      expect(result[:outcome]).to eq("rejected")
      expect(result[:visionAnalyzed]).to be(true)
      expect(result[:llmTriggered]).to be(false)
      expect(result[:confidence]).to eq(1.0)

      hybrid_match = result[:ruleMatches].find { |m| m["ruleName"] == "bad_condition_vision" }
      expect(hybrid_match["details"]).to start_with("[Auto AI vision]")

      reloaded = listing.reload
      expect(reloaded.chat_gpt_property_condition).to eq(1.5)
      expect(reloaded.chat_gpt_conclusion).to eq("2")
      expect(reloaded.chat_gpt_image_quality).to eq("low")
      expect(reloaded.moderation_status).to eq("rejected")

      mod = ModerationResult.last
      expect(mod.vision_result["property_condition"]).to eq(1.5)
      expect(mod.vision_model).to eq("claude-haiku-4-5-20251001")
      expect(mod.seller_message).to eq("Images show poor condition.")
    end

    it "continues to the LLM path when vision fails" do
      expect(Ai::VisionAnalyzer).to receive(:analyze)
        .and_return(Ai::VisionAnalyzer::EMPTY_RESULT.merge("error" => "No images could be loaded"))

      result = described_class.call(listing)

      expect(result[:outcome]).to eq("manual") # no LLM key → manual
      expect(result[:visionAnalyzed]).to be(false)
      expect(listing.reload.chat_gpt_property_condition).to be_nil
    end

    it "skips vision when the listing already has vision data" do
      listing.update!(chat_gpt_property_condition: 4.0)
      expect(Ai::VisionAnalyzer).not_to receive(:analyze)

      described_class.call(listing)
    end
  end

  describe "Implio integration" do
    around { |example| with_env("ANTHROPIC_API_KEY" => nil, "IMPLIO_STUB" => nil) { example.run } }

    it "submits the persisted result to Implio (stub-aware)" do
      listing = create(:listing, je_id: "16680099")
      expect(Integrations::ImplioClient).to receive(:submit_result)
        .with(an_instance_of(ModerationResult))
        .and_return(success: true, stubbed: true)

      described_class.call(listing)
    end

    it "does not fail the run when Implio submission raises" do
      listing = create(:listing, je_id: "16680100")
      allow(Integrations::ImplioClient).to receive(:submit_result).and_raise(StandardError, "implio down")

      expect(described_class.call(listing)[:outcome]).to eq("approved")
      expect(ModerationResult.last.outcome).to eq("approved")
    end
  end
end
