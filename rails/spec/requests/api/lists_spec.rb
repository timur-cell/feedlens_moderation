require "rails_helper"

RSpec.describe "Api lists", type: :request do
  let(:admin) { create(:moderator, role: "admin") }

  include_examples "requires moderator", :get, -> { "/api/lists" }
  include_examples "requires moderator", :post, -> { "/api/lists" }
  include_examples "requires moderator", :patch, -> { "/api/lists/#{create(:moderation_list).id}" }
  include_examples "requires moderator", :delete, -> { "/api/lists/#{create(:moderation_list).id}" }
  include_examples "requires moderator", :post, -> { "/api/lists/#{create(:moderation_list).id}/items" }
  include_examples "requires moderator", :delete, -> { "/api/lists/#{create(:moderation_list).id}/items/0" }
  include_examples "requires moderator", :post, -> { "/api/lists/seed" }
  include_examples "requires moderator", :post, -> { "/api/lists/suggest" }

  include_examples "admin only", :post, -> { "/api/lists" }
  include_examples "admin only", :patch, -> { "/api/lists/#{create(:moderation_list).id}" }
  include_examples "admin only", :delete, -> { "/api/lists/#{create(:moderation_list).id}" }
  include_examples "admin only", :post, -> { "/api/lists/#{create(:moderation_list).id}/items" }
  include_examples "admin only", :delete, -> { "/api/lists/#{create(:moderation_list).id}/items/0" }
  include_examples "admin only", :post, -> { "/api/lists/seed" }

  describe "GET /api/lists" do
    it "lists all moderation lists with items verbatim" do
      list = create(:moderation_list,
                    items: [ { "value" => "sold", "type" => "exact" } ], item_count: 1)
      sign_in_as(create(:moderator, role: "viewer"))

      get "/api/lists"
      expect(json.length).to eq(1)
      expect(json.first["_id"]).to eq(list.id.to_s)
      expect(json.first["items"]).to eq([ { "value" => "sold", "type" => "exact" } ])
      expect(json.first["itemCount"]).to eq(1)
      expect(json.first["updatedAt"]).to eq(list.updated_at_ms)
    end
  end

  describe "POST /api/lists" do
    it "creates a list with itemCount and updatedAt stamps" do
      sign_in_as(admin)

      post "/api/lists", params: {
        name: "sold_keywords", displayName: "Sold keywords", category: "real_estate.availability",
        items: [ { value: "sold", type: "exact" }, { value: "/under\\s+offer/i", type: "regex", pattern: "under\\s+offer", flags: "i" } ]
      }, as: :json

      expect(response).to have_http_status(:ok)
      list = ModerationList.find_by(name: "sold_keywords")
      expect(list.item_count).to eq(2)
      expect(list.items[1]).to eq("value" => "/under\\s+offer/i", "type" => "regex",
                                  "pattern" => "under\\s+offer", "flags" => "i")
      expect(list.updated_at_ms).to be_present
    end
  end

  describe "PATCH /api/lists/:id" do
    it "updates fields and recounts items" do
      list = create(:moderation_list, items: [ { "value" => "a", "type" => "exact" } ], item_count: 1)
      sign_in_as(admin)

      patch "/api/lists/#{list.id}", params: {
        displayName: "Renamed",
        items: [ { value: "a", type: "exact" }, { value: "b", type: "exact" } ]
      }, as: :json

      list.reload
      expect(list.display_name).to eq("Renamed")
      expect(list.item_count).to eq(2)
    end
  end

  describe "POST /api/lists/:id/items" do
    it "appends an item" do
      list = create(:moderation_list, items: [ { "value" => "a", "type" => "exact" } ], item_count: 1)
      sign_in_as(admin)

      post "/api/lists/#{list.id}/items", params: { item: { value: "b", type: "exact" } }, as: :json
      list.reload
      expect(list.items.map { |i| i["value"] }).to eq(%w[a b])
      expect(list.item_count).to eq(2)
    end
  end

  describe "DELETE /api/lists/:id/items/:index" do
    it "removes the item at the index" do
      list = create(:moderation_list,
                    items: [ { "value" => "a", "type" => "exact" }, { "value" => "b", "type" => "exact" } ],
                    item_count: 2)
      sign_in_as(admin)

      delete "/api/lists/#{list.id}/items/0"
      list.reload
      expect(list.items.map { |i| i["value"] }).to eq(%w[b])
      expect(list.item_count).to eq(1)
    end
  end

  describe "DELETE /api/lists/:id" do
    it "deletes the list" do
      list = create(:moderation_list)
      sign_in_as(admin)
      expect { delete "/api/lists/#{list.id}" }.to change(ModerationList, :count).by(-1)
    end
  end

  describe "POST /api/lists/seed" do
    it "replaces all lists with the canonical seed set" do
      create(:moderation_list, name: "stale_custom_list")
      sign_in_as(admin)

      post "/api/lists/seed"
      expect(response).to have_http_status(:ok)

      seed_count = JSON.parse(File.read(Rails.root.join("db/seed_data/lists.json"))).length
      expect(json["deleted"]).to eq(1)
      expect(json["inserted"]).to eq(seed_count)
      expect(ModerationList.count).to eq(seed_count)
      expect(ModerationList.exists?(name: "stale_custom_list")).to be(false)
      expect(ModerationList.exists?(name: "complex_of_apt")).to be(true)
    end
  end

  describe "POST /api/lists/suggest" do
    it "returns the AI suggestion (moderator allowed)" do
      sign_in_as(create(:moderator))
      suggestion = { "name" => "ai_image_terms", "items" => [] }
      expect(Ai::ListSuggester).to receive(:call)
        .with(description: "ai image phrases")
        .and_return(suggestion)

      post "/api/lists/suggest", params: { description: "ai image phrases" }, as: :json
      expect(json).to eq(suggestion)
    end
  end
end
