require "rails_helper"

RSpec.describe "Api passwords", type: :request do
  describe "POST /api/password" do
    it "always returns success for existing accounts" do
      moderator = create(:moderator)
      post "/api/password", params: { email: moderator.email }, as: :json
      expect(response).to have_http_status(:ok)
      expect(json["success"]).to be(true)
      expect(moderator.reload.reset_password_token).to be_present
    end

    it "returns success even for unknown emails (no enumeration)" do
      post "/api/password", params: { email: "ghost@example.com" }, as: :json
      expect(response).to have_http_status(:ok)
      expect(json["success"]).to be(true)
    end
  end

  describe "PUT /api/password" do
    it "resets the password with a valid token" do
      moderator = create(:moderator)
      raw_token = moderator.send_reset_password_instructions

      put "/api/password", params: { token: raw_token, password: "NewPassword!456" }, as: :json
      expect(response).to have_http_status(:ok)
      expect(json["success"]).to be(true)
      expect(moderator.reload.valid_password?("NewPassword!456")).to be(true)
    end

    it "rejects an invalid token with 422" do
      put "/api/password", params: { token: "bogus", password: "NewPassword!456" }, as: :json
      expect(response).to have_http_status(422)
      expect(json["error"]).to be_present
    end

    it "rejects a too-short password with 422" do
      moderator = create(:moderator)
      raw_token = moderator.send_reset_password_instructions

      put "/api/password", params: { token: raw_token, password: "x" }, as: :json
      expect(response).to have_http_status(422)
      expect(json["error"]).to be_present
    end
  end
end
