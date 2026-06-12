require "rails_helper"

# Covers the Phase 3 async ingestion path: heavy fetch/vision/LLM work is moved
# off the request thread onto Solid Queue. The synchronous default behaviour is
# still exercised by listings_spec.rb / fetch_and_moderate_spec.rb.
RSpec.describe "Async moderation", type: :request do
  include ActiveJob::TestHelper

  describe "POST /api/moderate-by-id with async: true" do
    it "enqueues one FetchAndModerateJob per input and returns 202 without running inline" do
      moderator = sign_in_as(create(:moderator))
      expect(Listings::FetchAndModerate).not_to receive(:process_one)

      expect do
        post "/api/moderate-by-id", params: { inputs: %w[16680095 22223333], async: true }, as: :json
      end.to have_enqueued_job(FetchAndModerateJob).with("16680095", moderator.id)
        .and have_enqueued_job(FetchAndModerateJob).with("22223333", moderator.id)

      expect(response).to have_http_status(:accepted)
      expect(json["status"]).to eq("queued")
      expect(json["queued"]).to eq(2)
    end
  end

  describe "POST /api/listings/:id/moderate with async: true" do
    it "enqueues a ModerateListingJob and returns 202 without running the runner inline" do
      listing = create(:listing)
      moderator = sign_in_as(create(:moderator))
      expect(Moderation::Runner).not_to receive(:call)

      expect do
        post "/api/listings/#{listing.id}/moderate", params: { async: true }, as: :json
      end.to have_enqueued_job(ModerateListingJob).with(listing.id, moderator.id)

      expect(response).to have_http_status(:accepted)
      expect(json["status"]).to eq("queued")
      expect(json["listingId"]).to eq(listing.id)
    end
  end

  describe "oversized synchronous batch safety valve" do
    it "auto-routes a batch larger than MAX_SYNC_INPUTS to the queue" do
      sign_in_as(create(:moderator))
      inputs = (1..(Listings::FetchAndModerate::MAX_SYNC_INPUTS + 1)).map { |n| (10_000_000 + n).to_s }
      expect(Listings::FetchAndModerate).not_to receive(:process_one)

      expect do
        post "/api/moderate-by-id", params: { inputs: inputs }, as: :json
      end.to have_enqueued_job(FetchAndModerateJob).exactly(inputs.length).times

      expect(json["status"]).to eq("queued")
      expect(json["queued"]).to eq(inputs.length)
    end
  end
end
