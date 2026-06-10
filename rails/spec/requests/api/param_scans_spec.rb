require "rails_helper"

RSpec.describe "Api param scans", type: :request do
  include_examples "requires moderator", :get, -> { "/api/param-scans/recent" }
  include_examples "requires moderator", :get, -> { "/api/param-scans/stats" }
  include_examples "requires moderator", :get, -> { "/api/param-scans/by-je-id/123" }
  include_examples "requires moderator", :post, -> { "/api/listings/#{create(:listing).id}/param-scan" }

  describe "GET /api/param-scans/recent" do
    it "orders by scannedAt desc with limit" do
      create(:ai_parameter_scan, scanned_at: 1_000)
      newest = create(:ai_parameter_scan, scanned_at: 3_000)
      create(:ai_parameter_scan, scanned_at: 2_000)
      sign_in_as(create(:moderator, role: "viewer"))

      get "/api/param-scans/recent", params: { limit: 2 }
      expect(json.length).to eq(2)
      expect(json.first["_id"]).to eq(newest.id.to_s)
      expect(json.first["scannedAt"]).to eq(3_000)
    end
  end

  describe "GET /api/param-scans/stats" do
    it "aggregates verdicts and flag totals" do
      create(:ai_parameter_scan, verdict: "ok", flag_count: 0)
      create(:ai_parameter_scan, verdict: "review", flag_count: 2)
      create(:ai_parameter_scan, verdict: "reject", flag_count: 3)
      sign_in_as(create(:moderator))

      get "/api/param-scans/stats"
      expect(json).to eq(
        "total" => 3, "ok" => 1, "review" => 1, "reject" => 1, "totalFlags" => 5
      )
    end
  end

  describe "GET /api/param-scans/by-je-id/:jeId" do
    it "returns the scan for the jeId" do
      scan = create(:ai_parameter_scan)
      sign_in_as(create(:moderator))

      get "/api/param-scans/by-je-id/#{scan.je_id}"
      expect(json["_id"]).to eq(scan.id.to_s)
      expect(json["listingId"]).to eq(scan.listing_id.to_s)
    end

    it "returns null when missing" do
      sign_in_as(create(:moderator))
      get "/api/param-scans/by-je-id/00000000"
      expect(response.body).to eq("null")
    end
  end

  describe "POST /api/listings/:id/param-scan" do
    it "runs the AI param scan service" do
      listing = create(:listing)
      sign_in_as(create(:moderator))

      payload = { "scanId" => 1, "verdict" => "review", "flags" => [], "summary" => "s", "confidence" => 0.3 }
      expect(Ai::ParamScan).to receive(:call).with(listing).and_return(payload)

      post "/api/listings/#{listing.id}/param-scan"
      expect(response).to have_http_status(:ok)
      expect(json["verdict"]).to eq("review")
    end
  end
end
