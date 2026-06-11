require "rails_helper"

RSpec.describe "Api settings", type: :request do
  let(:admin) { create(:moderator, role: "admin") }

  include_examples "requires moderator", :get, -> { "/api/settings" }
  include_examples "requires moderator", :patch, -> { "/api/settings" }
  include_examples "requires moderator", :post, -> { "/api/settings/reset" }

  include_examples "admin only", :patch, -> { "/api/settings" }
  include_examples "admin only", :post, -> { "/api/settings/reset" }

  describe "GET /api/settings" do
    it "returns defaults when no row exists" do
      sign_in_as(create(:moderator, role: "viewer"))

      get "/api/settings"
      expect(response).to have_http_status(:ok)
      expect(json["paramScanModel"]).to eq("claude-haiku-4-5-20251001")
      expect(json["visionCountries"]).to eq(%w[ES IT PT FR GR])
      expect(json["autoApproveThreshold"]).to eq(0.9)
      expect(json["enableAutoModeration"]).to be(true)
      expect(json["_id"]).to be_nil
    end

    it "merges DB overrides over defaults" do
      row = create(:setting, ai_temperature: 0.5, vision_countries: %w[ES])
      sign_in_as(create(:moderator))

      get "/api/settings"
      expect(json["aiTemperature"]).to eq(0.5)
      expect(json["visionCountries"]).to eq(%w[ES])
      expect(json["autoRejectThreshold"]).to eq(0.85) # default preserved
      expect(json["_id"]).to eq(row.id.to_s)
    end
  end

  describe "PATCH /api/settings" do
    it "persists permitted keys and stamps updatedAt/updatedBy" do
      sign_in_as(admin)

      patch "/api/settings", params: {
        aiTemperature: 0.3, visionCountries: %w[ES IT], enableAutoModeration: false,
        notificationEmail: "alerts@example.com"
      }, as: :json

      expect(response).to have_http_status(:ok)
      row = Setting.find_by(key: Setting::KEY)
      expect(row.ai_temperature).to eq(0.3)
      expect(row.vision_countries).to eq(%w[ES IT])
      expect(row.enable_auto_moderation).to be(false)
      expect(row.notification_email).to eq("alerts@example.com")
      expect(row.updated_at_ms).to be_present
      expect(row.updated_by).to eq(admin.email)
      expect(json["aiTemperature"]).to eq(0.3)
    end

    it "ignores unknown keys" do
      sign_in_as(admin)
      patch "/api/settings", params: { aiTemperature: 0.2, hacked: "yes" }, as: :json
      expect(response).to have_http_status(:ok)
    end
  end

  describe "POST /api/settings/reset" do
    it "restores defaults on the existing row" do
      create(:setting, ai_temperature: 0.7, enable_auto_moderation: false)
      sign_in_as(admin)

      post "/api/settings/reset"
      expect(response).to have_http_status(:ok)
      expect(json["aiTemperature"]).to eq(0.1)
      expect(json["enableAutoModeration"]).to be(true)
      expect(Setting.find_by(key: Setting::KEY).ai_temperature).to eq(0.1)
    end
  end
end
