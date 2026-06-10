require "rails_helper"

RSpec.describe "Api sessions", type: :request do
  describe "GET /api/session" do
    it "returns null user and a csrf token when signed out" do
      get "/api/session"
      expect(response).to have_http_status(:ok)
      expect(json["user"]).to be_nil
      expect(json["csrfToken"]).to be_present
    end

    it "returns the signed-in moderator as a Convex doc" do
      moderator = create(:moderator, role: "viewer")
      sign_in_as(moderator)

      get "/api/session"
      expect(response).to have_http_status(:ok)
      expect(json["user"]["_id"]).to eq(moderator.id.to_s)
      expect(json["user"]["email"]).to eq(moderator.email)
      expect(json["user"]["role"]).to eq("viewer")
      expect(json["user"]).to have_key("_creationTime")
      expect(json["user"]).to have_key("createdAt")
      expect(json["user"]).not_to have_key("encryptedPassword")
      expect(json["user"]).not_to have_key("resetPasswordToken")
      expect(json["csrfToken"]).to be_present
    end
  end

  describe "POST /api/session" do
    it "signs in with valid credentials, updates lastLoginAt and returns a fresh token" do
      moderator = create(:moderator, last_login_at: nil)
      post "/api/session", params: { email: moderator.email, password: "Password!123" }, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["user"]["_id"]).to eq(moderator.id.to_s)
      expect(json["csrfToken"]).to be_present
      expect(moderator.reload.last_login_at).to be_present
    end

    it "promotes invited moderators to active on first login" do
      moderator = create(:moderator, status: "invited")
      post "/api/session", params: { email: moderator.email, password: "Password!123" }, as: :json

      expect(response).to have_http_status(:ok)
      expect(moderator.reload.status).to eq("active")
      expect(json["user"]["status"]).to eq("active")
    end

    it "rejects bad credentials with 401" do
      moderator = create(:moderator)
      post "/api/session", params: { email: moderator.email, password: "wrong" }, as: :json
      expect(response).to have_http_status(:unauthorized)
      expect(json["error"]).to be_present
    end

    it "rejects unknown emails with 401" do
      post "/api/session", params: { email: "nobody@example.com", password: "x" }, as: :json
      expect(response).to have_http_status(:unauthorized)
      expect(json["error"]).to be_present
    end

    it "rejects disabled moderators with 401 even with correct password" do
      moderator = create(:moderator, status: "disabled")
      post "/api/session", params: { email: moderator.email, password: "Password!123" }, as: :json
      expect(response).to have_http_status(:unauthorized)
      expect(json["error"]).to be_present
    end
  end

  describe "DELETE /api/session" do
    it "signs out and returns 204" do
      sign_in_as(create(:moderator))
      delete "/api/session"
      expect(response).to have_http_status(:no_content)

      get "/api/session"
      expect(json["user"]).to be_nil
    end
  end
end
