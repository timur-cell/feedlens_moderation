module Moderation
  # Orchestrates a full moderation run for a listing: AI parameter scan,
  # rule engine, on-demand vision for auto_ai matches, LLM verification,
  # persistence, rule stats and Implio submission. Port of the
  # moderateListing action in convex/moderation.ts.
  class Runner
    DEFAULT_LLM_MODEL = "claude-haiku-4-5-20251001".freeze
    MAX_VISION_IMAGES = 10

    # Namespace for pg advisory locks taken per listing (classid argument of
    # pg_try_advisory_lock(int4, int4)); chosen arbitrarily, must just be
    # stable and unique to "moderation run" within this app.
    ADVISORY_LOCK_CLASS = 7_413

    class << self
      def call(listing, moderator: nil)
        # A locked listing carries a final human decision — automated
        # re-moderation must never change or shadow it.
        if listing.moderation_locked?
          return skipped_response(listing, "locked")
        end

        # One moderation run per listing at a time: webhook bursts, job
        # retries and a moderator clicking "Moderate" can otherwise interleave
        # and leave the listing status pointing at the loser's outcome.
        with_listing_lock(listing.id) do |acquired|
          return skipped_response(listing, "concurrent_run") unless acquired

          run(listing, moderator: moderator)
        end
      end

      private

      def run(listing, moderator: nil)
        settings = Setting.current

        # 0. AI Parameter Scan. Failure is non-blocking — the scan doesn't
        #    affect the moderation outcome.
        ai_scan =
          begin
            Ai::ParamScan.call(listing)
          rescue StandardError => e
            Rails.logger.error("AI Param Scan failed (non-blocking): #{e.message}")
            nil
          end

        # 1. Rules + lists + engine
        rules = Rule.where(enabled: true).order(:id).map { |r| rule_hash(r) }
        lists = ModerationList.order(:id).map { |l| { "name" => l.name, "items" => l.items } }
        engine = Engine.new(rules: rules, lists: lists, settings: engine_settings(settings))

        listing_hash = listing_to_hash(listing)

        # 2-3. Deterministic + AI-trigger rule evaluation
        result = engine.evaluate(listing_hash)

        # 3b. Auto AI on-demand vision: if an auto_ai/former_manual rule
        #     triggered AND vision hasn't run, run vision now, patch the
        #     listing and re-evaluate hybrid_vision rules (one pass, no loop).
        vision_analyzed = false
        vision_result = nil
        if result[:needs_llm] && listing.chat_gpt_property_condition.nil? && listing.image_urls.present?
          vision_outcome = run_on_demand_vision(listing, engine, result)
          vision_analyzed = vision_outcome[:vision_analyzed]
          vision_result = vision_outcome[:vision_result]
          result = vision_outcome[:result]
        end

        # 4. LLM verification for AI-trigger matches
        llm_response = nil
        llm_triggered = false
        if result[:outcome] == :needs_llm
          if ENV["ANTHROPIC_API_KEY"].present?
            begin
              llm_response = LlmVerifier.call(
                listing_hash,
                result[:matches],
                model: settings["param_scan_model"].presence || DEFAULT_LLM_MODEL,
                temperature: settings["ai_temperature"].is_a?(Numeric) ? settings["ai_temperature"] : 0.1
              )
            rescue StandardError => e
              Rails.logger.error("LLM call failed, routing to manual: #{e.message}")
              llm_response = nil
            end
          end
          result = engine.decide_with_llm(result, llm_response)
          llm_triggered = !llm_response.nil?
        end

        outcome = result[:outcome].to_s
        camel_matches = result[:matches].map { |m| camelize_match(m) }

        # 5-6. Persist result + listing status + rule stats atomically: a
        # failure mid-sequence must not leave an orphaned result row pointing
        # at a listing whose status was never updated (job retries would then
        # double-record the decision).
        moderation_result = nil
        ActiveRecord::Base.transaction do
          moderation_result = ModerationResult.create!(
            listing: listing,
            je_id: listing.je_id,
            outcome: outcome,
            rule_matches: camel_matches,
            llm_triggered: llm_triggered,
            llm_response: llm_response,
            seller_message: result[:seller_message],
            confidence: result[:confidence],
            vision_result: vision_result,
            vision_model: vision_result&.dig("model"),
            processed_at: (Time.current.to_f * 1000).to_i
          )
          listing.update!(moderation_status: outcome)
          update_rule_stats(camel_matches)
        end

        # 7. Implio submission — stub-aware, never blocks the moderation run
        begin
          Integrations::ImplioClient.submit_result(moderation_result)
        rescue StandardError => e
          Rails.logger.error("Implio submission failed for listing #{listing.je_id}: #{e.message}")
        end

        {
          outcome: outcome,
          resultId: moderation_result.id,
          ruleMatches: camel_matches,
          llmTriggered: llm_triggered,
          confidence: result[:confidence],
          visionAnalyzed: vision_analyzed,
          aiScanVerdict: ai_scan && ai_scan["verdict"]
        }
      end

      # Build the camelCase listing hash the engine expects (Convex documents
      # never store undefined fields, hence the compact).
      def listing_to_hash(listing)
        {
          "_id" => listing.id&.to_s,
          "jeId" => listing.je_id,
          "title" => listing.title,
          "price" => listing.price,
          "priceUsd" => listing.price_usd,
          "priceOnRequest" => listing.price_on_request,
          "currency" => listing.currency,
          "category" => listing.category,
          "realEstateType" => listing.real_estate_type,
          "country" => listing.country,
          "city" => listing.city,
          "state" => listing.state,
          "imageCount" => listing.image_count,
          "avgImageWidth" => listing.avg_image_width,
          "avgImageHeight" => listing.avg_image_height,
          "lqi" => listing.lqi,
          "descriptionLength" => listing.description_length,
          "description" => listing.description,
          "office" => listing.office,
          "officeGroupName" => listing.office_group_name,
          "officeSubscription" => listing.office_subscription,
          "feedSource" => listing.feed_source,
          "livingArea" => listing.living_area,
          "landArea" => listing.land_area,
          "bedrooms" => listing.bedrooms,
          "bathrooms" => listing.bathrooms,
          "pricePerSqm" => listing.price_per_sqm,
          "rental" => listing.rental,
          "outdated" => listing.outdated,
          "preOwned" => listing.pre_owned,
          "year" => listing.year,
          "chatGptConclusion" => listing.chat_gpt_conclusion,
          "chatGptPropertyCondition" => listing.chat_gpt_property_condition,
          "chatGptWatermarkShare" => listing.chat_gpt_watermark_share,
          "chatGptWatermarkText" => listing.chat_gpt_watermark_text,
          "chatGptImageQuality" => listing.chat_gpt_image_quality,
          "chatGptImageType" => listing.chat_gpt_image_type,
          "imageUrls" => listing.image_urls,
          "listingUrl" => listing.listing_url,
          "batchId" => listing.batch_id
        }.compact
      end

      def engine_settings(settings)
        {
          "autoApproveThreshold" => settings["auto_approve_threshold"],
          "autoRejectThreshold" => settings["auto_reject_threshold"],
          "enableAutoModeration" => settings["enable_auto_moderation"]
        }.compact
      end

      def rule_hash(rule)
        {
          "_id" => rule.id.to_s,
          "name" => rule.name,
          "displayName" => rule.display_name,
          "category" => rule.category,
          "tier" => rule.tier,
          "enabled" => rule.enabled,
          "action" => rule.action,
          "priority" => rule.priority,
          "config" => rule.config || {},
          "sellerMessage" => rule.seller_message
        }
      end

      # Port of step 3b in moderateListing: run vision, persist scores,
      # re-evaluate hybrid_vision rules once and short-circuit to rejection
      # only when a *new* hybrid match is tier auto / action reject.
      def run_on_demand_vision(listing, engine, result)
        no_change = { vision_analyzed: false, vision_result: nil, result: result }

        vr = Ai::VisionAnalyzer.analyze(
          image_urls: listing.image_urls.first(MAX_VISION_IMAGES),
          title: listing.title || "",
          je_id: listing.je_id
        )
        return no_change unless vr && !vr["error"] && !vr["property_condition"].nil?

        patch_vision_scores(listing, vr)
        updated_hash = listing_to_hash(listing.reload)

        new_matches = []
        engine.rules.select { |r| r["category"] == "hybrid_vision" }.each do |rule|
          eval_result = RuleEvaluator.evaluate_hybrid_vision(updated_hash, rule["config"] || {})
          next unless eval_result[:matched]

          match = {
            rule_name: rule["name"],
            rule_category: rule["category"],
            tier: rule["tier"],
            action: rule["action"],
            message: rule["sellerMessage"],
            details: "[Auto AI vision] #{eval_result[:details]}"
          }
          result[:matches] << match
          new_matches << match
        end

        # Only freshly-evaluated hybrid rules may short-circuit to rejection;
        # the auto_ai matches still go through LLM verification.
        new_auto_rejects = new_matches.select { |m| m[:tier] == "auto" && m[:action] == "reject" }
        if new_auto_rejects.any?
          seller_msg = JsCompat.js_or(new_auto_rejects.first[:message], Engine::DEFAULT_REJECT_MESSAGE)
          result = result.merge(outcome: "rejected", needs_llm: false,
                                seller_message: seller_msg, confidence: 1.0)
        end

        { vision_analyzed: true, vision_result: vr, result: result }
      rescue StandardError => e
        Rails.logger.error("Auto AI on-demand vision failed, continuing without: #{e.message}")
        no_change
      end

      # Port of listings.patchVisionScores (only non-nil values are written).
      def patch_vision_scores(listing, vision)
        attrs = {
          chat_gpt_property_condition: vision["property_condition"],
          chat_gpt_conclusion: vision["conclusion"].nil? ? nil : JsCompat.js_string(vision["conclusion"]),
          chat_gpt_watermark_share: vision["watermark_share"],
          chat_gpt_watermark_text: vision["watermark_text"],
          chat_gpt_image_quality: vision["image_quality"],
          chat_gpt_image_type: vision["image_type"]
        }.compact
        listing.update!(attrs) if attrs.any?
      end

      def camelize_match(match)
        {
          "ruleName" => match[:rule_name],
          "ruleCategory" => match[:rule_category],
          "tier" => match[:tier],
          "action" => match[:action],
          "message" => match[:message],
          "details" => match[:details]
        }
      end

      def update_rule_stats(camel_matches)
        names = camel_matches.map { |m| m["ruleName"] }.uniq - [ "llm_assessment" ]
        return if names.empty?

        # Single atomic SQL increment — the previous read-modify-write loop
        # lost counts whenever two runs matched the same rule concurrently.
        now_ms = (Time.current.to_f * 1000).to_i
        Rule.where(name: names)
            .update_all([ "match_count = COALESCE(match_count, 0) + 1, last_matched_at = ?", now_ms ])
      end

      # Session-scoped pg advisory lock keyed on the listing id. Yields true
      # when this process owns the run, false when another run is already in
      # flight (the caller skips instead of racing). Unlike a row lock it is
      # safe to hold across the slow AI calls — no transaction stays open.
      def with_listing_lock(listing_id)
        conn = ActiveRecord::Base.connection
        acquired = conn.select_value(
          "SELECT pg_try_advisory_lock(#{ADVISORY_LOCK_CLASS}, #{Integer(listing_id)})"
        )
        begin
          yield acquired
        ensure
          conn.execute("SELECT pg_advisory_unlock(#{ADVISORY_LOCK_CLASS}, #{Integer(listing_id)})") if acquired
        end
      end

      def skipped_response(listing, reason)
        {
          outcome: listing.moderation_status,
          skipped: reason,
          ruleMatches: [],
          llmTriggered: false,
          confidence: nil,
          visionAnalyzed: false
        }
      end
    end
  end
end
