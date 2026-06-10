require "rails_helper"

RSpec.describe "Api rules", type: :request do
  let(:admin) { create(:moderator, role: "admin") }

  include_examples "requires moderator", :get, -> { "/api/rules" }
  include_examples "requires moderator", :post, -> { "/api/rules" }
  include_examples "requires moderator", :patch, -> { "/api/rules/#{create(:rule).id}" }
  include_examples "requires moderator", :delete, -> { "/api/rules/#{create(:rule).id}" }
  include_examples "requires moderator", :post, -> { "/api/rules/#{create(:rule).id}/toggle" }
  include_examples "requires moderator", :post, -> { "/api/rules/suggest" }

  include_examples "admin only", :post, -> { "/api/rules" }
  include_examples "admin only", :patch, -> { "/api/rules/#{create(:rule).id}" }
  include_examples "admin only", :delete, -> { "/api/rules/#{create(:rule).id}" }
  include_examples "admin only", :post, -> { "/api/rules/#{create(:rule).id}/toggle" }

  describe "GET /api/rules" do
    it "lists all rules for any active role" do
      rule = create(:rule, config: { "field" => "priceUsd", "operator" => "<", "value" => 490_000 })
      sign_in_as(create(:moderator, role: "viewer"))

      get "/api/rules"
      expect(json.length).to eq(1)
      expect(json.first["_id"]).to eq(rule.id.to_s)
      expect(json.first["config"]).to eq("field" => "priceUsd", "operator" => "<", "value" => 490_000)
      expect(json.first["displayName"]).to eq(rule.display_name)
    end
  end

  describe "POST /api/rules" do
    it "creates a rule with stamps and zeroed counters, and logs activity" do
      sign_in_as(admin)

      post "/api/rules", params: {
        name: "price_too_low", displayName: "Price too low", category: "simple_code",
        tier: "auto", enabled: true, action: "reject", priority: 5,
        config: { field: "priceUsd", operator: "<", value: 490_000 },
        sellerMessage: "Price below marketplace minimum."
      }, as: :json

      expect(response).to have_http_status(:ok)
      rule = Rule.find_by(name: "price_too_low")
      expect(rule.match_count).to eq(0)
      expect(rule.false_positive_count).to eq(0)
      expect(rule.created_at_ms).to be_present
      expect(rule.last_modified_at).to be_present
      expect(rule.last_modified_by).to eq(admin.email)
      expect(rule.config).to eq("field" => "priceUsd", "operator" => "<", "value" => 490_000)
      expect(json["lastModifiedBy"]).to eq(admin.email)

      activity = ModeratorActivity.where(moderator_id: admin.id).last
      expect(activity.action).to eq("rule_created")
      expect(admin.reload.action_count).to eq(1)
    end
  end

  describe "PATCH /api/rules/:id" do
    it "updates fields and stamps lastModifiedAt/lastModifiedBy" do
      rule = create(:rule, last_modified_at: 1, last_modified_by: "system")
      sign_in_as(admin)

      patch "/api/rules/#{rule.id}", params: { enabled: false, priority: 99 }, as: :json
      rule.reload
      expect(rule.enabled).to be(false)
      expect(rule.priority).to eq(99)
      expect(rule.last_modified_at).to be > 1
      expect(rule.last_modified_by).to eq(admin.email)
    end
  end

  describe "POST /api/rules/:id/toggle" do
    it "flips enabled and stamps the modifier" do
      rule = create(:rule, enabled: true)
      sign_in_as(admin)

      post "/api/rules/#{rule.id}/toggle"
      expect(rule.reload.enabled).to be(false)
      expect(rule.last_modified_by).to eq(admin.email)

      post "/api/rules/#{rule.id}/toggle"
      expect(rule.reload.enabled).to be(true)
    end
  end

  describe "DELETE /api/rules/:id" do
    it "deletes the rule" do
      rule = create(:rule)
      sign_in_as(admin)

      expect { delete "/api/rules/#{rule.id}" }.to change(Rule, :count).by(-1)
      expect(response).to have_http_status(:ok)
    end
  end

  describe "POST /api/rules/suggest" do
    it "returns the AI suggestion (moderator allowed)" do
      sign_in_as(create(:moderator))
      suggestion = { "name" => "no_renders", "category" => "simple_code", "config" => {} }
      expect(Ai::RuleSuggester).to receive(:call)
        .with(description: "flag 3d renders")
        .and_return(suggestion)

      post "/api/rules/suggest", params: { description: "flag 3d renders" }, as: :json
      expect(json).to eq(suggestion)
    end
  end
end
