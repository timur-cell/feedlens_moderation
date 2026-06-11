require "rails_helper"

RSpec.describe "Api push-flagged", type: :request do
  let(:api_key) { "test-las-push-key" }
  let(:headers) { { "X-Api-Key" => api_key, "CONTENT_TYPE" => "application/json" } }

  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("LAS_PUSH_API_KEY").and_return(api_key)
  end

  def push(body, hdrs = headers)
    post "/api/push-flagged", params: body.is_a?(String) ? body : body.to_json, headers: hdrs
  end

  describe "authentication" do
    it "401s without a key" do
      push({ listings: [ {} ] }, { "CONTENT_TYPE" => "application/json" })
      expect(response).to have_http_status(:unauthorized)
      expect(json["error"]).to eq("Unauthorized")
    end

    it "401s with a wrong key" do
      push({ listings: [ {} ] }, headers.merge("X-Api-Key" => "nope"))
      expect(response).to have_http_status(:unauthorized)
    end

    it "401s when the env key is unset" do
      allow(ENV).to receive(:[]).with("LAS_PUSH_API_KEY").and_return(nil)
      push({ listings: [ {} ] })
      expect(response).to have_http_status(:unauthorized)
    end

    it "accepts the lowercase x-api-key header" do
      push({ listings: [ { listing_id: 111 } ] }, { "x-api-key" => api_key, "CONTENT_TYPE" => "application/json" })
      expect(response).to have_http_status(:ok)
    end
  end

  describe "payload validation" do
    it "400s on invalid JSON" do
      push("{not json", headers)
      expect(response).to have_http_status(:bad_request)
      expect(json["error"]).to eq("Invalid JSON")
    end

    it "400s without a listings array" do
      push({ nope: true })
      expect(response).to have_http_status(:bad_request)
      expect(json["error"]).to eq("listings array required")
    end

    it "400s with an empty listings array" do
      push({ listings: [] })
      expect(response).to have_http_status(:bad_request)
    end
  end

  describe "create path" do
    it "creates a listing with mapped fields, manual status, accuracy data and enqueues enrichment" do
      body = {
        listings: [ {
          listing_id: 16_680_095,
          headline: "Sea View Villa",
          price_cents: 250_000_000,
          currency: "EUR",
          real_estate_type: "villa",
          country: "Spain",
          city: "Marbella",
          living_area_sqm: 420,
          land_area_sqm: 1200,
          bedrooms: 5,
          bathrooms: 4,
          account_type: "freemium",
          office_id: 9981,
          total_score: 0.42,
          flags: %w[PRICE_SUSPICIOUS],
          user_message: "Please check the price",
          action: "review",
          ai_validated_at: "2026-06-01T10:00:00Z"
        } ]
      }

      expect { push(body) }.to have_enqueued_job(EnrichListingJob).with("16680095")
      expect(response).to have_http_status(:ok)
      expect(json).to include("processed" => 1, "created" => 1, "updated" => 0, "skipped" => 0, "errors" => [])

      listing = Listing.find_by(je_id: "16680095")
      expect(listing.title).to eq("Sea View Villa")
      expect(listing.price).to eq(2_500_000.0)
      expect(listing.currency).to eq("EUR")
      expect(listing.category).to eq("real_estate")
      expect(listing.office_subscription).to eq("freemium")
      expect(listing.office).to eq("9981")
      expect(listing.moderation_status).to eq("manual")
      expect(listing.accuracy_score).to eq(0.42)
      expect(listing.accuracy_flags).to eq(%w[PRICE_SUSPICIOUS])
      expect(listing.accuracy_user_message).to eq("Please check the price")
      expect(listing.accuracy_action).to eq("review")
      expect(listing.accuracy_source_updated_at).to eq(Time.utc(2026, 6, 1, 10).to_i * 1000)
      expect(listing.accuracy_scanned_at).to be_present
    end

    it "falls back to title and jeId keys" do
      push({ listings: [ { jeId: "777777", title: "Fallback title" } ] })
      expect(json["created"]).to eq(1)
      expect(Listing.find_by(je_id: "777777").title).to eq("Fallback title")
    end

    it "synthesizes a title when none provided" do
      push({ listings: [ { listing_id: "888888" } ] })
      expect(Listing.find_by(je_id: "888888").title).to eq("Listing 888888")
    end
  end

  describe "update path" do
    it "patches accuracy fields and re-queues the listing as manual" do
      listing = create(:listing, je_id: "555555", moderation_status: "approved",
                                 accuracy_source_updated_at: 1_000, accuracy_user_message: "old")

      push({ listings: [ {
        listing_id: "555555",
        total_score: 0.1,
        user_message: "new message",
        ai_validated_at: "2026-06-02T00:00:00Z"
      } ] })

      expect(json).to include("processed" => 1, "updated" => 1, "created" => 0, "skipped" => 0)
      listing.reload
      expect(listing.moderation_status).to eq("manual")
      expect(listing.accuracy_score).to eq(0.1)
      expect(listing.accuracy_user_message).to eq("new message")
      expect(listing.accuracy_source_updated_at).to eq(Time.utc(2026, 6, 2).to_i * 1000)
    end
  end

  describe "dedup" do
    it "skips items whose ai_validated_at and user_message are unchanged" do
      ts = Time.utc(2026, 6, 1, 10)
      create(:listing, je_id: "444444",
                       accuracy_source_updated_at: ts.to_i * 1000,
                       accuracy_user_message: "same message")

      push({ listings: [ {
        listing_id: "444444",
        ai_validated_at: ts.iso8601,
        user_message: "same message"
      } ] })

      expect(json).to include("processed" => 0, "skipped" => 1, "created" => 0, "updated" => 0)
    end

    it "does not skip when the message changed" do
      ts = Time.utc(2026, 6, 1, 10)
      create(:listing, je_id: "444445",
                       accuracy_source_updated_at: ts.to_i * 1000,
                       accuracy_user_message: "old message")

      push({ listings: [ {
        listing_id: "444445",
        ai_validated_at: ts.iso8601,
        user_message: "different"
      } ] })

      expect(json).to include("updated" => 1, "skipped" => 0)
    end
  end

  describe "per-item errors" do
    it "collects Missing listing_id errors and keeps processing the batch" do
      push({ listings: [ { user_message: "no id" }, { listing_id: "222222" } ] })

      expect(json["errors"]).to eq([ "Missing listing_id" ])
      expect(json["created"]).to eq(1)
      expect(json["processed"]).to eq(1)
    end
  end

  describe "OPTIONS preflight" do
    it "returns 204 with CORS headers and no auth" do
      options "/api/push-flagged"
      expect(response).to have_http_status(:no_content)
      expect(response.headers["Access-Control-Allow-Origin"]).to eq("*")
      expect(response.headers["Access-Control-Allow-Methods"]).to eq("POST")
      expect(response.headers["Access-Control-Allow-Headers"]).to include("X-Api-Key")
    end
  end
end
