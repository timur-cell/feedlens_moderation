require "rails_helper"

RSpec.describe "Api saved views", type: :request do
  include_examples "requires moderator", :get, -> { "/api/saved-views" }
  include_examples "requires moderator", :post, -> { "/api/saved-views" }, { name: "x", query: "" }

  it "creates, lists and deletes the current moderator's views" do
    sign_in_as(create(:moderator))

    post "/api/saved-views",
         params: { name: "Overrides this week", query: "source=override&date=7d", scope: "decisions" }, as: :json
    expect(response).to have_http_status(:ok)
    id = json["_id"]
    expect(json["name"]).to eq("Overrides this week")
    expect(json["query"]).to eq("source=override&date=7d")

    get "/api/saved-views", params: { scope: "decisions" }
    expect(response).to have_http_status(:ok)
    expect(json.map { |v| v["name"] }).to eq([ "Overrides this week" ])

    delete "/api/saved-views/#{id}"
    expect(response).to have_http_status(:ok)

    get "/api/saved-views"
    expect(json).to be_empty
  end

  it "never returns another moderator's views" do
    other = create(:moderator)
    SavedView.create!(moderator: other, name: "Theirs", query: "", scope: "decisions", created_at_ms: 1)

    sign_in_as(create(:moderator))
    get "/api/saved-views"
    expect(json).to be_empty
  end
end
