require_relative "js_compat"
require_relative "country_matcher"
require_relative "condition_evaluator"

# Port of the per-rule evaluators from convex/moderation.ts:
# evaluateSimpleRule, evaluateRegexRule, evaluateHybridVisionRule,
# evaluateAccuracyRule, evaluateOfficeRule and resolveListRefs/escapeRegex.
#
# Listings, configs and lists are plain Hashes with camelCase string keys —
# the same shape as the Convex documents / db/seed_data JSON files.
#
# Config keys intentionally NOT read here (because moderation.ts never reads
# them): customCheck, requireBothFields, exceptionLists, excludeBodyKeywords,
# createdBeforeYear, excludeTitleListRef, minConfidence, note,
# listingCategory. Rules whose config only carries those keys plus filters
# fall into the "Filters-only rule" no-match branch, exactly as in TS.
module Moderation
  module RuleEvaluator
    module_function

    # JS template-literal interpolation (`${value}`).
    def interp(value)
      JsCompat.js_string(value)
    end

    # JS `a || b || ""` for string-ish fields.
    def fallback(*values)
      JsCompat.js_or(*values, "")
    end

    # JS `listing.priceUsd || listing.price || 0`.
    def price_of(listing)
      JsCompat.js_or(listing["priceUsd"], listing["price"], 0)
    end

    # JS `listing.office ? Number(listing.office) : (listing.officeId ? Number(listing.officeId) : null)`.
    def office_id_of(listing)
      if JsCompat.js_truthy?(listing["office"])
        JsCompat.js_number(listing["office"])
      elsif JsCompat.js_truthy?(listing["officeId"])
        JsCompat.js_number(listing["officeId"])
      end
    end

    # JS strict equality between a config number and the coerced office id.
    def office_id_included?(values, office_id)
      values.any? { |v| v.is_a?(Numeric) && office_id.is_a?(Numeric) && v.to_f == office_id.to_f }
    end

    # `(listing.category || "").toLowerCase().replace("listing::", "")
    #   .replace("realestate", "real_estate").replace(/^car$/i, "cars")`
    # (JS String#replace with a string pattern replaces the first occurrence).
    def normalized_category(listing)
      raw = fallback(listing["category"]).downcase
      raw.sub("listing::", "").sub("realestate", "real_estate").sub(/\Acar\z/i, "cars")
    end

    def category_filter_match?(cat, filter)
      filter.any? do |f|
        nf = f.downcase
        cat.include?(nf) || nf.include?(cat)
      end
    end

    def exclude_type_match?(re_type, filter)
      filter.any? do |f|
        nf = f.downcase.gsub(" ", "_")
        re_type == nf || re_type == f.downcase || re_type.gsub("_", " ") == f.downcase
      end
    end

    # ─── evaluateSimpleRule ─────────────────────────────────────────
    def evaluate_simple(listing, config)
      filter_checks = []

      # Country filter (handles both ISO codes and full names)
      if config["countryFilter"].is_a?(Array)
        unless CountryMatcher.matches?(listing["country"], config["countryFilter"])
          return { matched: false, details: "country #{interp(listing["country"])} not in #{interp(config["countryFilter"])}" }
        end
        filter_checks << "country=#{interp(listing["country"])} ✓"
      end
      if config["excludeCountries"].is_a?(Array)
        if JsCompat.js_truthy?(listing["country"]) && CountryMatcher.matches?(listing["country"], config["excludeCountries"])
          return { matched: false, details: "country #{interp(listing["country"])} excluded" }
        end
      end

      # Category filter (real_estate, cars, etc.)
      if config["categoryFilter"].is_a?(Array)
        cat = normalized_category(listing)
        # Empty category must not pass: ""'s substring check matches any filter.
        if cat.empty?
          return { matched: false, details: "category unknown, filter #{interp(config["categoryFilter"])}" }
        end
        unless category_filter_match?(cat, config["categoryFilter"])
          return { matched: false, details: "category #{interp(listing["category"])} not in #{interp(config["categoryFilter"])}" }
        end
      end

      # Account type filter (uses officeSubscription field)
      if config["accountTypeFilter"].is_a?(Array)
        acct = fallback(listing["officeSubscription"], listing["accountType"]).downcase
        if acct.empty? || config["accountTypeFilter"].none? { |f| acct.include?(f.downcase) }
          return { matched: false, details: "accountType #{acct.empty? ? "unknown" : acct} not in #{interp(config["accountTypeFilter"])}" }
        end
        filter_checks << "accountType=#{acct} ✓"
      end
      if config["excludeAccountTypes"].is_a?(Array)
        acct = fallback(listing["officeSubscription"], listing["accountType"]).downcase
        if !acct.empty? && config["excludeAccountTypes"].any? { |f| acct.include?(f.downcase) }
          return { matched: false, details: "accountType #{acct} excluded" }
        end
      end

      # Real estate type filter
      if config["typeFilter"].is_a?(Array)
        re_type = fallback(listing["realEstateType"]).downcase
        if re_type.empty? || config["typeFilter"].none? { |f| re_type == f.downcase }
          return { matched: false, details: "type #{interp(listing["realEstateType"])} not in #{interp(config["typeFilter"])}" }
        end
      end
      if config["excludeTypes"].is_a?(Array)
        re_type = fallback(listing["realEstateType"]).downcase
        if !re_type.empty? && exclude_type_match?(re_type, config["excludeTypes"])
          return { matched: false, details: "type #{interp(listing["realEstateType"])} excluded" }
        end
      end

      # Office filter (uses office field)
      if config["officeFilter"].is_a?(Array)
        office_id = office_id_of(listing)
        if JsCompat.js_falsy?(office_id) || !office_id_included?(config["officeFilter"], office_id)
          return { matched: false, details: "office #{interp(office_id)} not in #{interp(config["officeFilter"])}" }
        end
        filter_checks << "office=#{interp(office_id)} ✓"
      end
      if config["excludeOffices"].is_a?(Array)
        office_id = office_id_of(listing)
        if JsCompat.js_truthy?(office_id) && office_id_included?(config["excludeOffices"], office_id)
          return { matched: false, details: "office #{interp(office_id)} excluded" }
        end
      end

      # Group filter (uses officeGroupName field)
      if config["groupFilter"].is_a?(Array)
        group_id = fallback(listing["officeGroupName"], listing["officeGroupId"])
        if JsCompat.js_falsy?(group_id) || config["groupFilter"].none? { |f| JsCompat.js_string(group_id) == f }
          return { matched: false, details: "group #{interp(group_id)} not in #{interp(config["groupFilter"])}" }
        end
      end

      # Outdated filter
      if config["outdated"] == true && JsCompat.js_falsy?(listing["outdated"])
        return { matched: false, details: "listing not outdated" }
      end

      # Rental filter
      if config["rentalOnly"] == true && JsCompat.js_falsy?(listing["rental"])
        return { matched: false, details: "not a rental" }
      end
      if config["nonRentalOnly"] == true && listing["rental"] == true
        return { matched: false, details: "is a rental (nonRentalOnly)" }
      end

      # Max/min price shorthand
      unless config["maxPrice"].nil?
        price = price_of(listing)
        if JsCompat.js_number(price) > JsCompat.js_number(config["maxPrice"])
          return { matched: false, details: "price #{interp(price)} > maxPrice #{interp(config["maxPrice"])}" }
        end
      end
      unless config["minPrice"].nil?
        price = price_of(listing)
        if JsCompat.js_number(price) < JsCompat.js_number(config["minPrice"])
          return { matched: false, details: "price #{interp(price)} < minPrice #{interp(config["minPrice"])}" }
        end
      end

      # Title exclude keywords
      if config["excludeTitleKeywords"].is_a?(Array)
        title = fallback(listing["title"]).downcase
        if config["excludeTitleKeywords"].any? { |kw| title.include?(kw.downcase) }
          return { matched: false, details: "title contains excluded keyword" }
        end
      end

      # Feed source filter
      if config["feedSourceFilter"].is_a?(Array)
        src = fallback(listing["feedSource"]).downcase
        if src.empty? || config["feedSourceFilter"].none? { |f| src.include?(f.downcase) }
          return { matched: false, details: "feedSource #{interp(JsCompat.js_or(listing["feedSource"], "unknown"))} not in #{interp(config["feedSourceFilter"])}" }
        end
        filter_checks << "feedSource=#{src} ✓"
      end

      # ─── Evaluate conditions ───
      conditions_met = true
      cond_details = filter_checks.dup

      # Conditions: AND by default, OR when requireAll === false.
      # Note: an empty conditions array is truthy in JS, so it enters this
      # branch and every([]) === true.
      if JsCompat.js_truthy?(config["conditions"])
        results = config["conditions"].map do |c|
          ConditionEvaluator.evaluate(listing[c["field"]], c["operator"], c["value"])
        end
        met = config["requireAll"] == false ? results.any? : results.all?
        conditions_met = false unless met
        config["conditions"].each_with_index do |c, i|
          cond_details << "#{c["field"]} #{c["operator"]} #{interp(c["value"])}: #{results[i] ? "✓" : "✗"}"
        end
      end

      # OR conditions (at least one must match)
      if config["orConditions"].is_a?(Array)
        results = config["orConditions"].map do |c|
          ConditionEvaluator.evaluate(listing[c["field"]], c["operator"], c["value"])
        end
        conditions_met = false unless results.any?
        inner = config["orConditions"].each_with_index.map do |c, i|
          "#{c["field"]} #{c["operator"]} #{interp(c["value"])}: #{results[i] ? "✓" : "✗"}"
        end
        cond_details << "OR(#{inner.join(", ")})"
      end

      # Single field/operator
      if JsCompat.js_falsy?(config["conditions"]) && JsCompat.js_falsy?(config["orConditions"]) &&
         JsCompat.js_truthy?(config["field"]) && JsCompat.js_truthy?(config["operator"])
        val = listing[config["field"]]
        conditions_met = ConditionEvaluator.evaluate(val, config["operator"], config["value"])
        cond_details << "#{config["field"]}=#{interp(val)} #{config["operator"]} #{interp(config["value"])}"
      end

      # If no conditions at all, just filters: rules with only filters but no
      # conditions are structural rules (like duplicate checks) that need
      # additional logic not yet implemented — never match.
      if JsCompat.js_falsy?(config["conditions"]) && JsCompat.js_falsy?(config["orConditions"]) &&
         JsCompat.js_falsy?(config["field"])
        return { matched: false, details: "Filters-only rule (no conditions to evaluate)" }
      end

      { matched: conditions_met, details: cond_details.join(", ") }
    end

    # ─── evaluateRegexRule ──────────────────────────────────────────
    def evaluate_regex(listing, config)
      # Pre-flight filters (same as simple rules)
      if config["categoryFilter"].is_a?(Array)
        cat = normalized_category(listing)
        # Empty category must not pass: ""'s substring check matches any filter.
        if cat.empty? || !category_filter_match?(cat, config["categoryFilter"])
          return { matched: false, details: "category #{interp(listing["category"])} not in #{interp(config["categoryFilter"])}", matched_patterns: [] }
        end
      end
      if config["countryFilter"].is_a?(Array)
        unless CountryMatcher.matches?(listing["country"], config["countryFilter"])
          return { matched: false, details: "country #{interp(listing["country"])} not in #{interp(config["countryFilter"])}", matched_patterns: [] }
        end
      end
      if config["excludeTypes"].is_a?(Array)
        re_type = fallback(listing["realEstateType"]).downcase
        if !re_type.empty? && exclude_type_match?(re_type, config["excludeTypes"])
          return { matched: false, details: "type #{interp(listing["realEstateType"])} excluded", matched_patterns: [] }
        end
      end
      if config["typeFilter"].is_a?(Array)
        re_type = fallback(listing["realEstateType"]).downcase
        if re_type.empty? || config["typeFilter"].none? { |f| re_type == f.downcase }
          return { matched: false, details: "type #{interp(listing["realEstateType"])} not in #{interp(config["typeFilter"])}", matched_patterns: [] }
        end
      end
      if config["accountTypeFilter"].is_a?(Array)
        acct = fallback(listing["officeSubscription"], listing["accountType"]).downcase
        if acct.empty? || config["accountTypeFilter"].none? { |f| acct.include?(f.downcase) }
          return { matched: false, details: "accountType not in #{interp(config["accountTypeFilter"])}", matched_patterns: [] }
        end
      end
      unless config["maxPrice"].nil?
        price = price_of(listing)
        if JsCompat.js_number(price) > JsCompat.js_number(config["maxPrice"])
          return { matched: false, details: "price > maxPrice", matched_patterns: [] }
        end
      end

      patterns = config["patterns"] || []
      fields = config["fields"] || [ "title", "description" ]
      matched_patterns = []

      patterns.each do |pattern|
        begin
          regex = JsCompat.js_regexp(pattern)
        rescue RegexpError
          next # Skip invalid regex
        end
        fields.each do |field|
          value = listing[field]
          if value.is_a?(String) && regex.match?(value)
            matched_patterns << "\"#{pattern}\" in #{field}"
          end
        end
      end

      # Also check text lists
      if JsCompat.js_truthy?(config["textLists"])
        config["textLists"].each do |list_name, words|
          fields.each do |field|
            value = listing[field]
            next unless value.is_a?(String)
            lower_value = value.downcase
            words.each do |word|
              if lower_value.include?(word.downcase)
                matched_patterns << "\"#{word}\" (#{list_name}) in #{field}"
              end
            end
          end
        end
      end

      if matched_patterns.empty?
        return { matched: false, details: "No pattern matches", matched_patterns: [] }
      end

      # Check exclude patterns (if ANY exclude matches, rule does NOT fire)
      if config["excludePatterns"].is_a?(Array)
        exclude_fields = config["excludeFields"].is_a?(Array) ? config["excludeFields"] : [ "title", "description" ]
        config["excludePatterns"].each do |pattern|
          begin
            regex = JsCompat.js_regexp(pattern)
          rescue RegexpError
            next # skip invalid
          end
          exclude_fields.each do |field|
            value = listing[field]
            if value.is_a?(String) && regex.match?(value)
              return { matched: false, details: "Excluded by \"#{pattern}\" in #{field}", matched_patterns: [] }
            end
          end
        end
      end

      {
        matched: true,
        details: "Matched: #{matched_patterns.join("; ")}",
        matched_patterns: matched_patterns
      }
    end

    # ─── evaluateHybridVisionRule ───────────────────────────────────
    # Checks GPT/Claude vision scores against thresholds.
    def evaluate_hybrid_vision(listing, config)
      # ─── Pre-flight filters (same as simple rules, with country normalization) ───
      if config["countryFilter"].is_a?(Array)
        unless CountryMatcher.matches?(listing["country"], config["countryFilter"])
          return { matched: false, details: "country #{interp(listing["country"])} not in #{interp(config["countryFilter"])}" }
        end
      end
      if config["excludeCountries"].is_a?(Array)
        if JsCompat.js_truthy?(listing["country"]) && CountryMatcher.matches?(listing["country"], config["excludeCountries"])
          return { matched: false, details: "country #{interp(listing["country"])} excluded" }
        end
      end
      if config["categoryFilter"].is_a?(Array)
        cat = normalized_category(listing)
        if cat.empty? || !category_filter_match?(cat, config["categoryFilter"])
          return { matched: false, details: "category #{interp(listing["category"])} not in #{interp(config["categoryFilter"])}" }
        end
      end
      unless config["maxPrice"].nil?
        price = price_of(listing)
        if JsCompat.js_number(price) > JsCompat.js_number(config["maxPrice"])
          return { matched: false, details: "price #{interp(price)} > maxPrice #{interp(config["maxPrice"])}" }
        end
      end
      unless config["minPrice"].nil?
        price = price_of(listing)
        if JsCompat.js_number(price) < JsCompat.js_number(config["minPrice"])
          return { matched: false, details: "price #{interp(price)} < minPrice #{interp(config["minPrice"])}" }
        end
      end
      if config["excludeTypes"].is_a?(Array)
        re_type = fallback(listing["realEstateType"]).downcase
        if !re_type.empty? && exclude_type_match?(re_type, config["excludeTypes"])
          return { matched: false, details: "type #{interp(listing["realEstateType"])} excluded" }
        end
      end
      if config["typeFilter"].is_a?(Array)
        re_type = fallback(listing["realEstateType"]).downcase
        if re_type.empty? || config["typeFilter"].none? { |f| re_type == f.downcase }
          return { matched: false, details: "type #{interp(listing["realEstateType"])} not in #{interp(config["typeFilter"])}" }
        end
      end
      if config["accountTypeFilter"].is_a?(Array)
        acct = fallback(listing["officeSubscription"], listing["accountType"]).downcase
        if acct.empty? || config["accountTypeFilter"].none? { |f| acct.include?(f.downcase) }
          return { matched: false, details: "accountType not in #{interp(config["accountTypeFilter"])}" }
        end
      end
      if config["excludeOffices"].is_a?(Array)
        office_id = office_id_of(listing)
        if JsCompat.js_truthy?(office_id) && office_id_included?(config["excludeOffices"], office_id)
          return { matched: false, details: "office #{interp(office_id)} excluded" }
        end
      end
      if config["excludeTitleKeywords"].is_a?(Array)
        title = fallback(listing["title"]).downcase
        if config["excludeTitleKeywords"].any? { |kw| title.include?(kw.downcase) }
          return { matched: false, details: "title contains excluded keyword" }
        end
      end

      # ─── Vision score checks ───
      condition = listing["chatGptPropertyCondition"]
      conclusion = listing["chatGptConclusion"]
      conclusion_num = conclusion.nil? ? nil : JsCompat.js_number(conclusion)
      watermark_text = fallback(listing["chatGptWatermarkText"]).downcase
      watermark_share = listing["chatGptWatermarkShare"]

      # Type 1: Score thresholds (condition AND conclusion must be below thresholds)
      if JsCompat.js_truthy?(config["scoreThresholds"])
        thresholds = config["scoreThresholds"]

        # If no vision scores available, rule cannot match (don't flag without data)
        if condition.nil? || conclusion_num.nil?
          return { matched: false, details: "no vision scores available (condition=#{interp(condition)}, conclusion=#{interp(conclusion)})" }
        end

        condition_match = thresholds.key?("condition") ? JsCompat.js_number(condition) <= JsCompat.js_number(thresholds["condition"]) : true
        conclusion_match = thresholds.key?("conclusion") ? conclusion_num <= JsCompat.js_number(thresholds["conclusion"]) : true

        if condition_match && conclusion_match
          return {
            matched: true,
            details: "condition=#{interp(condition)}≤#{interp(thresholds["condition"])}, conclusion=#{interp(conclusion_num)}≤#{interp(thresholds["conclusion"])}"
          }
        end
        return {
          matched: false,
          details: "scores OK: condition=#{interp(condition)}>#{interp(JsCompat.js_or(thresholds["condition"], "n/a"))}, conclusion=#{interp(conclusion_num)}>#{interp(JsCompat.js_or(thresholds["conclusion"], "n/a"))}"
        }
      end

      # Type 2: Watermark keyword check
      if config["checkType"] == "watermark" && JsCompat.js_truthy?(config["watermarkKeywords"])
        if watermark_text.empty?
          return { matched: false, details: "no watermark text detected" }
        end
        matched_kw = config["watermarkKeywords"].select { |kw| watermark_text.include?(kw.downcase) }
        if matched_kw.any?
          return { matched: true, details: "watermark text \"#{watermark_text}\" contains: #{matched_kw.join(", ")}" }
        end
        return { matched: false, details: "watermark text \"#{watermark_text}\" doesn't match keywords" }
      end

      # Type 3: Unidentifiable property check
      if config["checkType"] == "unidentifiable"
        # Check if condition is 0 (mapped from "Unidentifiable" text) or conclusion mentions it
        is_unidentifiable = (condition.is_a?(Numeric) && condition.to_f.zero?) ||
                            (listing["chatGptConclusion"].is_a?(String) && listing["chatGptConclusion"].downcase.include?("unidentif"))

        if is_unidentifiable
          return { matched: true, details: "property unidentifiable (condition=#{interp(condition)})" }
        end
        # Also flag very low condition with low conclusion as potentially unidentifiable
        if !condition.nil? && JsCompat.js_number(condition) <= 1.0 && !conclusion_num.nil? && conclusion_num <= 1.5
          return { matched: true, details: "near-unidentifiable: condition=#{interp(condition)}, conclusion=#{interp(conclusion_num)}" }
        end
        return { matched: false, details: "property identifiable (condition=#{interp(condition)})" }
      end

      # Type 4: Watermark size check
      if config["checkType"] == "watermark_size"
        if watermark_share.nil? || (watermark_share.is_a?(Numeric) && watermark_share.to_f.zero?)
          return { matched: false, details: "no watermarks detected" }
        end
        threshold = JsCompat.js_or(config["watermarkShareThreshold"], 3)
        if JsCompat.js_number(watermark_share) >= JsCompat.js_number(threshold)
          return { matched: true, details: "watermark share #{interp(watermark_share)} >= #{interp(threshold)}" }
        end
        return { matched: false, details: "watermark share #{interp(watermark_share)} < #{interp(threshold)}" }
      end

      # Fallback: no recognized vision check type
      { matched: false, details: "no vision check type matched in config" }
    end

    # ─── evaluateAccuracyRule (LAS integration) ─────────────────────
    # NOTE: the accuracy category is disabled in the deterministic phase
    # (commented out in moderation.ts on 2026-03-17), so this evaluator is
    # currently unreachable from Engine#evaluate. It is ported to keep parity
    # with the TS file for an eventual rollback.
    def evaluate_accuracy(listing, config)
      flags = JsCompat.js_or(listing["accuracyFlags"], [])
      score = listing["accuracyScore"]
      acct_type = fallback(listing["officeSubscription"], listing["accountType"]).downcase

      # Account type filter
      if config["accountTypeFilter"].is_a?(Array)
        if acct_type.empty? || config["accountTypeFilter"].none? { |f| acct_type.include?(f.downcase) }
          return { matched: false, details: "accountType #{acct_type.empty? ? "unknown" : acct_type} not in #{interp(config["accountTypeFilter"])}" }
        end
      end

      # No accuracy data at all -> skip
      if flags.empty? && score.nil?
        return { matched: false, details: "no LAS accuracy data" }
      end

      # Score-based check (e.g. las_score_critical)
      unless config["maxAccuracyScore"].nil?
        if !score.nil? && JsCompat.js_number(score) <= JsCompat.js_number(config["maxAccuracyScore"])
          return { matched: true, details: "accuracy score #{format("%.2f", score)} ≤ #{interp(config["maxAccuracyScore"])}" }
        end
        if score.nil?
          return { matched: false, details: "no accuracy score available" }
        end
        return { matched: false, details: "accuracy score #{format("%.2f", score)} > #{interp(config["maxAccuracyScore"])}" }
      end

      # Single flag check
      if config["accuracyFlag"].is_a?(String) && JsCompat.js_truthy?(config["accuracyFlag"])
        if flags.include?(config["accuracyFlag"])
          return { matched: true, details: "LAS flag: #{config["accuracyFlag"]} (score: #{score.nil? ? "n/a" : format("%.2f", score)})" }
        end
        return { matched: false, details: "flag #{config["accuracyFlag"]} not in [#{flags.join(", ")}]" }
      end

      # Multi-flag check (matchAny = true -> any flag matches; false -> all must match)
      if config["accuracyFlags"].is_a?(Array)
        match_any = config["matchAny"] != false # default true
        matched =
          if match_any
            config["accuracyFlags"].any? { |f| flags.include?(f) }
          else
            config["accuracyFlags"].all? { |f| flags.include?(f) }
          end

        if matched
          found = config["accuracyFlags"].select { |f| flags.include?(f) }
          return { matched: true, details: "LAS flags: #{found.join(", ")} (score: #{score.nil? ? "n/a" : format("%.2f", score)})" }
        end
        return { matched: false, details: "flags #{config["accuracyFlags"].join(", ")} not found in [#{flags.join(", ")}]" }
      end

      { matched: false, details: "no accuracy check matched in config" }
    end

    # ─── evaluateOfficeRule ─────────────────────────────────────────
    # NOTE: the TS version calls .toLowerCase() on
    # (officeGroupName || office || "") and would throw a TypeError when
    # `office` is a number and officeGroupName is absent. The Ruby port
    # coerces with String() instead of raising; listings are expected to
    # carry office ids as strings (as the push pipeline does).
    def evaluate_office(listing, config)
      office_names = (config["officeNames"] || []).map(&:downcase)
      # Normalize to strings — configs may store numeric ids while the
      # listing field is a string (or vice versa).
      office_ids = (config["officeIds"] || []).map { |id| JsCompat.js_string(id) }

      listing_office = JsCompat.js_string(fallback(listing["officeGroupName"], listing["office"])).downcase

      if office_names.any? && office_names.any? { |n| listing_office.include?(n) }
        return { matched: true, details: "Office \"#{listing_office}\" matches rule" }
      end
      if office_ids.any? && office_ids.include?(JsCompat.js_string(listing["office"].nil? ? "" : listing["office"]))
        return { matched: true, details: "Office ID \"#{interp(listing["office"])}\" matches rule" }
      end

      { matched: false, details: "Office \"#{listing_office}\" not in rule" }
    end

    # ─── Moderation list resolution (resolveListRefs / escapeRegex) ──
    # Rules can reference moderationLists rows via config listRef /
    # additionalListRef (match lists) and excludeListRef (exclusion list).
    # Resolve those references into the patterns/textLists/excludePatterns
    # shape the regex evaluator understands.
    def escape_regex(str)
      str.gsub(/[.*+?^${}()|\[\]\\]/) { |m| "\\#{m}" }
    end

    def resolve_list_refs(config, lists_by_name)
      ref_names = [ config["listRef"], config["additionalListRef"] ].select { |n| n.is_a?(String) }
      exclude_name = config["excludeListRef"].is_a?(String) ? config["excludeListRef"] : nil
      return config if ref_names.empty? && exclude_name.nil?

      resolved = config.dup
      patterns = (config["patterns"] || []).dup
      text_lists = (config["textLists"] || {}).dup

      ref_names.each do |name|
        list = lists_by_name[name]
        next if list.nil?
        words = []
        (list["items"] || []).each do |item|
          if item["type"] == "regex" && JsCompat.js_truthy?(item["pattern"])
            patterns << item["pattern"]
          elsif JsCompat.js_truthy?(item["value"])
            words << item["value"]
          end
        end
        text_lists[name] = (text_lists[name] || []) + words if words.any?
      end
      resolved["patterns"] = patterns if patterns.any?
      resolved["textLists"] = text_lists if text_lists.any?

      if exclude_name
        list = lists_by_name[exclude_name]
        if list
          exclude_patterns = (config["excludePatterns"] || []).dup
          (list["items"] || []).each do |item|
            if item["type"] == "regex" && JsCompat.js_truthy?(item["pattern"])
              exclude_patterns << item["pattern"]
            elsif JsCompat.js_truthy?(item["value"])
              exclude_patterns << escape_regex(item["value"])
            end
          end
          resolved["excludePatterns"] = exclude_patterns if exclude_patterns.any?
        end
      end

      resolved
    end
  end
end
