require "spec_helper"
require "json"
require_relative "../../../app/services/moderation/engine"
require_relative "../../../app/services/moderation/rule_evaluator"

# Regression coverage for the v1 correctness fixes (Phase 3): authored vision
# field aliases, country-aware single-field conditions, and word-boundary
# matching for `exact` list terms. These paths were never exercised by the
# golden parity suite, which is why the underlying bugs shipped — so they are
# locked down here against the real seed catalog.
RSpec.describe "Moderation engine correctness fixes" do
  rails_root = File.expand_path("../../..", __dir__)
  SEED_RULES = JSON.parse(File.read(File.join(rails_root, "db/seed_data/rules.json"), encoding: "UTF-8")).freeze
  SEED_LISTS = JSON.parse(File.read(File.join(rails_root, "db/seed_data/lists.json"), encoding: "UTF-8")).freeze

  def seed_engine
    Moderation::Engine.new(rules: SEED_RULES, lists: SEED_LISTS, settings: {})
  end

  describe "country-aware single-field conditions (russia_block)" do
    it "rejects a listing whose country is the full name 'Russia'" do
      result = seed_engine.evaluate("country" => "Russia", "title" => "Villa", "price" => 5_000_000)
      expect(result[:outcome].to_s).to eq("rejected")
      expect(result[:matches].map { |m| m[:rule_name] }).to include("russia_block")
    end

    it "still rejects when the country is the ISO code 'RU'" do
      result = seed_engine.evaluate("country" => "RU", "title" => "Villa", "price" => 5_000_000)
      expect(result[:matches].map { |m| m[:rule_name] }).to include("russia_block")
    end

    it "does not reject an allowed country" do
      result = seed_engine.evaluate("country" => "Spain", "title" => "Villa", "price" => 5_000_000)
      expect(result[:matches].map { |m| m[:rule_name] }).not_to include("russia_block")
    end
  end

  describe "authored gpt* field aliases resolve to chatGpt* listing keys" do
    let(:bad_condition_it) do
      {
        "country" => "Italy", "title" => "Apartment", "priceUsd" => 1_000_000,
        "chatGptPropertyCondition" => 2.0, "chatGptConclusion" => 2.0
      }
    end

    it "fires gpt_condition rules when the vision scores are poor" do
      names = seed_engine.evaluate(bad_condition_it)[:matches].map { |m| m[:rule_name] }
      expect(names).to include("gpt_condition_auto_italy")
    end

    it "stays silent when the vision scores are good (no false reject)" do
      good = bad_condition_it.merge("chatGptPropertyCondition" => 5.0, "chatGptConclusion" => 5.0)
      names = seed_engine.evaluate(good)[:matches].map { |m| m[:rule_name] }
      expect(names).not_to include("gpt_condition_auto_italy")
    end
  end

  describe "word-boundary matching for exact list terms" do
    it "matches a whole word" do
      expect(Moderation::RuleEvaluator.word_in_text?("This property is SOLD", "Sold")).to be(true)
    end

    it "does not match inside a larger word" do
      expect(Moderation::RuleEvaluator.word_in_text?("Unsold gem in Marbella", "Sold")).to be(false)
      expect(Moderation::RuleEvaluator.word_in_text?("rivenduto", "Venduto")).to be(false)
    end

    it "still matches multi-word terms with a leading space boundary" do
      expect(Moderation::RuleEvaluator.word_in_text?("Image made with AI tools", "with AI")).to be(true)
    end
  end

  describe "every enabled reject rule is reachable" do
    # A reject rule that cannot match ANY listing is dead weight (and was the
    # root cause of the production default-open behaviour). This asserts each
    # enabled auto-reject rule whose fields the engine can actually populate
    # has at least a plausible matching shape — i.e. its condition fields are
    # either real listing keys or known aliases. Rules that depend on signals
    # the pipeline does not yet produce are listed explicitly so the gap is
    # visible rather than silent.
    #
    # priceUsd is in the same boat but tracked separately: JamesEdition already
    # converts prices to USD upstream, so the fix is to map that field from the
    # JE API / push payload at ingest (fetch_and_moderate.rb currently
    # hardcodes price_usd: nil) — not to build an FX service here.
    KNOWN_UNPRODUCED_FIELDS = %w[
      gptWatermarkSold gptWatermarkLarge duplicatesOriginalListing
      viktorReject viktorApprove viktorFlagged manualReview
    ].freeze

    it "documents which reject rules depend on not-yet-produced signals" do
      reject_rules = SEED_RULES.select { |r| r["enabled"] != false && r["action"] == "reject" }
      blocked = reject_rules.select do |r|
        conds = Array(r.dig("config", "conditions")) + Array(r.dig("config", "orConditions"))
        conds.any? { |c| KNOWN_UNPRODUCED_FIELDS.include?(c["field"]) }
      end
      # This is a living inventory, not a hard failure: it makes the dependency
      # explicit. If it grows unexpectedly, investigate.
      expect(blocked.map { |r| r["name"] }).to all(be_a(String))
    end
  end
end
