require "spec_helper"
require_relative "../../../app/services/moderation/engine"

RSpec.describe Moderation::Engine do
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

  def engine_with(rules, lists: [], settings: {})
    described_class.new(rules: rules, lists: lists, settings: settings)
  end

  describe "rule preparation" do
    it "drops rules with enabled: false and keeps rules without the flag" do
      engine = engine_with([ rule("a"), rule("b", "enabled" => false), rule("c", "enabled" => true) ])
      expect(engine.rules.map { |r| r["name"] }).to eq(%w[a c])
    end

    it "sorts by priority with a stable tie-break on definition order" do
      engine = engine_with([
        rule("late", "priority" => 200),
        rule("tie_one", "priority" => 100),
        rule("tie_two", "priority" => 100),
        rule("first", "priority" => 1)
      ])
      expect(engine.rules.map { |r| r["name"] }).to eq(%w[first tie_one tie_two late])
    end
  end

  describe "#evaluate" do
    it "routes auto_ai/former_manual matches to :needs_llm with their names" do
      engine = engine_with([
        rule("det_notice"),
        rule("ai_one", "category" => "auto_ai", "action" => "reject", "priority" => 300),
        rule("fm_two", "category" => "former_manual", "tier" => "verify", "action" => "reject", "priority" => 301)
      ])
      result = engine.evaluate({ "flag" => true })
      expect(result[:outcome]).to eq(:needs_llm)
      expect(result[:needs_llm]).to be true
      expect(result[:llm_rule_matches]).to eq(%w[ai_one fm_two])
      expect(result[:matches].map { |m| m[:rule_name] }).to eq(%w[det_notice ai_one fm_two])
    end

    it "lets a deterministic auto-reject short-circuit before the AI phase" do
      engine = engine_with([
        rule("rejecter", "action" => "reject", "sellerMessage" => "Nope."),
        rule("ai_one", "category" => "auto_ai", "priority" => 300)
      ])
      result = engine.evaluate({ "flag" => true })
      expect(result[:outcome]).to eq("rejected")
      expect(result[:seller_message]).to eq("Nope.")
      expect(result[:confidence]).to eq(1.0)
      expect(result[:needs_llm]).to be false
      expect(result[:matches].map { |m| m[:rule_name] }).to eq(%w[rejecter])
    end

    it "uses the default rejection message when the rule has none" do
      engine = engine_with([ rule("rejecter", "action" => "reject") ])
      result = engine.evaluate({ "flag" => true })
      expect(result[:seller_message]).to eq("Your listing does not meet our quality standards.")
    end
  end

  describe "#decide_with_llm" do
    let(:engine) do
      engine_with([ rule("ai_one", "category" => "auto_ai", "action" => "reject", "priority" => 300) ])
    end
    let(:det) { engine.evaluate({ "flag" => true }) }

    def llm(recommendation: "approve", confidence: 0.95, notice: nil, assessment: "ok")
      { "recommendation" => recommendation, "confidence" => confidence, "notice" => notice, "assessment" => assessment }
    end

    it "passes a non-needs-llm result through untouched" do
      clean = engine.evaluate({ "flag" => false })
      expect(engine.decide_with_llm(clean, llm)).to equal(clean)
    end

    it "routes a nil LLM response to manual with confidence 0" do
      result = engine.decide_with_llm(det, nil)
      expect(result[:outcome]).to eq("manual")
      expect(result[:confidence]).to eq(0)
      expect(result[:matches].map { |m| m[:rule_name] }).to eq(%w[ai_one])
    end

    it "auto-rejects on a high-confidence reject and appends the llm_assessment match" do
      result = engine.decide_with_llm(det, llm(recommendation: "reject", confidence: 0.9, notice: "Bad listing."))
      expect(result[:outcome]).to eq("rejected")
      expect(result[:seller_message]).to eq("Bad listing.")
      expect(result[:confidence]).to eq(0.9)
      llm_match = result[:matches].last
      expect(llm_match[:rule_name]).to eq("llm_assessment")
      expect(llm_match[:tier]).to eq("auto")
      expect(llm_match[:action]).to eq("reject")
    end

    it "uses the default LLM rejection message when no notice is present" do
      result = engine.decide_with_llm(det, llm(recommendation: "reject", confidence: 0.9))
      expect(result[:seller_message]).to eq("Your listing does not meet our listing standards.")
    end

    it "applies the reject threshold (0.85) to rejects and the approve threshold (0.9) to the rest" do
      expect(engine.decide_with_llm(det, llm(recommendation: "reject", confidence: 0.86))[:outcome]).to eq("rejected")
      expect(engine.decide_with_llm(det, llm(recommendation: "approve", confidence: 0.86))[:outcome]).to eq("manual")
      expect(engine.decide_with_llm(det, llm(recommendation: "approve", confidence: 0.9))[:outcome]).to eq("approved")
    end

    it "normalizes the recommendation ('  REJECT  ' counts as reject)" do
      result = engine.decide_with_llm(det, llm(recommendation: "  REJECT  ", confidence: 0.9))
      expect(result[:outcome]).to eq("rejected")
    end

    it "returns notice when a high-confidence approval carries a notice" do
      result = engine.decide_with_llm(det, llm(confidence: 0.95, notice: "Please fix your photos."))
      expect(result[:outcome]).to eq("notice")
      expect(result[:seller_message]).to eq("Please fix your photos.")
    end

    it "approves a high-confidence approval without notice" do
      result = engine.decide_with_llm(det, llm(confidence: 0.95))
      expect(result[:outcome]).to eq("approved")
      expect(result[:seller_message]).to be_nil
    end

    it "routes low confidence to manual" do
      result = engine.decide_with_llm(det, llm(confidence: 0.5))
      expect(result[:outcome]).to eq("manual")
      expect(result[:confidence]).to eq(0.5)
    end

    it "treats invalid confidence values as 0 (string, 0-100 integer, NaN, out of range)" do
      expect(engine.decide_with_llm(det, llm(confidence: "high"))[:confidence]).to eq(0)
      expect(engine.decide_with_llm(det, llm(confidence: 95))[:confidence]).to eq(0)
      expect(engine.decide_with_llm(det, llm(confidence: Float::NAN))[:confidence]).to eq(0)
      expect(engine.decide_with_llm(det, llm(confidence: -0.1))[:confidence]).to eq(0)
      expect(engine.decide_with_llm(det, llm(confidence: "high"))[:outcome]).to eq("manual")
    end

    it "flags unknown recommendations and routes to manual even at high confidence" do
      result = engine.decide_with_llm(det, llm(recommendation: "garbage", confidence: 0.99))
      expect(result[:outcome]).to eq("manual")
      expect(result[:matches].last[:action]).to eq("flag")
      expect(result[:matches].last[:tier]).to eq("manual")
    end

    it "respects enableAutoModeration: false" do
      offline = engine_with(
        [ rule("ai_one", "category" => "auto_ai", "action" => "reject", "priority" => 300) ],
        settings: { "enableAutoModeration" => false }
      )
      det_off = offline.evaluate({ "flag" => true })
      result = offline.decide_with_llm(det_off, llm(recommendation: "reject", confidence: 0.99))
      expect(result[:outcome]).to eq("manual")
      expect(result[:matches].last[:tier]).to eq("manual")
    end

    it "honours custom thresholds from settings" do
      strict = engine_with(
        [ rule("ai_one", "category" => "auto_ai", "action" => "reject", "priority" => 300) ],
        settings: { "autoApproveThreshold" => 0.5, "autoRejectThreshold" => 0.99 }
      )
      det_strict = strict.evaluate({ "flag" => true })
      expect(strict.decide_with_llm(det_strict, llm(recommendation: "approve", confidence: 0.6))[:outcome]).to eq("approved")
      expect(strict.decide_with_llm(det_strict, llm(recommendation: "reject", confidence: 0.9))[:outcome]).to eq("manual")
    end
  end
end
