require "json"

module Ai
  # Port of convex/remediation.ts: shadow remediation scanner that asks
  # Claude for clear, fixable data errors in a listing and persists the
  # suggestions as RemediationResult rows.
  class RemediationScanner
    # Minimum confidence for a remediation suggestion to be kept. Must match
    # the ">0.75 confidence" instruction and the 0.75-1.0 range in the prompt.
    MIN_SUGGESTION_CONFIDENCE = 0.75

    MODEL = "claude-sonnet-4-20250514".freeze
    MAX_TOKENS = 1200
    TEMPERATURE = 0

    ERROR_TYPES = {
      "BEDROOM_ANOMALY" => "bedroom_anomaly",
      "AREA_CONVERSION" => "area_conversion",
      "PRICE_ANOMALY" => "price_anomaly",
      "PRICE_MISSING_ZEROS" => "price_missing_zeros",
      "DESCRIPTION_TOO_SHORT" => "description_too_short",
      "DESCRIPTION_ALL_CAPS" => "description_all_caps",
      "DESCRIPTION_PLACEHOLDER" => "description_placeholder",
      "DESCRIPTION_AUTO_TRANSLATE" => "description_auto_translate",
      "DESCRIPTION_MISSING_DETAILS" => "description_missing_details",
      "BATHROOM_ANOMALY" => "bathroom_anomaly",
      "YEAR_ANOMALY" => "year_anomaly",
      "AREA_SWAP" => "area_swap"
    }.freeze

    class << self
      # Port of scanListing: scans one listing (cached if already scanned).
      def scan_listing(listing)
        existing = RemediationResult.where(listing_id: listing.id).order(scanned_at: :desc).first
        return result_payload(existing) if existing

        result, tokens_used = call_claude(build_prompt(extract_listing_data(listing)))
        record = save_result(listing, result, tokens_used)
        result_payload(record)
      end

      # Port of batchScan. Either scans an explicit set of listings
      # (listing_ids:) or discovers unscanned listings that had moderation
      # issues (max_listings, default 20).
      def batch_scan(max_listings: nil, listing_ids: nil, limit: nil)
        batch_size = max_listings || limit || 20
        listings =
          if listing_ids
            Listing.where(id: listing_ids)
          else
            unscanned_listings(batch_size)
          end

        raise ClaudeClient::MissingApiKeyError, "No Anthropic API key configured" if ENV["ANTHROPIC_API_KEY"].to_s.empty?

        results = []
        errors = 0

        listings.each do |listing|
          existing = RemediationResult.where(listing_id: listing.id).order(scanned_at: :desc).first
          if existing
            results << { jeId: listing.je_id, hasFixableErrors: existing.has_fixable_errors, errorCount: existing.error_count }
            next
          end

          result, tokens_used = call_claude(build_prompt(extract_listing_data(listing)))
          save_result(listing, result, tokens_used)
          results << { jeId: listing.je_id, hasFixableErrors: result["hasFixableErrors"], errorCount: result["errorCount"] }
        rescue StandardError => e
          Rails.logger.error("Remediation scan failed for #{listing.je_id}: #{e.message}")
          errors += 1
        end

        {
          scanned: results.length,
          errors: errors,
          withIssues: results.count { |r| r[:hasFixableErrors] },
          results: results
        }
      end

      # Port of extractListingData.
      def extract_listing_data(listing)
        {
          "title" => listing.title,
          "category" => listing.category,
          "realEstateType" => listing.real_estate_type,
          "country" => listing.country,
          "city" => listing.city,
          "price" => listing.price,
          "currency" => listing.currency,
          "priceUsd" => listing.price_usd,
          "priceOnRequest" => listing.price_on_request,
          "pricePerSqm" => listing.price_per_sqm,
          "livingArea" => listing.living_area,
          "landArea" => listing.land_area,
          "bedrooms" => listing.bedrooms,
          "bathrooms" => listing.bathrooms,
          "imageCount" => listing.image_count,
          "rental" => listing.rental,
          "year" => listing.year,
          "feedSource" => listing.feed_source,
          "office" => listing.office,
          "officeSubscription" => listing.office_subscription,
          "description" => listing.description&.slice(0, 1500),
          "descriptionLength" => listing.description_length,
          "lqi" => listing.lqi
        }.compact
      end

      # Port of buildPrompt.
      def build_prompt(data)
        <<~PROMPT.chomp
          You are a data quality analyst for JamesEdition, the world's largest luxury marketplace. Find CLEAR, FIXABLE data errors in this listing. Be precise and concise.

          LISTING DATA:
          #{JSON.pretty_generate(data)}

          ERROR TYPES TO CHECK:

          1. **bedroom_anomaly** — Bedroom count is obviously a typo (55 → 5, 99 → placeholder). Normal range is 1-20.
          2. **bathroom_anomaly** — Bathroom count is obviously a typo (33 → 3). Normal range is 1-15.
          3. **area_conversion** — Area entered in wrong unit. Only flag if clearly wrong (e.g. apartment with 5000 sqm is likely sqft).
          4. **area_swap** — Living area and land area are swapped (living > land for houses with land).
          5. **price_anomaly** — Price is clearly wrong for the category/location (not just unusual).
          6. **price_missing_zeros** — Price is missing digits ($1,200 for a luxury property → $1,200,000).
          7. **year_anomaly** — Year is impossible (2099, 1800 for modern property, 0).
          8. **description_too_short** — Description under 50 characters.
          9. **description_all_caps** — Entire description is ALL CAPS.
          10. **description_placeholder** — Contains actual placeholder text: "Lorem ipsum", "test listing", "TBD", "N/A", "description coming soon". NOTE: "[hidden information]" is JamesEdition's standard way of hiding contact details — this is NORMAL, NOT a placeholder.
          11. **description_auto_translate** — Clearly auto-translated with nonsensical grammar/word soup.
          12. **description_missing_details** — Very bare description for a luxury listing (just a sentence or two with no property details).

          DESCRIPTION QUALITY SCORE (if description exists):
          - overall: 0-100, length: "too_short"|"ok"|"good", hasPlaceholder, hasAllCaps, hasAutoTranslateArtifacts, missingKeyDetails

          STRICT RULES:
          - Only flag errors you are CONFIDENT about (>0.75 confidence)
          - Luxury properties have extreme values — large areas, high prices, many rooms are NORMAL
          - "[hidden information]" in descriptions is NORMAL (contact hiding), do NOT flag it
          - Keep explanations to 1-2 sentences max
          - If the data looks reasonable, return empty suggestions — false positives are worse than missed errors
          - When in doubt, do NOT flag it

          Respond with ONLY valid JSON (no markdown, no backticks):
          {"hasFixableErrors":boolean,"errorCount":number,"suggestions":[{"errorType":"code","severity":"high"|"medium"|"low","field":"field_name","currentValue":"current","suggestedFix":"fix","explanation":"short reason","confidence":0.75-1.0}],"descriptionScore":{"overall":0-100,"length":"too_short"|"ok"|"good","hasPlaceholder":false,"hasAllCaps":boolean,"hasAutoTranslateArtifacts":boolean,"missingKeyDetails":["detail"]}}
        PROMPT
      end

      private

      # Port of callClaude (incl. parse fallback and low-confidence filter).
      def call_claude(prompt)
        response = ClaudeClient.messages(
          model: MODEL,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          messages: [ { role: "user", content: prompt } ]
        )
        content = ClaudeClient.text_content(response)
        tokens_used = ClaudeClient.tokens_used(response)

        result =
          begin
            cleaned = content.gsub(/```json\n?/, "").gsub(/```\n?/, "").strip
            parsed = JSON.parse(cleaned)
            parsed.is_a?(Hash) ? parsed : empty_result
          rescue JSON::ParserError
            empty_result
          end

        suggestions = result["suggestions"]
        suggestions = [] unless suggestions.is_a?(Array)
        suggestions = suggestions.select { |s| s.is_a?(Hash) && (to_f_or_zero(s["confidence"])) >= MIN_SUGGESTION_CONFIDENCE }

        result["suggestions"] = suggestions
        result["errorCount"] = suggestions.length
        result["hasFixableErrors"] = suggestions.any?
        result["totalConfidence"] =
          suggestions.any? ? suggestions.sum { |s| to_f_or_zero(s["confidence"]) } / suggestions.length : 0

        [ result, tokens_used ]
      end

      # Port of buildSaveArgs + saveResult (upsert).
      def save_result(listing, result, tokens_used)
        RemediationResult.where(listing_id: listing.id).destroy_all

        description_score = result["descriptionScore"]
        description_score =
          if description_score.is_a?(Hash)
            {
              "overall" => to_f_or_zero(description_score["overall"]),
              "length" => Moderation::JsCompat.js_or(description_score["length"], "ok"),
              "hasPlaceholder" => description_score["hasPlaceholder"] == true,
              "hasAllCaps" => description_score["hasAllCaps"] == true,
              "hasAutoTranslateArtifacts" => description_score["hasAutoTranslateArtifacts"] == true,
              "missingKeyDetails" => description_score["missingKeyDetails"]
            }.compact
          end

        RemediationResult.create!(
          listing: listing,
          je_id: listing.je_id,
          has_fixable_errors: result["hasFixableErrors"] == true,
          error_count: result["errorCount"] || 0,
          total_confidence: (to_f_or_zero(result["totalConfidence"]) * 100).round / 100.0,
          suggestions: result["suggestions"].map do |s|
            {
              "errorType" => Moderation::JsCompat.js_or(s["errorType"], "unknown"),
              "severity" => Moderation::JsCompat.js_or(s["severity"], "low"),
              "field" => Moderation::JsCompat.js_or(s["field"], "unknown"),
              "currentValue" => js_to_s(s["currentValue"]),
              "suggestedFix" => js_to_s(s["suggestedFix"]),
              "explanation" => js_to_s(s["explanation"]),
              # Coerce — the model occasionally returns numbers as strings.
              "confidence" => to_f_or_zero(s["confidence"])
            }
          end,
          description_score: description_score,
          feed_source: presence(listing.feed_source),
          office: presence(listing.office),
          category: presence(listing.category),
          country: presence(listing.country),
          model: MODEL,
          tokens_used: tokens_used,
          scanned_at: (Time.current.to_f * 1000).to_i
        )
      end

      # Port of getUnscannedListings: listings whose moderation result had
      # issues (non-approved or any rule match) and that have not been
      # remediation-scanned yet, oldest moderation results first.
      def unscanned_listings(limit)
        unscanned = []
        seen = Set.new

        ModerationResult.order(processed_at: :asc).find_each(batch_size: 200) do |mr|
          has_issues = mr.outcome != "approved" || (mr.rule_matches.present? && mr.rule_matches.any?)
          next unless has_issues
          next if seen.include?(mr.listing_id)

          seen << mr.listing_id
          next if RemediationResult.exists?(listing_id: mr.listing_id)

          listing = Listing.find_by(id: mr.listing_id)
          if listing
            unscanned << listing
            break if unscanned.length >= limit
          end
        end

        unscanned
      end

      def result_payload(record)
        {
          "resultId" => record.id,
          "hasFixableErrors" => record.has_fixable_errors,
          "errorCount" => record.error_count,
          "totalConfidence" => record.total_confidence,
          "suggestions" => record.suggestions,
          "descriptionScore" => record.description_score,
          "tokensUsed" => record.tokens_used
        }
      end

      def empty_result
        { "hasFixableErrors" => false, "errorCount" => 0, "totalConfidence" => 0, "suggestions" => [] }
      end

      def to_f_or_zero(value)
        case value
        when Numeric then value.to_f
        when String then Float(value, exception: false) || 0.0
        else 0.0
        end
      end

      # JS String(x ?? "")
      def js_to_s(value)
        value.nil? ? "" : Moderation::JsCompat.js_string(value)
      end

      def presence(value)
        Moderation::JsCompat.js_truthy?(value) ? value : nil
      end
    end
  end
end
