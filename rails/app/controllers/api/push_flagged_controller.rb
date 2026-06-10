module Api
  # POST /api/push-flagged — LAS/BigQuery pipeline push. Exact behavioral
  # parity with the push-flagged route in convex/http.ts: API-key auth
  # (constant time), dedup on ai_validated_at + user_message, create/update
  # with status "manual" and async enrichment for created listings.
  #
  # No Devise session and no CSRF — the caller authenticates with X-Api-Key.
  class PushFlaggedController < ActionController::Base
    skip_forgery_protection

    # Malformed JSON raises during params parsing inside the instrumentation
    # layer (above rescue_from), so wrap the whole action dispatch. Auth is
    # still checked first — TS parity: bad key beats bad body.
    def process_action(*)
      super
    rescue ActionDispatch::Http::Parameters::ParseError
      if authorized?
        render json: { error: "Invalid JSON" }, status: :bad_request
      else
        render json: { error: "Unauthorized" }, status: :unauthorized
      end
    end

    def create
      return render json: { error: "Unauthorized" }, status: :unauthorized unless authorized?

      body = parse_body
      return render json: { error: "Invalid JSON" }, status: :bad_request if body.nil?

      listings = body["listings"]
      unless listings.is_a?(Array) && listings.any?
        return render json: { error: "listings array required" }, status: :bad_request
      end

      results = { processed: 0, skipped: 0, created: 0, updated: 0, errors: [] }

      listings.each do |item|
        item = {} unless item.is_a?(Hash)
        process_item(item, results)
      end

      render json: results
    end

    # OPTIONS /api/push-flagged — CORS preflight
    def preflight
      response.set_header("Access-Control-Allow-Origin", "*")
      response.set_header("Access-Control-Allow-Methods", "POST")
      response.set_header("Access-Control-Allow-Headers", "Content-Type, X-Api-Key")
      response.set_header("Access-Control-Max-Age", "86400")
      head :no_content
    end

    private

    def authorized?
      expected = ENV["LAS_PUSH_API_KEY"]
      provided = request.headers["X-Api-Key"].presence
      return false if expected.blank? || provided.blank?

      # Compare SHA256 digests in constant time so neither content nor
      # length of the key leaks through timing.
      ActiveSupport::SecurityUtils.fixed_length_secure_compare(
        ::Digest::SHA256.digest(provided),
        ::Digest::SHA256.digest(expected)
      )
    end

    def parse_body
      JSON.parse(request.raw_post.presence || "")
    rescue JSON::ParserError, TypeError
      nil
    end

    def process_item(item, results)
      raw_id = item["listing_id"].nil? ? item["jeId"] : item["listing_id"]
      je_id = raw_id.nil? ? "" : raw_id.to_s.strip
      if je_id.empty?
        results[:errors] << "Missing listing_id"
        return
      end

      existing = Listing.find_by(je_id: je_id)

      incoming_validated_at = to_epoch_ms(item["ai_validated_at"])
      if existing
        existing_validated_at = existing.accuracy_source_updated_at
        incoming_message = item["user_message"].presence
        existing_message = existing.accuracy_user_message.presence

        if incoming_validated_at && existing_validated_at &&
           incoming_validated_at == existing_validated_at &&
           incoming_message == existing_message
          results[:skipped] += 1
          return
        end
      end

      accuracy_patch = {
        accuracy_score: item["total_score"].nil? ? nil : Float(item["total_score"]),
        accuracy_flags: item["flags"] || item["all_flags"],
        accuracy_user_message: item["user_message"].presence,
        accuracy_action: item["action"].presence,
        accuracy_scanned_at: now_ms,
        accuracy_source_updated_at: incoming_validated_at || now_ms
      }.compact

      if existing
        existing.update!(accuracy_patch.merge(moderation_status: "manual"))
        results[:updated] += 1
      else
        listing = Listing.create!(
          je_id: je_id,
          title: item["headline"].presence || item["title"].presence || "Listing #{je_id}",
          price: item["price_cents"].nil? ? nil : Float(item["price_cents"]) / 100,
          currency: item["currency"].presence,
          category: "real_estate",
          real_estate_type: item["real_estate_type"].presence,
          country: item["country"].presence,
          city: item["city"].presence,
          living_area: item["living_area_sqm"].nil? ? nil : Float(item["living_area_sqm"]),
          land_area: item["land_area_sqm"].nil? ? nil : Float(item["land_area_sqm"]),
          bedrooms: item["bedrooms"].nil? ? nil : Integer(item["bedrooms"], exception: false) || item["bedrooms"].to_i,
          bathrooms: item["bathrooms"].nil? ? nil : Integer(item["bathrooms"], exception: false) || item["bathrooms"].to_i,
          office_subscription: item["account_type"].presence,
          office: item["office_id"].present? ? item["office_id"].to_s : nil,
          moderation_status: "pending",
          imported_at: now_ms
        )
        listing.update!(accuracy_patch.merge(moderation_status: "manual"))
        EnrichListingJob.perform_later(je_id)
        results[:created] += 1
      end

      results[:processed] += 1
    rescue StandardError => e
      results[:errors] << "#{item['listing_id'].presence || 'unknown'}: #{e.message.presence || 'Unknown error'}"
    end

    # Mirrors `new Date(value).getTime()`: numbers are already epoch ms,
    # strings are parsed as timestamps.
    def to_epoch_ms(value)
      return nil if value.blank?
      return value.to_i if value.is_a?(Numeric)

      (Time.zone.parse(value.to_s).to_f * 1000).round
    rescue ArgumentError, TypeError
      nil
    end

    def now_ms
      (Time.current.to_f * 1000).to_i
    end
  end
end
