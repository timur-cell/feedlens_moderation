module Listings
  # Port of convex/fetchListing.ts: parses listing ids / jamesedition.com
  # URLs, fetches listing data through the cascading JE sources, creates or
  # updates local Listing records, runs vision for visionCountries listings,
  # runs the moderation pipeline and returns the fetchAndModerate contract.
  class FetchAndModerate
    MAX_VISION_IMAGES = 10
    DEFAULT_VISION_COUNTRIES = %w[ES IT PT FR GR].freeze

    # Synchronous batches above this size are pushed to the queue instead of
    # being processed inline, so a large paste / feed burst can never hold a
    # web thread for the full fetch + vision + LLM chain per input.
    MAX_SYNC_INPUTS = 25

    DATA_FETCH_FAILED_MATCH = {
      "ruleName" => "data_fetch_failed",
      "ruleCategory" => "internal",
      "tier" => "manual",
      "action" => "flag",
      "message" => "⚠️ Data Fetch Failed — both JE Mobile API and HTML scraping returned errors. " \
                   "Cannot evaluate this listing without data.",
      "details" => "All data sources failed (mobile API, search API, HTML scrape)."
    }.freeze

    class << self
      def call(inputs:, moderator: nil)
        cleaned = Array(inputs).map { |i| i.to_s.strip }.reject(&:empty?)

        # Safety valve: oversized batches must not run inline on the request
        # thread — fall back to the async queue path automatically.
        return enqueue(inputs: cleaned, moderator: moderator) if cleaned.length > MAX_SYNC_INPUTS

        results = cleaned.map do |input|
          process_one(input, moderator: moderator)
        rescue StandardError => e
          { jeId: input, input: input, error: e.message, status: "error" }
        end

        {
          success: true,
          count: results.length,
          successCount: results.count { |r| r[:status] == "success" },
          errorCount: results.count { |r| r[:status] == "error" },
          results: results
        }
      end

      # Enqueue one job per input and return immediately. Oversized interactive
      # batches (and any caller that wants async) use this so the heavy AI work
      # runs in Solid Queue rather than on a Puma thread.
      def enqueue(inputs:, moderator: nil)
        cleaned = Array(inputs).map { |i| i.to_s.strip }.reject(&:empty?)
        cleaned.each { |input| FetchAndModerateJob.perform_later(input, moderator&.id) }

        { success: true, status: "queued", queued: cleaned.length, count: cleaned.length }
      end

      # Port of the enrichListing internal action: fetch full data from JE
      # and fill in ONLY the fields that are still missing on the local
      # record (placeholder titles are the one field that is replaced).
      def enrich_listing(je_id)
        je_id = je_id.to_s
        fetched = JeClient.fetch_listing(je_id)
        return { success: false, error: "All data sources failed" } unless fetched

        existing = Listing.find_by(je_id: je_id)
        return { success: false, error: "Listing not found in database" } unless existing

        data = fetched[:data]
        price_per_sqm = compute_price_per_sqm(data[:price], data[:living_area])

        candidate = {
          title: data[:title],
          price: data[:price],
          currency: data[:currency],
          price_usd: nil,
          price_on_request: data[:price_on_request],
          category: data[:category] || "real_estate",
          real_estate_type: data[:real_estate_type],
          country: data[:country],
          city: data[:city],
          state: data[:state],
          bedrooms: data[:bedrooms],
          bathrooms: data[:bathrooms],
          living_area: data[:living_area],
          land_area: data[:land_area],
          image_count: data[:image_count],
          image_urls: data[:image_urls],
          description_length: data[:description_length],
          description: data[:description],
          office: data[:office],
          office_group_name: data[:office_group_name],
          office_subscription: data[:office_subscription],
          listing_url: data[:listing_url],
          price_per_sqm: price_per_sqm
        }

        patch = {}
        candidate.each do |key, value|
          current = existing.public_send(key)
          placeholder_title = key == :title && current == "Listing #{je_id}"
          patch[key] = value if current.nil? || placeholder_title
        end
        # Fill-missing-only patch never writes nil over anything.
        patch.compact!
        existing.update!(patch) if patch.any?

        { success: true, dataSource: fetched[:source] }
      rescue StandardError => e
        { success: false, error: e.message || "Unknown error" }
      end

      # Port of the input-parsing logic (URL id extraction with the
      # longest-digit-run fallback, jamesedition.com host allowlist).
      def parse_input(trimmed)
        if trimmed.start_with?("http")
          je_id = trimmed[%r{[-/](\d{5,})(?:[?#]|$)}, 1]
          unless je_id
            digit_runs = trimmed.scan(/\d{5,}/)
            je_id = digit_runs.sort_by.with_index { |run, i| [ run.length, trimmed.rindex(run), i ] }.last || ""
          end

          host =
            begin
              URI(trimmed).host.to_s
            rescue URI::InvalidURIError
              ""
            end
          url =
            if host == "jamesedition.com" || host.end_with?(".jamesedition.com")
              trimmed
            else
              "https://www.jamesedition.com/listing/#{je_id}"
            end
          [ je_id.to_s, url ]
        else
          je_id = trimmed.gsub(/\D/, "")
          [ je_id, "https://www.jamesedition.com/listing/#{je_id}" ]
        end
      end

      # Fetch + moderate a single input (id or jamesedition.com URL). Public so
      # FetchAndModerateJob can call it; returns the same per-input result hash
      # the synchronous batch path collects.
      def process_one(trimmed, moderator: nil)
        je_id, url = parse_input(trimmed)
        if je_id.empty? || je_id.length < 5
          return { jeId: trimmed, input: trimmed, error: "Invalid listing ID", status: "error" }
        end

        # A locked listing carries a final human decision: skip the re-import
        # (which would reset moderation_status to pending) and the re-moderation
        # entirely.
        locked = Listing.find_by(je_id: je_id, moderation_locked: true)
        if locked
          return {
            jeId: je_id,
            input: trimmed,
            listingId: locked.id,
            title: locked.title,
            outcome: locked.moderation_status,
            locked: true,
            status: "skipped",
            error: "Listing decision is locked by #{locked.moderation_locked_by.presence || 'a moderator'} — unlock it to re-moderate"
          }
        end

        # Fetch listing data with cascading sources
        fetched = JeClient.fetch_listing(je_id, url: url)
        data = fetched&.dig(:data) || minimal_listing_data(je_id, url)
        data_source = fetched&.dig(:source) || "minimal"

        listing = upsert_listing(je_id, data)

        # Run AI vision only for the configured vision countries (high-risk
        # ES/IT/PT/FR/GR by default); other countries get vision on demand
        # from Auto AI rules.
        vision_analyzed = false
        if should_run_vision?(data[:country]) && data[:image_urls].present?
          vision_analyzed = run_vision(listing, data)
        end

        # If data fetch failed (minimal record), skip moderation and route to
        # manual review.
        if data_source == "minimal"
          ModerationResult.create!(
            listing: listing,
            je_id: je_id,
            outcome: "manual",
            rule_matches: [ DATA_FETCH_FAILED_MATCH ],
            llm_triggered: false,
            confidence: 0,
            processed_at: now_ms
          )
          listing.update!(moderation_status: "manual")

          return {
            jeId: je_id,
            input: trimmed,
            listingId: listing.id,
            title: data[:title],
            outcome: "manual",
            ruleMatches: 1,
            llmTriggered: false,
            visionAnalyzed: false,
            error: "Data fetch failed — routed to manual review",
            status: "success",
            dataSource: data_source
          }
        end

        # Run the moderation engine (only when we have actual data)
        mod_result = Moderation::Runner.call(listing, moderator: moderator)

        # AI parameter scan result (saved during moderation)
        scan = AiParameterScan.where(je_id: je_id).order(scanned_at: :desc).first

        {
          jeId: je_id,
          input: trimmed,
          listingId: listing.id,
          title: data[:title],
          outcome: mod_result[:outcome],
          ruleMatches: mod_result[:ruleMatches]&.length || 0,
          ruleMatchDetails: (mod_result[:ruleMatches] || []).map do |rm|
            {
              ruleName: rm["ruleName"],
              ruleCategory: rm["ruleCategory"],
              action: rm["action"],
              tier: rm["tier"],
              message: rm["message"],
              details: rm["details"]
            }
          end,
          llmTriggered: mod_result[:llmTriggered],
          visionAnalyzed: vision_analyzed || mod_result[:visionAnalyzed],
          status: "success",
          dataSource: data_source,
          aiScan: scan && {
            verdict: scan.verdict,
            flagCount: scan.flag_count,
            summary: scan.summary,
            confidence: scan.confidence,
            flags: scan.flags
          }
        }
      end

      private

      def minimal_listing_data(je_id, url)
        {
          je_id: je_id,
          title: "Listing #{je_id}",
          listing_url: url,
          category: "real_estate",
          raw_data: {
            "source" => "minimal",
            "dataFetchFailed" => true,
            "fetchFailedAt" => Time.current.iso8601,
            "fetchFailedReason" => "Both mobile API and HTML scraping failed"
          }
        }
      end

      # Port of listings.create: upsert by jeId, resetting moderationStatus
      # to pending and stamping importedAt. Only non-nil fetched values are
      # assigned (Convex drops undefined args, leaving existing fields).
      def upsert_listing(je_id, data)
        listing = Listing.find_or_initialize_by(je_id: je_id)

        attrs = data.except(:je_id).compact
        attrs[:price_per_sqm] = compute_price_per_sqm(data[:price], data[:living_area])
        attrs.compact!

        listing.assign_attributes(attrs)
        listing.moderation_status = "pending"
        listing.imported_at = now_ms
        listing.save!
        listing
      end

      def compute_price_per_sqm(price, living_area)
        return nil unless price.is_a?(Numeric) && price.positive? && living_area.is_a?(Numeric) && living_area.positive?

        (price.to_f / living_area).round
      end

      def should_run_vision?(country)
        vision_countries = Setting.current["vision_countries"]
        vision_countries = DEFAULT_VISION_COUNTRIES unless vision_countries.is_a?(Array) && vision_countries.any?
        vision_countries.include?(JeClient.resolve_country_code(country.to_s))
      end

      def run_vision(listing, data)
        vision = Ai::VisionAnalyzer.analyze(
          image_urls: data[:image_urls].first(MAX_VISION_IMAGES),
          title: data[:title],
          je_id: listing.je_id
        )
        return false unless vision && !vision["error"] && !vision["property_condition"].nil?

        attrs = {
          chat_gpt_property_condition: vision["property_condition"],
          chat_gpt_conclusion: vision["conclusion"].nil? ? nil : Moderation::JsCompat.js_string(vision["conclusion"]),
          chat_gpt_watermark_share: vision["watermark_share"],
          chat_gpt_watermark_text: vision["watermark_text"],
          chat_gpt_image_quality: vision["image_quality"],
          chat_gpt_image_type: vision["image_type"]
        }.compact
        listing.update!(attrs) if attrs.any?
        true
      rescue StandardError
        # Continue without vision
        false
      end

      def now_ms
        (Time.current.to_f * 1000).to_i
      end
    end
  end
end
