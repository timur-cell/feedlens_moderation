require "rails_helper"

# A moderator can make an override permanent ("approve/reject forever"): the
# listing is locked and no automated path — re-moderation, moderate-by-id
# re-import, or a push-flagged webhook replay — may change its status until a
# moderator explicitly unlocks it.
RSpec.describe "Moderation lock (permanent decisions)", type: :request do
  let(:moderator) { create(:moderator, name: "Anna") }

  def override!(result, permanent:)
    post "/api/moderation-results/#{result.id}/override",
         params: { newOutcome: "rejected", reason: "fraud", permanent: permanent }, as: :json
  end

  describe "override with permanent: true" do
    it "locks the listing and records who locked it" do
      listing = create(:listing, moderation_status: "manual")
      result = create(:moderation_result, listing: listing, je_id: listing.je_id, outcome: "manual")
      sign_in_as(moderator)

      override!(result, permanent: true)

      expect(response).to have_http_status(:ok)
      listing.reload
      expect(listing.moderation_status).to eq("rejected")
      expect(listing.moderation_locked).to be(true)
      expect(listing.moderation_locked_by).to eq("Anna")
      expect(listing.moderation_locked_at).to be_present
    end

    it "does not lock without the permanent flag" do
      listing = create(:listing, moderation_status: "manual")
      result = create(:moderation_result, listing: listing, je_id: listing.je_id, outcome: "manual")
      sign_in_as(moderator)

      override!(result, permanent: false)

      expect(listing.reload.moderation_locked).to be(false)
    end
  end

  describe "guards on automated paths" do
    let(:listing) do
      create(:listing, je_id: "16680095", moderation_status: "rejected",
                       moderation_locked: true, moderation_locked_by: "Anna",
                       moderation_locked_at: 1_700_000_000_000)
    end

    it "Moderation::Runner skips a locked listing without touching it" do
      create(:rule, name: "any", category: "simple_code", tier: "auto", action: "reject",
                    config: { "conditions" => [ { "field" => "price", "operator" => "<", "value" => 1 } ] })

      expect do
        result = Moderation::Runner.call(listing)
        expect(result[:outcome]).to eq("rejected")
        expect(result[:skipped]).to eq("locked")
      end.not_to change { [ listing.reload.moderation_status, ModerationResult.count ] }
    end

    it "POST /api/listings/:id/moderate returns the locked outcome unchanged" do
      sign_in_as(moderator)
      post "/api/listings/#{listing.id}/moderate"

      expect(response).to have_http_status(:ok)
      expect(json["skipped"]).to eq("locked")
      expect(listing.reload.moderation_status).to eq("rejected")
    end

    it "FetchAndModerate skips a locked listing instead of resetting it to pending" do
      result = Listings::FetchAndModerate.process_one(listing.je_id)

      expect(result[:status]).to eq("skipped")
      expect(result[:locked]).to be(true)
      expect(listing.reload.moderation_status).to eq("rejected")
    end

    it "push-flagged webhook records accuracy data but does not flip a locked listing to manual" do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("LAS_PUSH_API_KEY").and_return("test-las-push-key")

      body = {
        listings: [ {
          "listing_id" => listing.je_id, "total_score" => 42.0,
          "user_message" => "new message", "ai_validated_at" => "2026-06-11T00:00:00Z"
        } ]
      }
      post "/api/push-flagged", params: body.to_json,
                                headers: { "CONTENT_TYPE" => "application/json",
                                           "X-Api-Key" => "test-las-push-key" }

      expect(response).to have_http_status(:ok)
      listing.reload
      expect(listing.accuracy_score).to eq(42.0)
      expect(listing.moderation_status).to eq("rejected")
    end
  end

  describe "POST /api/listings/:id/unlock" do
    it "releases the lock so re-moderation works again" do
      listing = create(:listing, moderation_status: "rejected",
                                 moderation_locked: true, moderation_locked_by: "Anna",
                                 moderation_locked_at: 1_700_000_000_000)
      sign_in_as(moderator)

      post "/api/listings/#{listing.id}/unlock"

      expect(response).to have_http_status(:ok)
      listing.reload
      expect(listing.moderation_locked).to be(false)
      expect(listing.moderation_locked_by).to be_nil
      expect(listing.moderation_locked_at).to be_nil
    end
  end
end
