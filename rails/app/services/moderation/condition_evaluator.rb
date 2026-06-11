require_relative "js_compat"

# Port of evaluateCondition from convex/moderation.ts. Operates on a single
# listing value, operator string and target value with exact JS semantics:
# - missing (nil) listing values only satisfy empty/is_null;
# - numeric operators coerce both sides with JS Number() (NaN compares false);
# - eq/neq/in/not_in/contains compare JS String() values case-insensitively;
# - matches builds a case-insensitive RegExp and returns false when invalid.
module Moderation
  module ConditionEvaluator
    module_function

    def evaluate(value, operator, target)
      if value.nil?
        return true if operator == "empty" || operator == "is_null"
        return false if operator == "not_empty" || operator == "is_not_null"
        # Unknown field = skip the rule (don't match on missing data)
        return false
      end

      case operator
      when "lt", "<"
        JsCompat.js_number(value) < JsCompat.js_number(target)
      when "lte", "<="
        JsCompat.js_number(value) <= JsCompat.js_number(target)
      when "gt", ">"
        JsCompat.js_number(value) > JsCompat.js_number(target)
      when "gte", ">="
        JsCompat.js_number(value) >= JsCompat.js_number(target)
      when "eq", "=="
        JsCompat.js_string(value).downcase == JsCompat.js_string(target).downcase
      when "neq", "!="
        JsCompat.js_string(value).downcase != JsCompat.js_string(target).downcase
      when "in"
        target.is_a?(Array) && target.map { |t| JsCompat.js_string(t).downcase }.include?(JsCompat.js_string(value).downcase)
      when "not_in"
        target.is_a?(Array) && !target.map { |t| JsCompat.js_string(t).downcase }.include?(JsCompat.js_string(value).downcase)
      when "contains"
        JsCompat.js_string(value).downcase.include?(JsCompat.js_string(target).downcase)
      when "not_contains"
        !JsCompat.js_string(value).downcase.include?(JsCompat.js_string(target).downcase)
      when "matches"
        begin
          JsCompat.js_regexp(target).match?(JsCompat.js_string(value))
        rescue RegexpError
          false # invalid regex in rule config
        end
      when "empty"
        JsCompat.js_falsy?(value) || (value.is_a?(String) && value.strip.empty?)
      when "not_empty"
        JsCompat.js_truthy?(value) && (!value.is_a?(String) || !value.strip.empty?)
      when "is_true"
        value == true
      when "is_false"
        value == false || JsCompat.js_falsy?(value)
      else
        false
      end
    end
  end
end
