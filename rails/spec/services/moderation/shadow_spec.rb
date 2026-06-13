require "spec_helper"
require_relative "../../../app/services/moderation/engine"

# Shadow rules are evaluated for reporting (would-have-matched) but must never
# influence the outcome. With no shadow rules present the flow is unchanged
# (covered by the golden suite); these specs lock the shadow carve-out.
RSpec.describe "Moderation::Engine shadow mode" do
  def rule(name, overrides = {})
    {
      "name" => name,
      "category" => "simple_code",
      "tier" => "auto",
      "action" => "notice",
      "priority" => 100,
      "config" => { "conditions" => [ { "field" => "flag", "operator" => "is_true", "value" => true } ] }
    }.merge(overrides)
  end

  def engine_with(rules)
    Moderation::Engine.new(rules: rules, lists: [], settings: {})
  end

  it "keeps shadow rules out of the live rule set" do
    engine = engine_with([ rule("live"), rule("shadowed", "shadow" => true) ])
    expect(engine.rules.map { |r| r["name"] }).to eq(%w[live])
  end

  it "does not let a shadow auto-reject change the outcome" do
    engine = engine_with([ rule("shadow_reject", "action" => "reject", "shadow" => true) ])
    result = engine.evaluate({ "flag" => true })
    expect(result[:outcome]).to eq("approved")
    expect(result[:matches]).to be_empty
  end

  it "reports would-have-matched shadow rule names while live rules drive the outcome" do
    engine = engine_with([
      rule("shadow_reject", "action" => "reject", "shadow" => true),
      rule("live_notice")
    ])
    expect(engine.shadow_match_names({ "flag" => true })).to eq(%w[shadow_reject])
    expect(engine.evaluate({ "flag" => true })[:outcome]).to eq("notice")
  end

  it "returns no shadow matches when the shadow rule's condition is false" do
    engine = engine_with([ rule("shadow_reject", "action" => "reject", "shadow" => true) ])
    expect(engine.shadow_match_names({ "flag" => false })).to eq([])
  end
end
