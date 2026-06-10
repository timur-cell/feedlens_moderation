require "rails_helper"

RSpec.describe "Api notes", type: :request do
  include_examples "requires moderator", :get, -> { "/api/listings/#{create(:listing).id}/notes" }
  include_examples "requires moderator", :post, -> { "/api/listings/#{create(:listing).id}/notes" }, { content: "x" }
  include_examples "requires moderator", :delete, -> { "/api/notes/#{create(:moderation_note).id}" }

  describe "GET /api/listings/:listingId/notes" do
    it "returns the listing's notes newest first" do
      listing = create(:listing)
      old = create(:moderation_note, listing: listing, created_at_ms: 1_000)
      new = create(:moderation_note, listing: listing, created_at_ms: 2_000)
      create(:moderation_note) # other listing
      sign_in_as(create(:moderator, role: "viewer"))

      get "/api/listings/#{listing.id}/notes"
      expect(json.map { |n| n["_id"] }).to eq([ new.id.to_s, old.id.to_s ])
      expect(json.first["listingId"]).to eq(listing.id.to_s)
    end
  end

  describe "POST /api/listings/:listingId/notes" do
    it "creates a note authored by the session moderator with the listing's jeId" do
      listing = create(:listing)
      moderator = create(:moderator, name: "Nina", role: "moderator")
      sign_in_as(moderator)

      post "/api/listings/#{listing.id}/notes", params: { content: "Looks suspicious" }, as: :json
      expect(response).to have_http_status(:ok)

      note = ModerationNote.last
      expect(note.author_name).to eq("Nina")
      expect(note.author_role).to eq("moderator")
      expect(note.je_id).to eq(listing.je_id)
      expect(note.content).to eq("Looks suspicious")
      expect(note.created_at_ms).to be_present
      expect(json["authorName"]).to eq("Nina")
    end

    it "422s without content" do
      listing = create(:listing)
      sign_in_as(create(:moderator))

      post "/api/listings/#{listing.id}/notes", params: {}, as: :json
      expect(response).to have_http_status(422)
    end
  end

  describe "DELETE /api/notes/:id" do
    it "deletes the note" do
      note = create(:moderation_note)
      sign_in_as(create(:moderator))
      expect { delete "/api/notes/#{note.id}" }.to change(ModerationNote, :count).by(-1)
    end
  end
end
