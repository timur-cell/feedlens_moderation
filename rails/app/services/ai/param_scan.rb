require "json"
require "set"

module Ai
  # Port of convex/aiParamScan.ts: deterministic threshold pre-checks plus a
  # Claude contextual scan of listing parameters, merged into a single
  # verdict and persisted as an AiParameterScan row.
  class ParamScan
    FLAG_CODES = {
      "PRICE_SUSPICIOUS" => "Price seems unrealistic for the country, type, and size",
      "PRICE_PER_SQM_ANOMALY" => "Price per sqm is outside normal range for this location/type",
      "AREA_MISMATCH" => "Living area and land area values seem inconsistent or unrealistic",
      "LOCATION_SUSPICIOUS" => "Location data seems wrong or inconsistent",
      "CATEGORY_MISMATCH" => "Parameters don't match the listing category",
      "MISSING_CRITICAL_DATA" => "Key fields are missing that should exist for this listing type",
      "PRICE_AREA_CONFLICT" => "Price doesn't align with the property size",
      "DATA_ENTRY_ERROR" => "Values suggest a data entry or unit conversion mistake"
    }.freeze

    VERDICTS = %w[reject review ok].freeze
    VERDICT_ORDER = { "reject" => 0, "review" => 1, "ok" => 2 }.freeze

    DEFAULT_MODEL = "claude-haiku-4-5-20251001".freeze

    # High-cost countries where pricePerSqm thresholds should be stricter.
    HIGH_COST_COUNTRIES = %w[AE MC CH SG HK LU GB FR IT ES US AU NL NO SE DK AT DE JP IL].to_set.freeze
    # Residential types where price/sqm checks apply.
    RESIDENTIAL_TYPES = %w[apartment villa house penthouse townhouse condo flat duplex triplex].to_set.freeze
    APARTMENT_TYPES = %w[apartment condo flat penthouse studio loft].freeze

    class << self
      # Returns the scan hash { "scanId", "verdict", "flags", "summary",
      # "confidence", "tokensUsed" }. Cached unless force_rescan.
      def call(listing, force_rescan: false)
        settings = Setting.current
        scan_model = settings["param_scan_model"].presence || DEFAULT_MODEL
        scan_temperature = settings["ai_temperature"].is_a?(Numeric) ? settings["ai_temperature"] : 0.1

        unless force_rescan
          existing = AiParameterScan.where(listing_id: listing.id).order(scanned_at: :desc).first
          return scan_payload(existing) if existing
        end

        params = extract_parameters(listing)

        # Phase 1: deterministic pre-checks
        deterministic_flags = run_deterministic_checks(params)
        det_verdict = determine_verdict(deterministic_flags)

        # Phase 2: AI contextual analysis
        ai_result = { "verdict" => "ok", "flags" => [], "summary" => "", "confidence" => 0 }
        tokens_used = 0
        model_used = "deterministic-only"

        begin
          response = ClaudeClient.messages(
            model: scan_model,
            max_tokens: 600,
            temperature: scan_temperature,
            messages: [ { role: "user", content: build_prompt(params, deterministic_flags) } ]
          )
          content = ClaudeClient.text_content(response)
          tokens_used = ClaudeClient.tokens_used(response)
          model_used = "deterministic+#{scan_model}"

          begin
            cleaned = content.gsub(/```json\n?/, "").gsub(/```\n?/, "").strip
            parsed = JSON.parse(cleaned)
            ai_result = parsed.is_a?(Hash) ? parsed : {}
          rescue JSON::ParserError
            ai_result = {
              "verdict" => "ok", "flags" => [],
              "summary" => "Failed to parse AI response — deterministic checks still applied",
              "confidence" => 0
            }
          end

          # Validate AI result: verdict normalized case-insensitively.
          verdict = ai_result["verdict"].to_s.strip.downcase
          ai_result["verdict"] = VERDICTS.include?(verdict) ? verdict : "ok"
          ai_result["flags"] = [] unless ai_result["flags"].is_a?(Array)
        rescue StandardError => e
          # AI failed — deterministic checks still protect us
          Rails.logger.error("AI scan failed, using deterministic checks only: #{e.message}")
          ai_result = {
            "verdict" => "ok", "flags" => [],
            "summary" => "AI analysis unavailable — deterministic checks applied",
            "confidence" => 0
          }
        end

        # Phase 3: merge flags (deterministic take precedence)
        merged_flags = deterministic_flags.dup
        det_keys = deterministic_flags.map { |f| "#{f["code"]}:#{f["field"]}" }.to_set
        ai_result["flags"].each do |raw_flag|
          flag = raw_flag.is_a?(Hash) ? raw_flag : {}
          key = "#{flag["code"]}:#{flag["field"]}"
          next if det_keys.include?(key)

          merged_flags << {
            "code" => presence(flag["code"]) || "UNKNOWN",
            "severity" => %w[high medium low].include?(flag["severity"]) ? flag["severity"] : "low",
            "message" => flag["message"].is_a?(String) ? flag["message"] : "",
            "field" => presence(flag["field"]),
            "expected" => presence(flag["expected"]),
            "actual" => presence(flag["actual"])
          }.compact
        end

        final_verdict = worst_verdict(det_verdict, ai_result["verdict"])

        parts = []
        parts << "#{deterministic_flags.length} threshold flag(s)" if deterministic_flags.any?
        parts << "#{ai_result["flags"].length} AI flag(s)" if ai_result["flags"].any?
        final_summary =
          if merged_flags.any?
            "Found #{merged_flags.length} issue(s) [#{parts.join(", ")}]. #{ai_result["summary"]}".strip
          else
            presence(ai_result["summary"]) || "Parameters look consistent — no issues found."
          end

        # Confidence: lower when flags exist; coerce non-numeric model values
        # (e.g. "high") that would otherwise produce NaN.
        ai_confidence = to_finite_float(ai_result["confidence"])
        final_confidence =
          if merged_flags.any?
            [ ai_confidence&.positive? ? ai_confidence : 0.5, 0.3 ].min
          else
            ai_confidence&.positive? ? ai_confidence : 0.95
          end
        final_confidence = final_confidence.clamp(0.0, 1.0)

        record = save_scan(
          listing: listing,
          verdict: final_verdict,
          flags: merged_flags,
          summary: final_summary,
          confidence: final_confidence,
          parameters_checked: params,
          model: model_used,
          tokens_used: tokens_used
        )

        {
          "scanId" => record.id,
          "verdict" => final_verdict,
          "flags" => merged_flags,
          "summary" => final_summary,
          "confidence" => final_confidence,
          "tokensUsed" => tokens_used
        }
      end

      # Port of extractParameters: camelCase keys; nil values omitted exactly
      # as JSON.stringify / Convex storage drop undefined fields.
      def extract_parameters(listing)
        {
          "title" => listing.title,
          "category" => listing.category,
          "realEstateType" => listing.real_estate_type,
          "country" => listing.country,
          "city" => listing.city,
          "state" => listing.state,
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
          "preOwned" => listing.pre_owned,
          "year" => listing.year,
          "feedSource" => listing.feed_source,
          "officeSubscription" => listing.office_subscription,
          "lqi" => listing.lqi
          # Intentionally exclude: description, imageUrls, rawData
        }.compact
      end

      # Port of runDeterministicChecks.
      def run_deterministic_checks(params)
        flags = []

        price = params["price"]
        price_on_request = params["priceOnRequest"]
        living_area = params["livingArea"]
        land_area = params["landArea"]
        bedrooms = params["bedrooms"]
        bathrooms = params["bathrooms"]
        real_estate_type = params["realEstateType"].to_s.downcase
        country = Moderation::CountryMatcher.to_country_code(params["country"].to_s)

        is_residential = RESIDENTIAL_TYPES.include?(real_estate_type) || real_estate_type == ""
        is_high_cost_country = HIGH_COST_COUNTRIES.include?(country)

        price_per_sqm = params["pricePerSqm"]
        if price_per_sqm.nil? && truthy(price) && price.positive? && truthy(living_area) && living_area.positive?
          price_per_sqm = (price.to_f / living_area).round
        end

        # ── Price checks (skip if Price on Request) ──────────
        if !truthy(price_on_request) && truthy(price) && price.positive?
          unless price_per_sqm.nil?
            if price_per_sqm < 10
              flags << flag("PRICE_PER_SQM_ANOMALY", "high",
                            "Price per sqm is $#{num_str(price_per_sqm)}/sqm — far below $10/sqm minimum. Almost certainly a data error.",
                            field: "pricePerSqm",
                            expected: "$100–$50,000/sqm for luxury real estate",
                            actual: "$#{num_str(price_per_sqm)}/sqm")
            elsif price_per_sqm < 100
              flags << flag("PRICE_PER_SQM_ANOMALY", "high",
                            "Price per sqm is $#{num_str(price_per_sqm)}/sqm — below $100/sqm minimum for luxury properties.",
                            field: "pricePerSqm",
                            expected: "$100–$50,000/sqm for luxury real estate",
                            actual: "$#{num_str(price_per_sqm)}/sqm")
            elsif price_per_sqm < 500 && is_residential
              # $100–$500/sqm is suspicious for any residential listing
              flags << flag("PRICE_PER_SQM_ANOMALY", "medium",
                            "Price per sqm is $#{fmt_num(price_per_sqm)}/sqm — unusually low for a luxury marketplace listing.",
                            field: "pricePerSqm",
                            expected: "$500–$50,000/sqm for residential luxury properties",
                            actual: "$#{fmt_num(price_per_sqm)}/sqm")
            elsif price_per_sqm < 1000 && is_residential && is_high_cost_country
              # $500–$1000/sqm in high-cost countries is very suspicious
              flags << flag("PRICE_PER_SQM_ANOMALY", "medium",
                            "Price per sqm is $#{fmt_num(price_per_sqm)}/sqm — below $1,000/sqm minimum for residential properties in #{country}.",
                            field: "pricePerSqm",
                            expected: "$1,000–$50,000/sqm for residential properties in #{country}",
                            actual: "$#{fmt_num(price_per_sqm)}/sqm")
            elsif price_per_sqm > 200_000
              flags << flag("PRICE_PER_SQM_ANOMALY", "high",
                            "Price per sqm is $#{fmt_num(price_per_sqm)}/sqm — above $200K/sqm maximum threshold.",
                            field: "pricePerSqm",
                            expected: "$100–$50,000/sqm for luxury real estate",
                            actual: "$#{fmt_num(price_per_sqm)}/sqm")
            end
          end

          if price < 1000
            flags << flag("PRICE_SUSPICIOUS", "high",
                          "Price is $#{fmt_num(price)} — below $1,000 minimum for non-POR listings.",
                          field: "price",
                          expected: "> $1,000 for a luxury listing",
                          actual: "$#{fmt_num(price)}")
          end
        end

        # ── Living area checks ────────────────────────────────
        if !living_area.nil? && living_area.positive?
          if living_area > 100_000
            flags << flag("AREA_MISMATCH", "high",
                          "Living area is #{fmt_num(living_area)} sqm (#{format("%.1f", living_area / 10_000.0)} hectares) — impossibly large for a building.",
                          field: "livingArea",
                          expected: "< 100,000 sqm for even the largest structures",
                          actual: "#{fmt_num(living_area)} sqm")
          elsif living_area < 3
            flags << flag("AREA_MISMATCH", "high",
                          "Living area is #{num_str(living_area)} sqm — too small to be habitable.",
                          field: "livingArea",
                          expected: "> 3 sqm for any habitable space",
                          actual: "#{num_str(living_area)} sqm")
          end
        end

        # ── Land area checks ──────────────────────────────────
        if !land_area.nil? && land_area > 50_000_000
          flags << flag("AREA_MISMATCH", "medium",
                        "Land area is #{fmt_num(land_area)} sqm (#{format("%.1f", land_area / 1_000_000.0)} km²) — extremely large.",
                        field: "landArea",
                        expected: "< 50,000,000 sqm (5,000 hectares)",
                        actual: "#{fmt_num(land_area)} sqm")
        end

        # ── Living area ≈ land area (copy-paste error) ────────
        if truthy(living_area) && truthy(land_area) && living_area > 1000 && land_area > 1000
          ratio = living_area.to_f / land_area
          if ratio > 0.95 && ratio < 1.05
            if living_area > 10_000
              flags << flag("DATA_ENTRY_ERROR", "high",
                            "Living area (#{fmt_num(living_area)} sqm) ≈ land area (#{fmt_num(land_area)} sqm) — likely copy-paste error. A #{format("%.1f", living_area / 10_000.0)}-hectare building is physically impossible.",
                            field: "livingArea",
                            expected: "Living area << land area for large estates",
                            actual: "Living: #{fmt_num(living_area)} sqm ≈ Land: #{fmt_num(land_area)} sqm")
            else
              flags << flag("DATA_ENTRY_ERROR", "medium",
                            "Living area (#{fmt_num(living_area)} sqm) ≈ land area (#{fmt_num(land_area)} sqm) — valid for apartment/condo or could be copy-paste error.",
                            field: "livingArea",
                            expected: "Usually living area < land area",
                            actual: "Living: #{fmt_num(living_area)} sqm ≈ Land: #{fmt_num(land_area)} sqm")
            end
          end
        end

        # ── Living area > land area (non-apartment types) ─────
        if truthy(living_area) && truthy(land_area) && living_area > land_area * 1.1 &&
           !APARTMENT_TYPES.include?(real_estate_type)
          flags << flag("AREA_MISMATCH", "medium",
                        "Living area (#{fmt_num(living_area)} sqm) exceeds land area (#{fmt_num(land_area)} sqm) — unusual for #{presence(real_estate_type) || "this property type"}.",
                        field: "livingArea",
                        expected: "Living area ≤ land area for houses/villas",
                        actual: "Living: #{fmt_num(living_area)} sqm > Land: #{fmt_num(land_area)} sqm")
        end

        # ── Bedrooms / bathrooms ──────────────────────────────
        if !bedrooms.nil? && bedrooms > 50
          flags << flag("DATA_ENTRY_ERROR", "high",
                        "#{num_str(bedrooms)} bedrooms — almost certainly a data entry error.",
                        field: "bedrooms",
                        expected: "< 50 bedrooms",
                        actual: "#{num_str(bedrooms)} bedrooms")
        end

        if !bathrooms.nil? && bathrooms > 50
          flags << flag("DATA_ENTRY_ERROR", "high",
                        "#{num_str(bathrooms)} bathrooms — almost certainly a data entry error.",
                        field: "bathrooms",
                        expected: "< 50 bathrooms",
                        actual: "#{num_str(bathrooms)} bathrooms")
        end

        flags
      end

      # Port of determineVerdict.
      def determine_verdict(flags)
        high = flags.count { |f| f["severity"] == "high" }
        medium = flags.count { |f| f["severity"] == "medium" }
        return "reject" if high >= 2
        return "review" if high >= 1 || medium >= 1

        "ok"
      end

      # Port of worstVerdict.
      def worst_verdict(a, b)
        VERDICT_ORDER.fetch(a, 2) <= VERDICT_ORDER.fetch(b, 2) ? a : b
      end

      private

      def build_prompt(params, deterministic_flags)
        det_note =
          if deterministic_flags.any?
            "\n\nNOTE: Deterministic threshold checks already found #{deterministic_flags.length} issue(s):\n" \
              "#{deterministic_flags.map { |f| "- #{f["code"]}: #{f["message"]}" }.join("\n")}\n" \
              "You should confirm or add to these findings with contextual analysis. Focus on issues that simple thresholds can't catch."
          else
            ""
          end

        <<~PROMPT.chomp
          You are a data quality analyst for JamesEdition, the world's largest luxury marketplace. Your job is to check listing PARAMETERS ONLY (not images, not description text) for data quality issues.

          LISTING PARAMETERS:
          #{JSON.pretty_generate(params)}#{det_note}

          CRITICAL UNIT CONTEXT:
          - All areas on JamesEdition are in SQUARE METERS (sqm), never sq ft
          - Typical residential property sizes in sqm:
            - Studio/1-bed apartment: 30–80 sqm
            - 2-3 bed apartment: 80–200 sqm
            - Average US/EU house: 150–350 sqm (≈1,600–3,800 sqft)
            - Large luxury house/villa: 300–1,500 sqm
            - Mansion/estate: 1,000–5,000 sqm
            - Anything > 5,000 sqm living area is very unusual
          - Typical price per sqm ranges for LUXURY real estate (this is a luxury marketplace):
            - Budget markets (Bulgaria, Turkey, Egypt): $500–$3,000/sqm
            - Mid markets (Spain, Portugal, Italy, Greece): $2,000–$10,000/sqm
            - US suburban: $2,000–$6,000/sqm ($200–$550/sqft)
            - US urban/coastal: $5,000–$20,000/sqm ($500–$1,800/sqft)
            - Premium markets (London, Paris, Zurich): $10,000–$30,000/sqm
            - Ultra-premium (Monaco, Manhattan, HK): $20,000–$100,000+/sqm
          - DO NOT confuse sqm with sqft. 1 sqm ≈ 10.76 sqft.

          CHECK FOR THESE ISSUES (use these exact flag codes):

          1. PRICE_SUSPICIOUS — Is the price realistic for the country, property type, and size?
             - Ultra-luxury ($10M+) properties exist but are rare — flag only truly absurd prices
             - A $500 villa in Spain is suspicious, a $5M villa is not
             - Consider country price levels (e.g., Bulgaria < France < Monaco)

          2. PRICE_PER_SQM_ANOMALY — Is price/sqm within reason?
             - If pricePerSqm is provided, check against the ranges above for the specific country
             - Below $100/sqm or above $100K/sqm is almost always wrong
             - $2,000-$6,000/sqm is NORMAL for US suburban houses — do NOT flag this range
             - If missing but price+livingArea exist, calculate and check

          3. AREA_MISMATCH — Do area values make sense?
             - All areas are in sqm. A 200 sqm house is ~2,150 sqft — perfectly normal
             - Living area > land area is usually wrong (apartments can be exceptions)
             - Living area < 5 sqm or > 50,000 sqm is suspicious
             - Land area > 10,000,000 sqm is suspicious (unless it's an island/ranch)
             - Living area = land area exactly could be valid (condo) or copy-paste error
             - DO NOT flag normal-sized houses (100–500 sqm) as too small

          4. LOCATION_SUSPICIOUS — Does the location data make sense?
             - City should be a real place in the listed country
             - If country is empty but city is provided, that's fine (might be inferred)

          5. CATEGORY_MISMATCH — Do parameters match the category?
             - Real estate should have area/bedrooms fields
             - Cars should have year, not bedrooms
             - Yacht/boat/jet categories exist too

          6. MISSING_CRITICAL_DATA — Are essential fields missing?
             - Real estate should have: price (or POR), country, at least one area measurement
             - No price AND no POR flag = suspicious
             - Be lenient — many feeds don't provide all fields

          7. PRICE_AREA_CONFLICT — Does price match the size?
             - $50M for 30sqm apartment (likely data error unless Monaco/NYC penthouse)
             - $10K for 500sqm villa (likely wrong price)

          8. DATA_ENTRY_ERROR — Common data entry mistakes
             - Price in wrong currency (listed as USD but seems like local currency value)
             - Area in sq ft entered as sqm (values 10x too high — e.g. 2000 sqm house is suspicious, might be 2000 sqft = 186 sqm)
             - Decimal point errors

          IMPORTANT RULES:
          - Only flag CLEAR issues, not maybes
          - Luxury properties CAN have extreme values — be VERY generous with thresholds
          - If priceOnRequest is true, skip all price checks
          - Empty/null fields alone are NOT flags unless truly critical
          - Title is just for context — don't analyze title text quality
          - When in doubt, do NOT flag — false positives are worse than false negatives

          VERDICT:
          - "reject" = 2+ high-severity flags, data is clearly garbage
          - "review" = at least 1 medium+ flag, worth a human look
          - "ok" = no flags or only low-severity ones

          Respond with ONLY valid JSON (no markdown, no backticks):
          {
            "verdict": "reject" | "review" | "ok",
            "flags": [
              {
                "code": "FLAG_CODE",
                "severity": "high" | "medium" | "low",
                "message": "Clear explanation of the issue",
                "field": "which_field",
                "expected": "what's normal",
                "actual": "what was found"
              }
            ],
            "summary": "1-2 sentence summary of overall data quality",
            "confidence": 0.0-1.0
          }

          If everything looks fine, return:
          {
            "verdict": "ok",
            "flags": [],
            "summary": "Parameters look consistent for a [type] in [country]",
            "confidence": 0.95
          }
        PROMPT
      end

      def save_scan(listing:, verdict:, flags:, summary:, confidence:, parameters_checked:, model:, tokens_used:)
        # Upsert: delete existing scans for this listing first.
        AiParameterScan.where(listing_id: listing.id).destroy_all

        AiParameterScan.create!(
          listing: listing,
          je_id: listing.je_id,
          verdict: verdict,
          flags: flags,
          flag_count: flags.length,
          summary: summary,
          confidence: confidence,
          parameters_checked: parameters_checked,
          model: model,
          tokens_used: tokens_used,
          scanned_at: (Time.current.to_f * 1000).to_i
        )
      end

      def scan_payload(record)
        {
          "scanId" => record.id,
          "verdict" => record.verdict,
          "flags" => record.flags,
          "summary" => record.summary,
          "confidence" => record.confidence,
          "tokensUsed" => record.tokens_used
        }
      end

      def flag(code, severity, message, field: nil, expected: nil, actual: nil)
        {
          "code" => code, "severity" => severity, "message" => message,
          "field" => field, "expected" => expected, "actual" => actual
        }.compact
      end

      # JS toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
      def fmt_num(n)
        num_str(n).gsub(/\B(?=(\d{3})+(?!\d))/, ",")
      end

      # JS Number#toString.
      def num_str(n)
        n.is_a?(Float) ? Moderation::JsCompat.js_string_from_float(n) : n.to_s
      end

      def to_finite_float(value)
        f =
          case value
          when Numeric then value.to_f
          when String then Float(value, exception: false)
          end
        f&.finite? ? f : nil
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
