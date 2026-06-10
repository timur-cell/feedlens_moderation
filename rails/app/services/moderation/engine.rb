require_relative "js_compat"
require_relative "rule_evaluator"

# Port of the deterministic decision flow of the moderateListing action in
# convex/moderation.ts, plus the LLM confidence-routing step.
#
# Pure Ruby: no Rails, no ActiveRecord. Rules, lists and listings are plain
# Hashes with camelCase string keys (the shape of db/seed_data/*.json and of
# Convex listing documents).
#
# Usage:
#   engine = Moderation::Engine.new(rules: rules, lists: lists, settings: {})
#   result = engine.evaluate(listing)
#   # result[:outcome] is "rejected" | "approved" | "notice" | "manual"
#   # or :needs_llm — in which case run the LLM and finish with:
#   final = engine.decide_with_llm(result, llm_response) # llm_response may be nil
module Moderation
  class Engine
    DETERMINISTIC_CATEGORIES = %w[simple_code hybrid_vision internal].freeze
    # HIDDEN: the "accuracy" category is disabled upstream (commented out of
    # the deterministic filter in moderation.ts on 2026-03-17) — accuracy
    # rules exist in the seed data but are never evaluated. Mirrored here.
    AI_TRIGGER_CATEGORIES = %w[auto_ai former_manual].freeze

    DEFAULT_REJECT_MESSAGE = "Your listing does not meet our quality standards.".freeze
    DEFAULT_LLM_REJECT_MESSAGE = "Your listing does not meet our listing standards.".freeze
    DEFAULT_AUTO_APPROVE_THRESHOLD = 0.9
    DEFAULT_AUTO_REJECT_THRESHOLD = 0.85

    attr_reader :rules, :settings

    def initialize(rules:, lists:, settings: {})
      @settings = settings || {}
      lists_by_name = {}
      # getListsByNames takes the first row per name.
      lists.each { |list| lists_by_name[list["name"]] ||= list }

      # getEnabledRules only returns rules with enabled == true; the seeding
      # path defaults the flag to true when the JSON omits it.
      enabled = rules.select { |r| r.fetch("enabled", true) == true }

      # Resolve listRef/additionalListRef/excludeListRef into concrete
      # patterns before evaluation.
      resolved = enabled.map do |r|
        r.merge("config" => RuleEvaluator.resolve_list_refs(r["config"] || {}, lists_by_name))
      end

      # Sort by priority. JS Array#sort is stable; Ruby sort_by is not, so
      # tie-break on the original index.
      @rules = resolved.each_with_index.sort_by { |r, i| [ r["priority"], i ] }.map(&:first)
    end

    # Deterministic phase of moderateListing. Returns a Hash:
    #   matches:          ordered rule-match Hashes
    #   outcome:          "rejected"|"approved"|"notice"|"manual" or :needs_llm
    #   needs_llm:        whether an auto_ai/former_manual rule matched
    #   llm_rule_matches: names of the AI-trigger rules that matched
    #   seller_message:   message for the seller (or nil)
    #   confidence:       decision confidence (or nil)
    #
    # NOTE: step 3b of the TS action (on-demand vision when an auto_ai rule
    # triggers on a listing without vision data) is intentionally not ported —
    # it calls an external vision action. Listings are expected to carry their
    # chatGpt* fields already (the step is also a no-op without imageUrls).
    def evaluate(listing)
      matches = []
      has_vision_data = !listing["chatGptPropertyCondition"].nil?

      # 2. Evaluate deterministic rules: simple_code + hybrid_vision + internal
      deterministic_rules.each do |rule|
        config = rule["config"]
        result =
          if rule["category"] == "accuracy"
            # Unreachable while accuracy is excluded from
            # DETERMINISTIC_CATEGORIES; kept to mirror the TS dispatch.
            RuleEvaluator.evaluate_accuracy(listing, config)
          elsif rule["category"] == "hybrid_vision"
            # Skip hybrid rules when no vision data
            next unless has_vision_data
            RuleEvaluator.evaluate_hybrid_vision(listing, config)
          elsif JsCompat.js_truthy?(config["officeIds"]) || JsCompat.js_truthy?(config["officeNames"])
            RuleEvaluator.evaluate_office(listing, config)
          elsif JsCompat.js_truthy?(config["patterns"]) || JsCompat.js_truthy?(config["textLists"])
            RuleEvaluator.evaluate_regex(listing, config)
          else
            RuleEvaluator.evaluate_simple(listing, config)
          end
        matches << build_match(rule, result) if result[:matched]
      end

      # Immediate rejection (tier: auto)
      auto_rejects = matches.select { |m| m[:tier] == "auto" && m[:action] == "reject" }
      if auto_rejects.any?
        seller_msg = JsCompat.js_or(auto_rejects.first[:message], DEFAULT_REJECT_MESSAGE)
        return result_hash(matches, "rejected", seller_message: seller_msg, confidence: 1.0)
      end

      # Auto-approve short-circuit (e.g. outdated_paid_approve)
      auto_approves = matches.select { |m| m[:tier] == "auto" && m[:action] == "approve" }
      if auto_approves.any?
        seller_msg = auto_approves.map { |m| m[:message] }.select { |m| JsCompat.js_truthy?(m) }.join("\n")
        return result_hash(matches, "approved", seller_message: presence(seller_msg), confidence: 1.0)
      end

      # Auto-notices from deterministic rules (used in step 7)
      auto_notices = matches.select { |m| m[:tier] == "auto" && m[:action] == "notice" }

      # 3. Evaluate AI-trigger rules: auto_ai + former_manual
      needs_llm = false
      llm_rule_matches = []
      ai_trigger_rules.each do |rule|
        config = rule["config"]
        result =
          if JsCompat.js_truthy?(config["patterns"]) || JsCompat.js_truthy?(config["textLists"])
            RuleEvaluator.evaluate_regex(listing, config)
          else
            RuleEvaluator.evaluate_simple(listing, config)
          end
        next unless result[:matched]
        matches << build_match(rule, result)
        llm_rule_matches << rule["name"]
        needs_llm = true
      end

      # 4. AI-trigger match -> LLM assessment required (caller runs the LLM
      # and finishes with decide_with_llm).
      if needs_llm
        return result_hash(matches, :needs_llm, needs_llm: true, llm_rule_matches: llm_rule_matches)
      end

      # 6. Matched rules that still need human review
      manual_matches = matches.select { |m| m[:tier] == "manual" || m[:tier] == "verify" || m[:action] == "flag" }
      if manual_matches.any?
        return result_hash(matches, "manual")
      end

      # 7. If only notices, approve with notice
      if auto_notices.any?
        seller_msg = auto_notices.map { |m| m[:message] }.select { |m| JsCompat.js_truthy?(m) }.join("\n")
        return result_hash(matches, "notice", seller_message: presence(seller_msg), confidence: 1.0)
      end

      # 8. All clear -> approve
      result_hash(matches, "approved", confidence: 1.0)
    end

    # LLM confidence routing (step 4/5 of the TS action). Takes the result of
    # #evaluate (with outcome :needs_llm) and the parsed LLM response Hash
    # ({ "recommendation" =>, "confidence" =>, "notice" =>, "assessment" => })
    # or nil when the LLM is unavailable/failed.
    def decide_with_llm(deterministic_result, llm_response)
      return deterministic_result unless deterministic_result[:needs_llm]

      matches = deterministic_result[:matches].dup
      llm_rule_matches = deterministic_result[:llm_rule_matches]

      # No LLM available -> manual queue
      if llm_response.nil?
        return result_hash(matches, "manual", needs_llm: true, llm_rule_matches: llm_rule_matches, confidence: 0)
      end

      # Only a finite number in [0, 1] can drive an automated decision.
      raw_confidence = llm_response["confidence"]
      confidence = valid_confidence?(raw_confidence) ? raw_confidence : 0

      # Only a known recommendation value may drive an automated decision.
      rec = JsCompat.js_string(JsCompat.js_or(llm_response["recommendation"], "")).strip.downcase
      valid_recommendation = %w[approve reject notice].include?(rec)

      approve_threshold = @settings["autoApproveThreshold"].is_a?(Numeric) ? @settings["autoApproveThreshold"] : DEFAULT_AUTO_APPROVE_THRESHOLD
      reject_threshold = @settings["autoRejectThreshold"].is_a?(Numeric) ? @settings["autoRejectThreshold"] : DEFAULT_AUTO_REJECT_THRESHOLD
      threshold = rec == "reject" ? reject_threshold : approve_threshold
      high_confidence = valid_recommendation && @settings["enableAutoModeration"] != false && confidence >= threshold

      matches << {
        rule_name: "llm_assessment",
        rule_category: "auto_ai",
        tier: high_confidence ? "auto" : "manual",
        action: valid_recommendation ? rec : "flag",
        message: llm_response["notice"],
        details: JsCompat.js_or(llm_response["assessment"], "")
      }

      if high_confidence
        if rec == "reject"
          reject_msg = JsCompat.js_or(llm_response["notice"], DEFAULT_LLM_REJECT_MESSAGE)
          return result_hash(matches, "rejected", needs_llm: true, llm_rule_matches: llm_rule_matches,
                                                  seller_message: reject_msg, confidence: confidence)
        end
        # High confidence approve with possible notice
        if JsCompat.js_truthy?(llm_response["notice"])
          return result_hash(matches, "notice", needs_llm: true, llm_rule_matches: llm_rule_matches,
                                                seller_message: llm_response["notice"], confidence: confidence)
        end
        # High confidence approve, no notice -> auto-approve
        return result_hash(matches, "approved", needs_llm: true, llm_rule_matches: llm_rule_matches,
                                                confidence: confidence)
      end

      # Below threshold -> manual queue
      result_hash(matches, "manual", needs_llm: true, llm_rule_matches: llm_rule_matches, confidence: confidence)
    end

    private

    def deterministic_rules
      @deterministic_rules ||= @rules.select { |r| DETERMINISTIC_CATEGORIES.include?(r["category"]) }
    end

    def ai_trigger_rules
      @ai_trigger_rules ||= @rules.select { |r| AI_TRIGGER_CATEGORIES.include?(r["category"]) }
    end

    def build_match(rule, result)
      {
        rule_name: rule["name"],
        rule_category: rule["category"],
        tier: rule["tier"],
        action: rule["action"],
        message: rule["sellerMessage"],
        details: result[:details]
      }
    end

    def result_hash(matches, outcome, needs_llm: false, llm_rule_matches: [], seller_message: nil, confidence: nil)
      {
        matches: matches,
        outcome: outcome,
        needs_llm: needs_llm,
        llm_rule_matches: llm_rule_matches,
        seller_message: seller_message,
        confidence: confidence
      }
    end

    def presence(str)
      JsCompat.js_truthy?(str) ? str : nil
    end

    # typeof x === "number" && isFinite(x) && x >= 0 && x <= 1
    def valid_confidence?(value)
      value.is_a?(Numeric) && value.to_f.finite? && value >= 0 && value <= 1
    end
  end
end
