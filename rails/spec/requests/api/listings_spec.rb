require "rails_helper"

RSpec.describe "Api listings", type: :request do
  include_examples "requires moderator", :get, -> { "/api/listings/pending" }
  include_examples "requires moderator", :get, -> { "/api/listings/recent" }
  include_examples "requires moderator", :get, -> { "/api/listings?status=manual" }
  include_examples "requires moderator", :get, -> { "/api/listings/stats" }
  include_examples "requires moderator", :get, -> { "/api/listings/#{create(:listing).id}" }
  include_examples "requires moderator", :get, -> { "/api/listings/by-je-id/#{create(:listing).je_id}" }
  include_examples "requires moderator", :post, -> { "/api/listings/#{create(:listing).id}/moderate" }

  describe "GET /api/listings/pending" do
    it "returns the manual queue newest first, viewer included" do
      old = create(:listing, moderation_status: "manual", created_at: 2.days.ago)
      new = create(:listing, moderation_status: "manual", created_at: 1.hour.ago)
      create(:listing, moderation_status: "approved")
      sign_in_as(create(:moderator, role: "viewer"))

      get "/api/listings/pending"
      expect(response).to have_http_status(:ok)
      expect(json.map { |l| l["_id"] }).to eq([ new.id.to_s, old.id.to_s ])
      expect(json.first["jeId"]).to eq(new.je_id)
      expect(json.first["moderationStatus"]).to eq("manual")
    end
  end

  describe "GET /api/listings/recent" do
    it "orders by importedAt desc and honours limit" do
      a = create(:listing, imported_at: 1_000)
      b = create(:listing, imported_at: 3_000)
      create(:listing, imported_at: 2_000)
      sign_in_as(create(:moderator))

      get "/api/listings/recent", params: { limit: 2 }
      expect(json.length).to eq(2)
      expect(json.first["_id"]).to eq(b.id.to_s)
      expect(json.last["importedAt"]).to eq(2_000)
      expect(a.id).to be_present
    end
  end

  describe "GET /api/listings?status=" do
    it "filters by moderation status" do
      rejected = create(:listing, moderation_status: "rejected")
      create(:listing, moderation_status: "approved")
      sign_in_as(create(:moderator))

      get "/api/listings", params: { status: "rejected" }
      expect(json.length).to eq(1)
      expect(json.first["_id"]).to eq(rejected.id.to_s)
    end
  end

  describe "GET /api/listings/stats" do
    it "counts by status (noticed maps to notice)" do
      create(:listing, moderation_status: "approved")
      create(:listing, moderation_status: "rejected")
      create(:listing, moderation_status: "notice")
      create(:listing, moderation_status: "manual")
      create(:listing, moderation_status: "pending")
      sign_in_as(create(:moderator))

      get "/api/listings/stats"
      expect(json).to eq(
        "total" => 5, "approved" => 1, "rejected" => 1,
        "noticed" => 1, "manual" => 1, "pending" => 1
      )
    end
  end

  describe "GET /api/listings/:id" do
    it "serializes a listing as a Convex doc (jsonb verbatim, ms timestamps)" do
      listing = create(:listing, image_urls: [ "https://img.jamesedition.com/1.jpg" ],
                                 price_usd: 1_000_000.0, accuracy_flags: %w[PRICE_SUSPICIOUS])
      sign_in_as(create(:moderator))

      get "/api/listings/#{listing.id}"
      expect(json["_id"]).to eq(listing.id.to_s)
      expect(json["imageUrls"]).to eq([ "https://img.jamesedition.com/1.jpg" ])
      expect(json["priceUsd"]).to eq(1_000_000.0)
      expect(json["accuracyFlags"]).to eq([ "PRICE_SUSPICIOUS" ])
      expect(json["importedAt"]).to eq(listing.imported_at)
    end

    it "404s for unknown ids" do
      sign_in_as(create(:moderator))
      get "/api/listings/999999"
      expect(response).to have_http_status(:not_found)
      expect(json["error"]).to be_present
    end
  end

  describe "GET /api/listings/by-je-id/:jeId" do
    it "finds by jeId" do
      listing = create(:listing)
      sign_in_as(create(:moderator))

      get "/api/listings/by-je-id/#{listing.je_id}"
      expect(json["_id"]).to eq(listing.id.to_s)
    end

    it "returns null for unknown jeIds" do
      sign_in_as(create(:moderator))
      get "/api/listings/by-je-id/00000000"
      expect(response).to have_http_status(:ok)
      expect(response.body).to eq("null")
    end
  end

  describe "POST /api/listings/:id/moderate" do
    it "runs the moderation runner and returns its result" do
      listing = create(:listing)
      moderator = create(:moderator)
      sign_in_as(moderator)

      result = { outcome: "approved", ruleMatches: [], llmTriggered: false, confidence: 1.0 }
      expect(Moderation::Runner).to receive(:call)
        .with(listing, moderator: have_attributes(id: moderator.id))
        .and_return(result)

      post "/api/listings/#{listing.id}/moderate"
      expect(response).to have_http_status(:ok)
      expect(json["outcome"]).to eq("approved")
      expect(json["llmTriggered"]).to be(false)
    end
  end

  describe "POST /api/moderate-by-id" do
    include_examples "requires moderator", :post, -> { "/api/moderate-by-id" }, { inputs: [] }

    it "delegates to Listings::FetchAndModerate" do
      moderator = sign_in_as(create(:moderator))
      payload = {
        success: true, count: 1, successCount: 1, errorCount: 0,
        results: [ { jeId: "12345678", input: "12345678", outcome: "approved", status: "ok" } ]
      }
      expect(Listings::FetchAndModerate).to receive(:call)
        .with(inputs: [ "12345678" ], moderator: have_attributes(id: moderator.id))
        .and_return(payload)

      post "/api/moderate-by-id", params: { inputs: [ "12345678" ] }, as: :json
      expect(response).to have_http_status(:ok)
      expect(json["successCount"]).to eq(1)
      expect(json["results"].first["jeId"]).to eq("12345678")
    end
  end
end
