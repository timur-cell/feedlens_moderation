require "rails_helper"

# Override-feedback loop: a "false positive" override marks the rules that
# fired as wrong, feeding per-rule precision (1 − fp/matches).
RSpec.describe "Api override precision rollup", type: :request do
  it "increments false_positive_count on every fired rule when reason is false_positive" do
    rule_a = create(:rule, name: "new_developments", match_count: 10, false_positive_count: 2)
    rule_b = create(:rule, name: "low_lqi", match_count: 5, false_positive_count: 0)
    listing = create(:listing, moderation_status: "manual")
    result = create(:moderation_result, listing: listing, outcome: "manual",
                    rule_matches: [
                      { "ruleName" => "new_developments", "action" => "flag" },
                      { "ruleName" => "low_lqi", "action" => "reject" },
                      { "ruleName" => "llm_assessment", "action" => "flag" }
                    ])
    sign_in_as(create(:moderator))

    post "/api/moderation-results/#{result.id}/override",
         params: { newOutcome: "approved", reason: "false_positive" }, as: :json

    expect(response).to have_http_status(:ok)
    expect(rule_a.reload.false_positive_count).to eq(3)
    expect(rule_b.reload.false_positive_count).to eq(1)
  end

  it "does not increment for non-false-positive reasons" do
    rule = create(:rule, name: "low_lqi", false_positive_count: 1)
    listing = create(:listing, moderation_status: "manual")
    result = create(:moderation_result, listing: listing, outcome: "manual",
                    rule_matches: [ { "ruleName" => "low_lqi", "action" => "reject" } ])
    sign_in_as(create(:moderator))

    post "/api/moderation-results/#{result.id}/override",
         params: { newOutcome: "approved", reason: "policy_changed" }, as: :json

    expect(response).to have_http_status(:ok)
    expect(rule.reload.false_positive_count).to eq(1)
  end
end
