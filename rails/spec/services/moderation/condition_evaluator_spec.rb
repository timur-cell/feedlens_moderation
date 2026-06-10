require "spec_helper"
require_relative "../../../app/services/moderation/condition_evaluator"

RSpec.describe Moderation::ConditionEvaluator do
  def evaluate(value, operator, target)
    described_class.evaluate(value, operator, target)
  end

  describe "missing values (JS undefined/null)" do
    it "only satisfies empty/is_null" do
      expect(evaluate(nil, "empty", true)).to be true
      expect(evaluate(nil, "is_null", true)).to be true
      expect(evaluate(nil, "not_empty", true)).to be false
      expect(evaluate(nil, "is_not_null", true)).to be false
    end

    it "skips every other operator, including is_false and not_in" do
      expect(evaluate(nil, "is_false", true)).to be false
      expect(evaluate(nil, "not_in", [ "a" ])).to be false
      expect(evaluate(nil, "not_contains", "a")).to be false
      expect(evaluate(nil, "neq", "a")).to be false
      expect(evaluate(nil, "lt", 5)).to be false
    end
  end

  describe "numeric operators with JS Number() coercion" do
    it "compares numbers" do
      expect(evaluate(4, "lt", 5)).to be true
      expect(evaluate(5, "lte", 5)).to be true
      expect(evaluate(5, "<", 5)).to be false
      expect(evaluate(6, "gt", 5)).to be true
      expect(evaluate(5, ">=", 5)).to be true
    end

    it "coerces numeric strings like JS Number()" do
      expect(evaluate("49.5", ">=", "50")).to be false
      expect(evaluate(50, ">=", "50")).to be true
      expect(evaluate(" 5 ", "lt", 6)).to be true
      expect(evaluate("", "lt", 1)).to be true # Number("") === 0
    end

    it "returns false when either side is NaN" do
      expect(evaluate("abc", "lt", 5)).to be false
      expect(evaluate("abc", "gte", 5)).to be false
      expect(evaluate(5, "lt", "abc")).to be false
      expect(evaluate("abc", "lte", "abc")).to be false
    end

    it "coerces booleans (Number(true) === 1)" do
      expect(evaluate(true, "gte", 1)).to be true
      expect(evaluate(false, "lt", 1)).to be true
    end
  end

  describe "eq/neq with JS String() coercion" do
    it "is case-insensitive" do
      expect(evaluate("RU", "eq", "ru")).to be true
      expect(evaluate("Other", "eq", "other")).to be true
      expect(evaluate("Other", "neq", "other")).to be false
    end

    it "formats integral floats like JS (String(5.0) === '5')" do
      expect(evaluate(5.0, "eq", 5)).to be true
      expect(evaluate(5.0, "eq", "5")).to be true
      expect(evaluate(5.5, "eq", "5.5")).to be true
    end

    it "stringifies booleans and zero" do
      expect(evaluate(true, "eq", true)).to be true
      expect(evaluate(true, "eq", "true")).to be true
      expect(evaluate(0, "eq", 0)).to be true
      expect(evaluate(0, "eq", false)).to be false # "0" != "false"
    end
  end

  describe "in/not_in" do
    it "stringifies and compares case-insensitively" do
      expect(evaluate("Madrid", "in", [ "madrid", "Lisbon" ])).to be true
      expect(evaluate(5.0, "in", [ "5" ])).to be true
      expect(evaluate("Porto", "in", [ "Madrid" ])).to be false
      expect(evaluate("Porto", "not_in", [ "Madrid" ])).to be true
      expect(evaluate("Madrid", "not_in", [ "Madrid" ])).to be false
    end

    it "returns false for non-array targets (both in and not_in)" do
      expect(evaluate("Madrid", "in", "Madrid")).to be false
      expect(evaluate("Madrid", "not_in", "Lisbon")).to be false
    end
  end

  describe "contains/not_contains" do
    it "is a case-insensitive substring check" do
      expect(evaluate("Luxury Penthouse", "contains", "penthouse")).to be true
      expect(evaluate("Luxury Penthouse", "not_contains", "studio")).to be true
      expect(evaluate("Cozy studio flat", "not_contains", "studio")).to be false
    end
  end

  describe "matches" do
    it "builds a case-insensitive regex from the target" do
      expect(evaluate("Penthouse Duplex Unit", "matches", "\\bduplex\\s+unit\\b")).to be true
      expect(evaluate("Penthouse Duplex", "matches", "\\bduplex\\s+unit\\b")).to be false
    end

    it "returns false for invalid regexes (TS try/catch)" do
      expect(evaluate("anything", "matches", "(unclosed")).to be false
    end

    it "anchors ^ and $ to the whole string like JS" do
      expect(evaluate("car", "matches", "^car$")).to be true
      expect(evaluate("sports car", "matches", "^car$")).to be false
      expect(evaluate("first\ncar", "matches", "^car$")).to be false # Ruby ^$ would match the second line
    end
  end

  describe "empty/not_empty" do
    it "treats JS-falsy values and blank strings as empty" do
      expect(evaluate("", "empty", true)).to be true
      expect(evaluate("   ", "empty", true)).to be true
      expect(evaluate(0, "empty", true)).to be true
      expect(evaluate(false, "empty", true)).to be true
      expect(evaluate("x", "empty", true)).to be false
      expect(evaluate("x", "not_empty", true)).to be true
      expect(evaluate("  ", "not_empty", true)).to be false
      expect(evaluate(0, "not_empty", true)).to be false
      expect(evaluate([], "not_empty", true)).to be true # arrays are truthy in JS
    end
  end

  describe "is_true/is_false" do
    it "is_true requires strict true" do
      expect(evaluate(true, "is_true", true)).to be true
      expect(evaluate(1, "is_true", true)).to be false
      expect(evaluate("true", "is_true", true)).to be false
    end

    it "is_false accepts false and any JS-falsy value" do
      expect(evaluate(false, "is_false", true)).to be true
      expect(evaluate(0, "is_false", true)).to be true
      expect(evaluate("", "is_false", true)).to be true
      expect(evaluate(true, "is_false", true)).to be false
      expect(evaluate("no", "is_false", true)).to be false
    end
  end

  it "returns false for unknown operators" do
    expect(evaluate("x", "wat", "x")).to be false
  end
end
