require "net/http"
require "json"

module Integrations
  # Implio bridge: forwards FeedLens moderation decisions to Implio so the
  # existing Implio rules (e.g. Viktor_autoreject) take effect on
  # JamesEdition. Payload is an exact port of submitToImplio in
  # convex/moderation.ts.
  #
  # STUB MODE: when ENV["IMPLIO_STUB"] is unset or "true" (default ON) the
  # full payload is logged and no HTTP request is made.
  class ImplioClient
    API_URL = "https://api.implio.com/v1/ads".freeze
    OPEN_TIMEOUT = 10
    READ_TIMEOUT = 30

    class << self
      def stub_mode?
        value = ENV["IMPLIO_STUB"]
        value.nil? || value == "true"
      end

      # Submits a persisted ModerationResult (listing + outcome + rule
      # matches + seller message + confidence) to Implio.
      def submit_result(moderation_result)
        listing = moderation_result.listing
        payload = build_payload(
          listing: listing,
          je_id: moderation_result.je_id,
          outcome: moderation_result.outcome,
          rule_matches: moderation_result.rule_matches || [],
          seller_message: moderation_result.seller_message,
          confidence: moderation_result.confidence
        )
        deliver(payload, je_id: moderation_result.je_id, outcome: moderation_result.outcome)
      end

      # Submits a standalone manual decision (approve/reject/notice/manual)
      # for a jeId, with an optional seller message.
      def submit_decision(je_id:, outcome:, message: nil)
        listing = Listing.find_by(je_id: je_id)
        payload = build_payload(
          listing: listing,
          je_id: je_id,
          outcome: outcome,
          rule_matches: [],
          seller_message: message,
          confidence: nil
        )
        deliver(payload, je_id: je_id, outcome: outcome)
      end

      # Exact port of the submitToImplio payload construction.
      def build_payload(listing:, je_id:, outcome:, rule_matches:, seller_message: nil, confidence: nil)
        matches = (rule_matches || []).map { |m| normalize_match(m) }

        assessment_lines = matches
          .map { |m| "[#{m["ruleCategory"]}/#{m["tier"]}] #{m["ruleName"]} (#{m["action"]}): #{m["details"] || ""}" }
          .select { |line| truthy(line) }
        assessment = assessment_lines.any? ? assessment_lines.join("\n") : "FeedLens outcome: #{outcome}"

        # Derive the JE URL segment from the listing category — hardcoding
        # /real_estate/ would give cars/yachts a wrong listing_url.
        category_lower = listing&.category.to_s.downcase
        url_segment =
          if category_lower.include?("car")
            "cars"
          elsif category_lower.include?("yacht")
            "yachts"
          else
            "real_estate"
          end

        # customerSpecific: listing data + moderation flags. nil (undefined)
        # values are dropped exactly as JSON.stringify drops undefined keys —
        # except viktor_confidence, which the TS explicitly sends as null.
        cs = {
          "listing_url" => "https://www.jamesedition.com/#{url_segment}/-/-#{je_id}",
          "price" => listing&.price,
          "price_usd" => listing&.price_usd,
          "price_on_request" => listing&.price_on_request || false,
          "location_city" => listing&.city,
          "location_country" => listing&.country,
          "real_estate_type" => listing&.real_estate_type,
          "bedrooms" => listing&.bedrooms,
          "bathrooms" => listing&.bathrooms,
          "living_area" => listing&.living_area,
          "land_area" => listing&.land_area,
          "number_of_pictures" => listing&.image_count,
          "description_length" => listing&.description_length,
          "listing_quality_index" => listing&.lqi,
          # Only the human-readable group name belongs here (listing.office
          # holds a numeric office id that would never match Implio rules).
          "office_group_name" => presence(listing&.office_group_name),
          "office_subscription_level" => listing&.office_subscription,
          "listing_feed_source" => listing&.feed_source,
          # ChatGPT vision fields (from JE pipeline)
          "chat_gpt_conclusion" => listing&.chat_gpt_conclusion,
          "chat_gpt_property_condition" => listing&.chat_gpt_property_condition,
          "chat_gpt_watermark_share" => listing&.chat_gpt_watermark_share,
          "chat_gpt_watermark_text" => listing&.chat_gpt_watermark_text,
          "chat_gpt_image_quality" => listing&.chat_gpt_image_quality,
          "chat_gpt_image_type" => listing&.chat_gpt_image_type,
          # Viktor moderation metadata
          "viktor_flagged" => true,
          "viktor_assessment" => assessment,
          "viktor_confidence" => confidence,
          "viktor_outcome" => outcome
        }
        cs.compact!
        cs["viktor_confidence"] = confidence # explicit null when missing

        # Outcome-specific flags that trigger Implio rules
        case outcome
        when "rejected"
          cs["viktor_reject"] = true # → triggers "Viktor_autoreject" rule → REFUSE
          cs["seller_message"] = seller_message if truthy(seller_message)
        when "approved"
          cs["viktor_approve"] = true # → triggers approval rule → APPROVE
        when "notice"
          cs["viktor_approve"] = true # approved with notice
          cs["seller_message"] = seller_message if truthy(seller_message)
        when "manual"
          cs["manual_review"] = true # → triggers manual review rule → MANUAL
          cs["viktor_flagged"] = true
        end

        title = presence(listing&.title) || "Listing #{je_id}"
        body = "FeedLens Moderation: #{outcome.to_s.upcase}\n\n#{assessment}" \
               "#{truthy(seller_message) ? "\n\nSeller message: #{seller_message}" : ""}"

        [ {
          "id" => je_id.to_s,
          "content" => { "title" => title, "body" => body },
          "customerSpecific" => cs
        } ]
      end

      private

      def deliver(payload, je_id:, outcome:)
        if stub_mode?
          Rails.logger.info("[Implio STUB] listing #{je_id} → #{outcome}: #{JSON.generate(payload)}")
          return { success: true, stubbed: true }
        end

        api_key = ENV["IMPLIO_API_KEY"].to_s
        if api_key.empty?
          Rails.logger.warn("IMPLIO_API_KEY not set — skipping Implio submission")
          return { success: false, error: "No API key" }
        end

        uri = URI(API_URL)
        response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                                   open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |http|
          request = Net::HTTP::Post.new(uri)
          request["Content-Type"] = "application/json"
          request["X-Api-Key"] = api_key
          request.body = JSON.generate(payload)
          http.request(request)
        end

        unless response.is_a?(Net::HTTPSuccess)
          Rails.logger.error("Implio API error for listing #{je_id}: #{response.code} #{response.body}")
          return { success: false, error: "#{response.code}: #{response.body}" }
        end

        Rails.logger.info("Implio submission OK: listing #{je_id} → #{outcome}")
        { success: true }
      rescue StandardError => e
        Rails.logger.error("Implio submission failed for listing #{je_id}: #{e.message}")
        { success: false, error: e.message || "Unknown error" }
      end

      # Rule matches may arrive as symbol-keyed engine hashes or as
      # camelCase-string jsonb rows — normalize to camelCase strings.
      def normalize_match(match)
        return match if match.is_a?(Hash) && match.key?("ruleName")

        {
          "ruleName" => match[:rule_name] || match[:ruleName],
          "ruleCategory" => match[:rule_category] || match[:ruleCategory],
          "tier" => match[:tier],
          "action" => match[:action],
          "message" => match[:message],
          "details" => match[:details]
        }
      end

      def truthy(value)
        Moderation::JsCompat.js_truthy?(value)
      end

      def presence(value)
        truthy(value) ? value : nil
      end
    end
  end
end
