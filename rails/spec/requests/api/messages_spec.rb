require "rails_helper"

RSpec.describe "Api messages", type: :request do
  let(:admin) { create(:moderator, role: "admin") }

  include_examples "requires moderator", :get, -> { "/api/messages" }
  include_examples "requires moderator", :post, -> { "/api/messages" }
  include_examples "requires moderator", :patch, -> { "/api/messages/#{create(:message_template).id}" }
  include_examples "requires moderator", :delete, -> { "/api/messages/#{create(:message_template).id}" }

  include_examples "admin only", :post, -> { "/api/messages" }
  include_examples "admin only", :patch, -> { "/api/messages/#{create(:message_template).id}" }
  include_examples "admin only", :delete, -> { "/api/messages/#{create(:message_template).id}" }

  describe "GET /api/messages" do
    it "lists templates for any active role" do
      template = create(:message_template)
      sign_in_as(create(:moderator, role: "viewer"))

      get "/api/messages"
      expect(json.length).to eq(1)
      expect(json.first["_id"]).to eq(template.id.to_s)
      expect(json.first["displayName"]).to eq(template.display_name)
    end
  end

  describe "POST /api/messages" do
    it "creates a template" do
      sign_in_as(admin)
      post "/api/messages", params: {
        name: "reject_quality", displayName: "Reject — quality", category: "reject",
        subject: "Your listing", body: "Does not meet our standards.", isDefault: true
      }, as: :json

      expect(response).to have_http_status(:ok)
      template = MessageTemplate.find_by(name: "reject_quality")
      expect(template.is_default).to be(true)
      expect(json["body"]).to eq("Does not meet our standards.")
    end
  end

  describe "PATCH /api/messages/:id" do
    it "updates the template" do
      template = create(:message_template)
      sign_in_as(admin)

      patch "/api/messages/#{template.id}", params: { body: "Updated body" }, as: :json
      expect(template.reload.body).to eq("Updated body")
    end
  end

  describe "DELETE /api/messages/:id" do
    it "deletes the template" do
      template = create(:message_template)
      sign_in_as(admin)
      expect { delete "/api/messages/#{template.id}" }.to change(MessageTemplate, :count).by(-1)
    end
  end
end
