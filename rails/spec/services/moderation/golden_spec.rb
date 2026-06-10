require "spec_helper"
require "json"
require_relative "../../../app/services/moderation/engine"

# Golden parity suite: every fixture in scripts/golden/fixtures.json was run
# through the REAL TypeScript evaluators (extracted verbatim from
# convex/moderation.ts) by scripts/golden/generate.ts, which wrote the
# expected results to spec/fixtures/golden/expected.json. The Ruby engine
# must reproduce them exactly: ordered rule matches, outcome, needs-LLM flag,
# LLM rule matches and seller message.
#
# Regenerate with: bun scripts/golden/generate.ts (from the repo root).
RSpec.describe "Moderation::Engine golden fixtures" do
  rails_root = File.expand_path("../../..", __dir__)
  expected_path = File.join(rails_root, "spec/fixtures/golden/expected.json")
  fixtures_path = File.expand_path("../scripts/golden/fixtures.json", rails_root)

  unless File.exist?(expected_path)
    it "has generated golden expectations" do
      skip "spec/fixtures/golden/expected.json is missing — run `bun scripts/golden/generate.ts` from the repo root"
    end
    next
  end

  seed_rules = JSON.parse(File.read(File.join(rails_root, "db/seed_data/rules.json")))
  seed_lists = JSON.parse(File.read(File.join(rails_root, "db/seed_data/lists.json")))
  fixtures_doc = JSON.parse(File.read(fixtures_path))
  expected = JSON.parse(File.read(expected_path))

  engine = Moderation::Engine.new(
    rules: seed_rules + fixtures_doc["extraRules"],
    lists: seed_lists + fixtures_doc["extraLists"],
    settings: {}
  )
  listings_by_label = fixtures_doc["fixtures"].to_h { |f| [ f["label"], f["listing"] ] }

  it "covers every fixture exactly once" do
    expect(expected.map { |e| e["label"] }).to match_array(listings_by_label.keys)
  end

  expected.each do |exp|
    it "matches the TS engine for #{exp["label"]}" do
      result = engine.evaluate(listings_by_label.fetch(exp["label"]))

      expect(result[:matches].map { |m| m[:rule_name] }).to eq(exp["matches"])
      expect(result[:outcome].to_s).to eq(exp["outcome"])
      expect(result[:needs_llm]).to eq(exp["needsLlm"])
      expect(result[:llm_rule_matches]).to eq(exp["llmRuleMatches"])
      expect(result[:seller_message]).to eq(exp["sellerMessage"])
    end
  end
end
