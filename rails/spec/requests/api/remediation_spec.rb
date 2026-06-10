require "rails_helper"

RSpec.describe "Api remediation", type: :request do
  include_examples "requires moderator", :get, -> { "/api/remediation/stats" }
  include_examples "requires moderator", :get, -> { "/api/remediation/recent" }
  include_examples "requires moderator", :post, -> { "/api/remediation/batch-scan" }

  describe "GET /api/remediation/stats" do
    it "ports the TS aggregation (error types, severities, feeds, offices, trend)" do
      now_ms = (Time.current.to_f * 1000).to_i
      create(:remediation_result,
             has_fixable_errors: true, error_count: 2, total_confidence: 0.8,
             feed_source: "Kyero", office: "123", scanned_at: now_ms,
             suggestions: [
               { "errorType" => "bedroom_anomaly", "severity" => "high", "field" => "bedrooms",
                 "currentValue" => "55", "suggestedFix" => "5", "explanation" => "typo", "confidence" => 0.9 },
               { "errorType" => "price_anomaly", "severity" => "medium", "field" => "price",
                 "currentValue" => "1", "suggestedFix" => "1000000", "explanation" => "x", "confidence" => 0.8 }
             ],
             description_score: { "overall" => 40, "length" => "too_short", "hasPlaceholder" => false,
                                  "hasAllCaps" => false, "hasAutoTranslateArtifacts" => false })
      create(:remediation_result, feed_source: "Kyero", scanned_at: now_ms)
      sign_in_as(create(:moderator, role: "viewer"))

      get "/api/remediation/stats"
      expect(json["totalScanned"]).to eq(2)
      expect(json["withErrors"]).to eq(1)
      expect(json["totalSuggestions"]).to eq(2)
      expect(json["errorRate"]).to eq(50)
      expect(json["avgConfidence"]).to eq(80)
      expect(json["errorTypeCounts"]).to contain_exactly(
        { "type" => "bedroom_anomaly", "count" => 1 },
        { "type" => "price_anomaly", "count" => 1 }
      )
      expect(json["severityCounts"]).to eq("high" => 1, "medium" => 1, "low" => 0)
      expect(json["feedSourceCounts"]).to eq([ { "name" => "Kyero", "total" => 2, "withErrors" => 1 } ])
      expect(json["officeCounts"]).to contain_exactly(
        { "name" => "123", "total" => 1, "withErrors" => 1, "errorCount" => 2 },
        { "name" => "Unknown", "total" => 1, "withErrors" => 0, "errorCount" => 0 }
      )
      expect(json["avgDescScore"]).to eq(40)
      expect(json["dailyTrend"].length).to eq(14)
      expect(json["dailyTrend"].last["scanned"]).to eq(2)
    end
  end

  describe "GET /api/remediation/recent" do
    it "returns results newest first enriched with listing data" do
      listing = create(:listing, title: "Villa", country: "Spain")
      create(:remediation_result, scanned_at: 1_000)
      newest = create(:remediation_result, listing: listing, scanned_at: 2_000)
      sign_in_as(create(:moderator))

      get "/api/remediation/recent"
      expect(json.length).to eq(2)
      expect(json.first["_id"]).to eq(newest.id.to_s)
      expect(json.first["listing"]).to include("title" => "Villa", "country" => "Spain")
    end

    it "supports errorsOnly, limit and offset" do
      create(:remediation_result, has_fixable_errors: true, error_count: 1, scanned_at: 3_000)
      with_errors = create(:remediation_result, has_fixable_errors: true, error_count: 1, scanned_at: 2_000)
      create(:remediation_result, scanned_at: 1_000)
      sign_in_as(create(:moderator))

      get "/api/remediation/recent", params: { errorsOnly: true, limit: 1, offset: 1 }
      expect(json.length).to eq(1)
      expect(json.first["_id"]).to eq(with_errors.id.to_s)
    end
  end

  describe "POST /api/remediation/batch-scan" do
    it "delegates to the AI remediation scanner" do
      sign_in_as(create(:moderator))
      payload = { scanned: 2, errors: 0, withIssues: 1, results: [] }
      expect(Ai::RemediationScanner).to receive(:batch_scan).with(limit: 5).and_return(payload)

      post "/api/remediation/batch-scan", params: { limit: 5 }, as: :json
      expect(json["scanned"]).to eq(2)
    end
  end
end
