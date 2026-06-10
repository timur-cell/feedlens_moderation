require "rails_helper"

RSpec.describe "Api dashboard", type: :request do
  include_examples "requires moderator", :get, -> { "/api/dashboard/stats" }
  include_examples "requires moderator", :get, -> { "/api/dashboard/export-csv" }

  # 2026-06-01T12:00:00Z / 2026-06-02T12:00:00Z in epoch ms
  let(:day1) { Time.utc(2026, 6, 1, 12).to_i * 1000 }
  let(:day2) { Time.utc(2026, 6, 2, 12).to_i * 1000 }

  describe "GET /api/dashboard/stats" do
    it "returns totals with auto/manual split and daily buckets" do
      create(:moderation_result, outcome: "approved", processed_at: day1)
      create(:moderation_result, outcome: "rejected", processed_at: day1, overridden_by: "Olga")
      create(:moderation_result, outcome: "notice", processed_at: day2)
      create(:moderation_result, outcome: "manual", processed_at: day2)
      sign_in_as(create(:moderator, role: "viewer"))

      get "/api/dashboard/stats"
      stats = json["stats"]
      expect(stats).to include(
        "total" => 4, "approved" => 1, "rejected" => 1, "noticed" => 1, "manual" => 1,
        "autoTotal" => 3, "manualTotal" => 1,
        "autoApproved" => 1, "manualApproved" => 0,
        "autoRejected" => 0, "manualRejected" => 1,
        "autoNoticed" => 1, "manualNoticed" => 0
      )

      daily = json["dailyData"]
      expect(daily.map { |d| d["date"] }).to eq(%w[2026-06-01 2026-06-02])
      expect(daily.first).to include("total" => 2, "approvedAuto" => 1, "rejectedManual" => 1, "manualQueue" => 0)
      expect(daily.last).to include("total" => 2, "noticedAuto" => 1, "manualQueue" => 1)
    end

    it "filters by startDate/endDate (epoch ms)" do
      create(:moderation_result, outcome: "approved", processed_at: day1)
      create(:moderation_result, outcome: "rejected", processed_at: day2)
      sign_in_as(create(:moderator))

      get "/api/dashboard/stats", params: { startDate: day2 - 1000, endDate: day2 + 1000 }
      expect(json["stats"]["total"]).to eq(1)
      expect(json["stats"]["rejected"]).to eq(1)
      expect(json["dailyData"].length).to eq(1)
    end
  end

  describe "GET /api/dashboard/export-csv" do
    it "returns export rows in the TS shape" do
      listing = create(:listing, title: "Villa", category: "real_estate", country: "Spain",
                                 city: "Marbella", price_usd: 2_500_000.0)
      create(:moderation_result,
             listing: listing, je_id: listing.je_id, outcome: "rejected", processed_at: day1,
             rule_matches: [ { "ruleName" => "price_low" }, { "ruleName" => "bad_condition" } ],
             llm_triggered: true, confidence: 0.92, overridden_by: "Olga")
      sign_in_as(create(:moderator))

      get "/api/dashboard/export-csv"
      expect(json.length).to eq(1)
      expect(json.first).to eq(
        "jeId" => listing.je_id,
        "title" => "Villa",
        "outcome" => "rejected",
        "category" => "real_estate",
        "country" => "Spain",
        "city" => "Marbella",
        "price" => 2_500_000.0,
        "rules" => "price_low; bad_condition",
        "llmTriggered" => "Yes",
        "confidence" => 0.92,
        "processedAt" => "2026-06-01T12:00:00.000Z",
        "overriddenBy" => "Olga"
      )
    end

    it "uses empty strings for missing values" do
      create(:moderation_result, processed_at: day1, confidence: nil)
      sign_in_as(create(:moderator))

      get "/api/dashboard/export-csv"
      row = json.first
      expect(row["confidence"]).to eq("")
      expect(row["overriddenBy"]).to eq("")
      expect(row["llmTriggered"]).to eq("No")
    end
  end
end
