require "rails_helper"

RSpec.describe Ai::RemediationScanner do
  let(:anthropic_url) { "https://api.anthropic.com/v1/messages" }

  def claude_response(text)
    {
      model: "claude-sonnet-4-20250514",
      content: [ { type: "text", text: text } ],
      usage: { input_tokens: 400, output_tokens: 120 }
    }.to_json
  end

  around { |example| with_env("ANTHROPIC_API_KEY" => "test-key") { example.run } }

  describe ".scan_listing" do
    it "calls Claude Sonnet (max_tokens 1200, temperature 0), filters low-confidence suggestions and persists" do
      listing = create(:listing, bedrooms: 55, price: 1_000_000.0)

      claude_stub = stub_request(:post, anthropic_url)
        .with do |req|
          body = JSON.parse(req.body)
          body["model"] == "claude-sonnet-4-20250514" &&
            body["max_tokens"] == 1200 &&
            body["temperature"] == 0 &&
            body.dig("messages", 0, "content").include?("Find CLEAR, FIXABLE data errors")
        end
        .to_return(status: 200, body: claude_response({
          hasFixableErrors: true,
          errorCount: 2,
          suggestions: [
            { errorType: "bedroom_anomaly", severity: "high", field: "bedrooms",
              currentValue: "55", suggestedFix: "5", explanation: "Likely typo", confidence: 0.9 },
            { errorType: "price_anomaly", severity: "low", field: "price",
              currentValue: "1000000", suggestedFix: "?", explanation: "Maybe", confidence: 0.5 } # < 0.75 → dropped
          ],
          descriptionScore: { overall: 40, length: "too_short", hasPlaceholder: false,
                              hasAllCaps: false, hasAutoTranslateArtifacts: false }
        }.to_json))

      result = described_class.scan_listing(listing)

      expect(claude_stub).to have_been_requested
      expect(result["hasFixableErrors"]).to be(true)
      expect(result["errorCount"]).to eq(1) # low-confidence suggestion filtered
      expect(result["suggestions"].length).to eq(1)
      expect(result["suggestions"].first["errorType"]).to eq("bedroom_anomaly")
      expect(result["totalConfidence"]).to eq(0.9)

      record = RemediationResult.last
      expect(record.listing).to eq(listing)
      expect(record.error_count).to eq(1)
      expect(record.model).to eq("claude-sonnet-4-20250514")
      expect(record.description_score["length"]).to eq("too_short")
    end

    it "returns the cached result without HTTP when already scanned" do
      listing = create(:listing)
      existing = create(:remediation_result, listing: listing, has_fixable_errors: true, error_count: 3)

      result = described_class.scan_listing(listing)

      expect(result["resultId"]).to eq(existing.id)
      expect(result["errorCount"]).to eq(3)
      expect(WebMock).not_to have_requested(:post, anthropic_url)
    end

    it "treats malformed JSON as no fixable errors" do
      listing = create(:listing)
      stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response("nope, no json"))

      result = described_class.scan_listing(listing)

      expect(result["hasFixableErrors"]).to be(false)
      expect(result["errorCount"]).to eq(0)
      expect(result["suggestions"]).to eq([])
    end

    it "coerces string confidences in suggestions" do
      listing = create(:listing)
      stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response({
        hasFixableErrors: true, errorCount: 1,
        suggestions: [ { errorType: "year_anomaly", severity: "high", field: "year",
                         currentValue: 2099, suggestedFix: 2009, explanation: "impossible", confidence: "0.8" } ]
      }.to_json))

      result = described_class.scan_listing(listing)
      suggestion = result["suggestions"].first
      expect(suggestion["confidence"]).to eq(0.8)
      expect(suggestion["currentValue"]).to eq("2099") # coerced to string
    end
  end

  describe ".batch_scan" do
    it "discovers unscanned listings with moderation issues and scans them" do
      flagged = create(:listing)
      create(:moderation_result, listing: flagged, outcome: "manual", processed_at: 1)
      clean = create(:listing)
      create(:moderation_result, listing: clean, outcome: "approved", rule_matches: [], processed_at: 2)
      already = create(:listing)
      create(:moderation_result, listing: already, outcome: "rejected", processed_at: 3)
      create(:remediation_result, listing: already)

      stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response(
        { hasFixableErrors: false, errorCount: 0, suggestions: [] }.to_json
      ))

      result = described_class.batch_scan(max_listings: 10)

      expect(result[:scanned]).to eq(1)
      expect(result[:errors]).to eq(0)
      expect(result[:results].first[:jeId]).to eq(flagged.je_id)
      expect(RemediationResult.where(listing_id: flagged.id).count).to eq(1)
      expect(RemediationResult.where(listing_id: clean.id).count).to eq(0)
    end

    it "scans an explicit set of listing ids" do
      listing = create(:listing)
      stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response(
        { hasFixableErrors: false, errorCount: 0, suggestions: [] }.to_json
      ))

      result = described_class.batch_scan(listing_ids: [ listing.id ])

      expect(result[:scanned]).to eq(1)
      expect(result[:withIssues]).to eq(0)
    end

    it "counts failures without aborting the batch" do
      bad = create(:listing)
      create(:moderation_result, listing: bad, outcome: "manual", processed_at: 1)
      stub_request(:post, anthropic_url).to_return(status: 500, body: "boom")

      result = described_class.batch_scan(max_listings: 5)

      expect(result[:scanned]).to eq(0)
      expect(result[:errors]).to eq(1)
    end

    it "raises when no API key is configured" do
      with_env("ANTHROPIC_API_KEY" => nil) do
        expect { described_class.batch_scan(max_listings: 1) }
          .to raise_error(Ai::ClaudeClient::MissingApiKeyError)
      end
    end
  end
end
