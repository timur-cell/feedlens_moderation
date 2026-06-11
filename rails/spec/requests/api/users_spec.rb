require "rails_helper"

RSpec.describe "Api users", type: :request do
  let(:admin) { create(:moderator, role: "admin", name: "Admin User") }

  include_examples "requires moderator", :get, -> { "/api/users" }
  include_examples "requires moderator", :get, -> { "/api/users/stats" }
  include_examples "requires moderator", :get, -> { "/api/users/#{create(:moderator).id}/activity" }
  include_examples "requires moderator", :get, -> { "/api/activity" }
  include_examples "requires moderator", :post, -> { "/api/users" }
  include_examples "requires moderator", :patch, -> { "/api/users/#{create(:moderator).id}" }
  include_examples "requires moderator", :delete, -> { "/api/users/#{create(:moderator).id}" }
  include_examples "requires moderator", :post, -> { "/api/users/#{create(:moderator).id}/reactivate" }
  include_examples "requires moderator", :post, -> { "/api/users/set-password" }

  include_examples "admin only", :post, -> { "/api/users" }
  include_examples "admin only", :patch, -> { "/api/users/#{create(:moderator).id}" }
  include_examples "admin only", :delete, -> { "/api/users/#{create(:moderator).id}" }
  include_examples "admin only", :post, -> { "/api/users/#{create(:moderator).id}/reactivate" }
  include_examples "admin only", :post, -> { "/api/users/set-password" }

  describe "GET /api/users" do
    it "lists all moderators and admits viewers" do
      create_list(:moderator, 2)
      sign_in_as(create(:moderator, role: "viewer"))

      get "/api/users"
      expect(response).to have_http_status(:ok)
      expect(json.length).to eq(3)
      expect(json.first).to have_key("_id")
      expect(json.first).to have_key("actionCount")
      expect(json.first).not_to have_key("encryptedPassword")
    end
  end

  describe "GET /api/users/stats" do
    it "aggregates by status and role" do
      create(:moderator, role: "admin")
      create(:moderator, role: "viewer", status: "invited")
      create(:moderator, status: "disabled")
      sign_in_as(create(:moderator))

      get "/api/users/stats"
      expect(json).to eq(
        "total" => 4, "active" => 2, "invited" => 1, "disabled" => 1,
        "admins" => 1, "moderators" => 2, "viewers" => 1
      )
    end
  end

  describe "GET /api/users/:id/activity" do
    it "returns the user's activity newest first" do
      target = create(:moderator)
      create(:moderator_activity, moderator: target, action: "old", timestamp: 1_000)
      create(:moderator_activity, moderator: target, action: "new", timestamp: 2_000)
      create(:moderator_activity) # someone else
      sign_in_as(create(:moderator))

      get "/api/users/#{target.id}/activity"
      expect(json.length).to eq(2)
      expect(json.map { |a| a["action"] }).to eq(%w[new old])
      expect(json.first["moderatorId"]).to eq(target.id.to_s)
    end

    it "honours the limit param" do
      target = create(:moderator)
      create_list(:moderator_activity, 3, moderator: target)
      sign_in_as(create(:moderator))

      get "/api/users/#{target.id}/activity", params: { limit: 2 }
      expect(json.length).to eq(2)
    end
  end

  describe "GET /api/activity" do
    it "returns recent activity across moderators" do
      create(:moderator_activity, timestamp: 1_000)
      create(:moderator_activity, timestamp: 3_000)
      sign_in_as(create(:moderator))

      get "/api/activity"
      expect(json.length).to eq(2)
      expect(json.first["timestamp"]).to eq(3_000)
    end
  end

  describe "POST /api/users" do
    it "creates an active login with the default password and logs the invite" do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("DEFAULT_USER_PASSWORD").and_return("Default!Pass1")
      sign_in_as(admin)

      expect do
        post "/api/users", params: { name: "New Mod", email: "NEW@Example.com", role: "moderator" }, as: :json
      end.to change(Moderator, :count).by(1)

      expect(response).to have_http_status(:ok)
      expect(json["success"]).to be(true)
      expect(json["password"]).to eq("Default!Pass1")
      expect(json["message"]).to eq("User New Mod created with password")

      created = Moderator.find(json["moderatorId"].to_i)
      expect(created.email).to eq("new@example.com")
      expect(created.status).to eq("active")
      expect(created.invited_by).to eq(admin.email)
      expect(created.action_count).to eq(0)

      activity = ModeratorActivity.find_by(moderator_id: created.id)
      expect(activity.action).to eq("invited")
      expect(activity.details).to include("Created as moderator with login credentials by #{admin.email}")

      # the new account can log in immediately
      delete "/api/session"
      post "/api/session", params: { email: "new@example.com", password: "Default!Pass1" }, as: :json
      expect(response).to have_http_status(:ok)
    end

    it "uses the provided password when given" do
      sign_in_as(admin)
      post "/api/users", params: { name: "M", email: "m@example.com", role: "viewer", password: "Custom!Pass9" }, as: :json
      expect(json["password"]).to eq("Custom!Pass9")
      expect(Moderator.find_by(email: "m@example.com").valid_password?("Custom!Pass9")).to be(true)
    end

    it "returns success: false for duplicate emails" do
      existing = create(:moderator, email: "dupe@example.com")
      sign_in_as(admin)

      expect do
        post "/api/users", params: { name: "Dupe", email: existing.email, role: "moderator" }, as: :json
      end.not_to change(Moderator, :count)

      expect(response).to have_http_status(:ok)
      expect(json["success"]).to be(false)
      expect(json["message"]).to include("User with email dupe@example.com already exists")
    end
  end

  describe "PATCH /api/users/:id" do
    it "updates name/role/status and logs the change" do
      target = create(:moderator)
      sign_in_as(admin)

      patch "/api/users/#{target.id}", params: { role: "viewer", name: "Renamed" }, as: :json
      expect(response).to have_http_status(:ok)
      expect(target.reload.role).to eq("viewer")
      expect(target.name).to eq("Renamed")

      activity = ModeratorActivity.where(moderator_id: target.id).last
      expect(activity.action).to eq("profile_updated")
      expect(activity.details).to include("role: viewer")
    end

    it "404s for unknown users" do
      sign_in_as(admin)
      patch "/api/users/999999", params: { role: "viewer" }, as: :json
      expect(response).to have_http_status(:not_found)
      expect(json["error"]).to eq("User not found")
    end

    it "422s on invalid role" do
      target = create(:moderator)
      sign_in_as(admin)
      patch "/api/users/#{target.id}", params: { role: "superuser" }, as: :json
      expect(response).to have_http_status(422)
    end
  end

  describe "DELETE /api/users/:id" do
    it "soft-deletes by disabling the account" do
      target = create(:moderator)
      sign_in_as(admin)

      delete "/api/users/#{target.id}"
      expect(response).to have_http_status(:ok)
      expect(target.reload.status).to eq("disabled")
      expect(ModeratorActivity.where(moderator_id: target.id).last.action).to eq("disabled")
    end
  end

  describe "POST /api/users/:id/reactivate" do
    it "re-activates a disabled account" do
      target = create(:moderator, status: "disabled")
      sign_in_as(admin)

      post "/api/users/#{target.id}/reactivate"
      expect(response).to have_http_status(:ok)
      expect(target.reload.status).to eq("active")
      expect(ModeratorActivity.where(moderator_id: target.id).last.action).to eq("reactivated")
    end
  end

  describe "POST /api/users/set-password" do
    it "sets a new password for the given email" do
      target = create(:moderator)
      sign_in_as(admin)

      post "/api/users/set-password", params: { email: target.email, newPassword: "Fresh!Pass77" }, as: :json
      expect(json["success"]).to be(true)
      expect(json["message"]).to eq("Password updated for #{target.email}")
      expect(target.reload.valid_password?("Fresh!Pass77")).to be(true)
    end

    it "returns success: false for unknown emails" do
      sign_in_as(admin)
      post "/api/users/set-password", params: { email: "ghost@example.com", newPassword: "Fresh!Pass77" }, as: :json
      expect(json["success"]).to be(false)
      expect(json["message"]).to include("Failed to reset password")
    end
  end
end
