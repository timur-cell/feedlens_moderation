require "rails_helper"

RSpec.describe "Api moderation results", type: :request do
  include_examples "requires moderator", :get, -> { "/api/moderation-results/recent" }
  include_examples "requires moderator", :get, -> { "/api/moderation-results/by-outcome?outcome=approved" }
  include_examples "requires moderator", :get, -> { "/api/moderation-results/for-listing/#{create(:listing).id}" }
  include_examples "requires moderator", :get, -> { "/api/moderation-results/by-rule?ruleName=x" }
  include_examples "requires moderator", :get, -> { "/api/moderation-results/latest-by-je-id/123" }
  include_examples "requires moderator", :post,
                   -> { "/api/moderation-results/#{create(:moderation_result).id}/override" },
                   { newOutcome: "approved" }
                   { newOutcome: "approved" }

  describe "GET /api/moderation-results/recent" do
    it "orders by processedAt desc with limit" do
      old = create(:moderation_result, processed_at: 1_000)
      new = create(:moderation_result, processed_at: 2_000)
      sign_in_as(create(:moderator, role: "viewer"))

      get "/api/moderation-results/recent", params: { limit: 1 }
      expect(json.length).to eq(1)
      expect(json.first["_id"]).to eq(new.id.to_s)
      expect(json.first["listingId"]).to eq(new.listing_id.to_s)
      expect(old.id).to be_present
    end
  end

  describe "GET /api/moderation-results/by-outcome" do
    it "filters by outcome" do
      rejected = create(:moderation_result, outcome: "rejected")
      create(:moderation_result, outcome: "approved")
      sign_in_as(create(:moderator))

      get "/api/moderation-results/by-outcome", params: { outcome: "rejected" }
      expect(json.length).to eq(1)
      expect(json.first["_id"]).to eq(rejected.id.to_s)
    end
  end

  describe "GET /api/moderation-results/for-listing/:listingId" do
    it "returns all results for the listing, newest first" do
      listing = create(:listing)
      first = create(:moderation_result, listing: listing)
      second = create(:moderation_result, listing: listing)
      create(:moderation_result)
      sign_in_as(create(:moderator))

      get "/api/moderation-results/for-listing/#{listing.id}"
      expect(json.map { |r| r["_id"] }).to eq([ second.id.to_s, first.id.to_s ])
    end
  end

  describe "GET /api/moderation-results/by-rule" do
    it "returns totals, percentage and items enriched with listings" do
      listing = create(:listing, title: "Matched listing")
      matched = create(:moderation_result, listing: listing, processed_at: 2_000,
                                           rule_matches: [ { "ruleName" => "price_low", "tier" => "auto" } ])
      create(:moderation_result, rule_matches: [ { "ruleName" => "other_rule" } ])
      create(:moderation_result, rule_matches: [])
      create(:moderation_result, listing: listing, processed_at: 1_000,
                                 rule_matches: [ { "ruleName" => "price_low" }, { "ruleName" => "other_rule" } ])
      sign_in_as(create(:moderator))

      get "/api/moderation-results/by-rule", params: { ruleName: "price_low" }
      expect(json["total"]).to eq(2)
      expect(json["totalResults"]).to eq(4)
      expect(json["percentage"]).to eq("50.0")
      expect(json["items"].length).to eq(2)
      expect(json["items"].first["_id"]).to eq(matched.id.to_s)
      expect(json["items"].first["listing"]["title"]).to eq("Matched listing")
    end

    it "honours the limit and reports zero percentage with no results" do
      sign_in_as(create(:moderator))
      get "/api/moderation-results/by-rule", params: { ruleName: "anything" }
      expect(json).to eq("total" => 0, "totalResults" => 0, "percentage" => "0", "items" => [])
    end
  end

  describe "GET /api/moderation-results/latest-by-je-id/:jeId" do
    it "returns the newest result for the jeId" do
      listing = create(:listing)
      create(:moderation_result, listing: listing, je_id: listing.je_id)
      latest = create(:moderation_result, listing: listing, je_id: listing.je_id)
      sign_in_as(create(:moderator))

      get "/api/moderation-results/latest-by-je-id/#{listing.je_id}"
      expect(json["_id"]).to eq(latest.id.to_s)
    end

    it "returns null when none exist" do
      sign_in_as(create(:moderator))
      get "/api/moderation-results/latest-by-je-id/00000000"
      expect(response.body).to eq("null")
    end
  end

  describe "POST /api/moderation-results/:id/override" do
    it "stores originalOutcome, attributes the moderator, updates the listing and logs activity" do
      listing = create(:listing, moderation_status: "manual")
      result = create(:moderation_result, listing: listing, outcome: "manual", seller_message: "old msg")
      moderator = create(:moderator, name: "Olga Moderator")
      sign_in_as(moderator)

      post "/api/moderation-results/#{result.id}/override",
           params: { newOutcome: "rejected", reason: "spam", sellerMessage: "Listing removed",
                     refuseReasonType: "illegal" }, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["success"]).to be(true)

      result.reload
      expect(result.original_outcome).to eq("manual")
      expect(result.outcome).to eq("rejected")
      expect(result.overridden_by).to eq("Olga Moderator")
      expect(result.overridden_at).to be_present
      expect(result.override_reason).to eq("spam")
      expect(result.seller_message).to eq("Listing removed")
      expect(result.refuse_reason_type).to eq("illegal")
      expect(listing.reload.moderation_status).to eq("rejected")

      expect(moderator.reload.action_count).to eq(1)
      activity = ModeratorActivity.where(moderator_id: moderator.id).last
      expect(activity.action).to eq("override_decision")
      expect(activity.target_id).to eq(result.id.to_s)
    end

    it "preserves the first originalOutcome on repeat overrides and keeps the old seller message" do
      result = create(:moderation_result, outcome: "approved")
      sign_in_as(create(:moderator))

      post "/api/moderation-results/#{result.id}/override", params: { newOutcome: "rejected" }, as: :json
      post "/api/moderation-results/#{result.id}/override", params: { newOutcome: "notice" }, as: :json

      result.reload
      expect(result.original_outcome).to eq("approved")
      expect(result.outcome).to eq("notice")
    end

    it "404s for unknown results" do
      sign_in_as(create(:moderator))
      post "/api/moderation-results/999999/override", params: { newOutcome: "approved" }, as: :json
      expect(response).to have_http_status(:not_found)
    end
  end
end
