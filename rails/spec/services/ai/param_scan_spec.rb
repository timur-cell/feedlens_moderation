require "rails_helper"

RSpec.describe Ai::ParamScan do
  let(:anthropic_url) { "https://api.anthropic.com/v1/messages" }

  def claude_response(text, input_tokens: 100, output_tokens: 50)
    {
      model: "claude-haiku-4-5-20251001",
      content: [ { type: "text", text: text } ],
      usage: { input_tokens: input_tokens, output_tokens: output_tokens }
    }.to_json
  end

  def ok_ai_json(confidence: 0.95)
    { verdict: "ok", flags: [], summary: "Parameters look consistent for a villa in Spain", confidence: confidence }.to_json
  end

  describe ".call" do
    context "with an API key" do
      around { |example| with_env("ANTHROPIC_API_KEY" => "test-key") { example.run } }

      it "sends model/temperature from settings, max_tokens 600 and the parameters JSON" do
        Setting.create!(key: Setting::KEY, param_scan_model: "claude-scan-model", ai_temperature: 0.42)
        listing = create(:listing, price: 2_000_000.0, country: "Spain", real_estate_type: "villa", living_area: 400.0)

        claude_stub = stub_request(:post, anthropic_url)
          .with(headers: { "x-api-key" => "test-key", "anthropic-version" => "2023-06-01" }) do |req|
            body = JSON.parse(req.body)
            prompt = body.dig("messages", 0, "content")

            body["model"] == "claude-scan-model" &&
              body["max_tokens"] == 600 &&
              body["temperature"] == 0.42 &&
              prompt.include?("LISTING PARAMETERS:") &&
              prompt.include?('"realEstateType": "villa"') &&
              prompt.include?("use these exact flag codes")
          end
          .to_return(status: 200, body: claude_response(ok_ai_json))

        result = described_class.call(listing)

        expect(claude_stub).to have_been_requested
        expect(result["verdict"]).to eq("ok")
        expect(result["flags"]).to eq([])
        expect(result["confidence"]).to eq(0.95)
        expect(result["tokensUsed"]).to eq(150)
      end

      it "persists an AiParameterScan row (upsert)" do
        listing = create(:listing, price: 2_000_000.0, living_area: 400.0)
        stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response(ok_ai_json))

        described_class.call(listing)
        described_class.call(listing, force_rescan: true)

        expect(AiParameterScan.where(listing_id: listing.id).count).to eq(1)
        scan = AiParameterScan.last
        expect(scan.verdict).to eq("ok")
        expect(scan.model).to eq("deterministic+claude-haiku-4-5-20251001")
        expect(scan.parameters_checked["price"]).to eq(2_000_000.0)
      end

      it "returns the cached scan without HTTP unless force_rescan" do
        listing = create(:listing)
        existing = create(:ai_parameter_scan, listing: listing, verdict: "review")

        result = described_class.call(listing)

        expect(result["scanId"]).to eq(existing.id)
        expect(result["verdict"]).to eq("review")
        expect(WebMock).not_to have_requested(:post, anthropic_url)
      end

      it "normalizes verdicts case-insensitively" do
        listing = create(:listing, price: 2_000_000.0)
        stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response(
          { verdict: "REVIEW", flags: [ { code: "PRICE_SUSPICIOUS", severity: "medium", message: "odd" } ],
            summary: "Needs a look", confidence: 0.8 }.to_json
        ))

        result = described_class.call(listing)

        expect(result["verdict"]).to eq("review")
        expect(result["flags"].first["code"]).to eq("PRICE_SUSPICIOUS")
      end

      it "maps unknown verdicts to ok" do
        listing = create(:listing, price: 2_000_000.0)
        stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response(
          { verdict: "definitely-fine", flags: [], summary: "?", confidence: 0.9 }.to_json
        ))

        expect(described_class.call(listing)["verdict"]).to eq("ok")
      end

      it "falls back gracefully on malformed AI JSON (deterministic checks still apply)" do
        listing = create(:listing, price: 500.0) # high PRICE_SUSPICIOUS deterministic flag
        stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response("not { json"))

        result = described_class.call(listing)

        expect(result["verdict"]).to eq("review") # from the deterministic flag
        expect(result["flags"].map { |f| f["code"] }).to eq([ "PRICE_SUSPICIOUS" ])
        expect(result["summary"]).to include("Failed to parse AI response")
        expect(result["confidence"]).to eq(0.3) # capped because flags exist
      end

      it "coerces non-numeric confidence values" do
        listing = create(:listing, price: 2_000_000.0)
        stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response(
          { verdict: "ok", flags: [], summary: "fine", confidence: "very high" }.to_json
        ))

        result = described_class.call(listing)
        expect(result["confidence"]).to eq(0.95) # default when AI confidence unusable
      end

      it "strips markdown fences from the AI response" do
        listing = create(:listing, price: 2_000_000.0)
        stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response("```json\n#{ok_ai_json}\n```"))

        expect(described_class.call(listing)["verdict"]).to eq("ok")
      end

      it "merges AI flags after deterministic ones, deduplicating by code:field" do
        listing = create(:listing, price: 50_000.0, living_area: 10_000.0) # $5/sqm → high det flag
        stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response(
          { verdict: "review",
            flags: [
              { code: "PRICE_PER_SQM_ANOMALY", severity: "high", message: "dup", field: "pricePerSqm" },
              { code: "AREA_MISMATCH", severity: "medium", message: "area looks off", field: "livingArea" }
            ],
            summary: "Issues found", confidence: 0.7 }.to_json
        ))

        result = described_class.call(listing)

        codes = result["flags"].map { |f| f["code"] }
        expect(codes).to eq(%w[PRICE_PER_SQM_ANOMALY AREA_MISMATCH])
        expect(result["flags"].first["message"]).to include("far below $10/sqm") # deterministic wins
        expect(result["summary"]).to include("1 threshold flag(s), 2 AI flag(s)")
      end
    end

    context "without an API key" do
      around { |example| with_env("ANTHROPIC_API_KEY" => nil) { example.run } }

      it "still applies deterministic checks (deterministic-only model)" do
        listing = create(:listing, price: 500.0, bedrooms: 99)

        result = described_class.call(listing)

        expect(WebMock).not_to have_requested(:post, anthropic_url)
        expect(result["verdict"]).to eq("reject") # two high-severity flags
        expect(result["flags"].map { |f| f["code"] }).to contain_exactly("PRICE_SUSPICIOUS", "DATA_ENTRY_ERROR")
        expect(AiParameterScan.last.model).to eq("deterministic-only")
        expect(result["summary"]).to include("AI analysis unavailable")
      end
    end
  end

  describe ".run_deterministic_checks" do
    def check(params)
      described_class.run_deterministic_checks(params)
    end

    it "flags absurd price per sqm" do
      flags = check("price" => 5_600_000.0, "livingArea" => 5_600_000.0)
      expect(flags.map { |f| f["code"] }).to include("PRICE_PER_SQM_ANOMALY", "AREA_MISMATCH", "DATA_ENTRY_ERROR")
    end

    it "skips price checks for price-on-request listings" do
      expect(check("price" => 500.0, "priceOnRequest" => true)).to be_empty
    end

    it "applies the high-cost-country tier using country code resolution" do
      flags = check("price" => 700_000.0, "livingArea" => 1000.0, "country" => "Spain",
                    "realEstateType" => "villa")
      anomaly = flags.find { |f| f["code"] == "PRICE_PER_SQM_ANOMALY" }
      expect(anomaly["severity"]).to eq("medium")
      expect(anomaly["message"]).to include("below $1,000/sqm minimum for residential properties in ES")
    end

    it "does not flag a normal luxury listing" do
      expect(check("price" => 2_000_000.0, "livingArea" => 400.0, "landArea" => 1500.0,
                   "bedrooms" => 5, "bathrooms" => 4, "realEstateType" => "villa",
                   "country" => "Spain")).to be_empty
    end
  end

  describe ".worst_verdict" do
    it "orders reject < review < ok" do
      expect(described_class.worst_verdict("ok", "review")).to eq("review")
      expect(described_class.worst_verdict("reject", "ok")).to eq("reject")
      expect(described_class.worst_verdict("ok", "ok")).to eq("ok")
    end
  end

  it "exposes the FLAG_CODES catalogue" do
    expect(described_class::FLAG_CODES.keys).to contain_exactly(
      "PRICE_SUSPICIOUS", "PRICE_PER_SQM_ANOMALY", "AREA_MISMATCH", "LOCATION_SUSPICIOUS",
      "CATEGORY_MISMATCH", "MISSING_CRITICAL_DATA", "PRICE_AREA_CONFLICT", "DATA_ENTRY_ERROR"
    )
  end
end
