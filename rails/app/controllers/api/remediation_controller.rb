module Api
  # Shadow remediation scanner endpoints. Stats/recent port the
  # convex/remediation.ts queries; batch-scan delegates to the AI service.
  class RemediationController < BaseController
    LISTING_FIELDS = %w[
      title price currency category country city bedrooms image_count
      listing_url feed_source office
    ].freeze

    # GET /api/remediation/stats — full port of remediation.getStats
    def stats
      all = RemediationResult.all.to_a
      with_errors = all.select(&:has_fixable_errors)

      error_type_map = Hash.new(0)
      severity_counts = { high: 0, medium: 0, low: 0 }
      with_errors.each do |result|
        (result.suggestions || []).each do |s|
          error_type_map[s["errorType"]] += 1
          case s["severity"]
          when "high" then severity_counts[:high] += 1
          when "medium" then severity_counts[:medium] += 1
          else severity_counts[:low] += 1
          end
        end
      end

      feed_source_map = Hash.new { |h, k| h[k] = { total: 0, withErrors: 0 } }
      office_map = Hash.new { |h, k| h[k] = { total: 0, withErrors: 0, errorCount: 0 } }
      all.each do |result|
        src = result.feed_source.presence || "Unknown"
        feed_source_map[src][:total] += 1
        feed_source_map[src][:withErrors] += 1 if result.has_fixable_errors

        office = result.office.presence || "Unknown"
        office_map[office][:total] += 1
        if result.has_fixable_errors
          office_map[office][:withErrors] += 1
          office_map[office][:errorCount] += result.error_count
        end
      end

      with_desc_score = all.select { |r| r.description_score.present? }
      avg_desc_score =
        if with_desc_score.any?
          (with_desc_score.sum { |r| r.description_score["overall"] || 0 }.to_f /
            with_desc_score.size).round
        else
          0
        end

      now = Time.current
      daily_trend = 13.downto(0).map do |i|
        date_str = (now - i.days).utc.strftime("%Y-%m-%d")
        day_start_ms = Time.utc(*date_str.split("-").map(&:to_i)).to_i * 1000
        day_end_ms = day_start_ms + 24 * 60 * 60 * 1000
        day_results = all.select { |r| r.scanned_at >= day_start_ms && r.scanned_at < day_end_ms }
        {
          date: date_str,
          scanned: day_results.size,
          withErrors: day_results.count(&:has_fixable_errors),
          errorCount: day_results.sum(&:error_count)
        }
      end

      render json: {
        totalScanned: all.size,
        withErrors: with_errors.size,
        totalSuggestions: with_errors.sum(&:error_count),
        errorRate: all.any? ? (with_errors.size * 100.0 / all.size).round : 0,
        avgConfidence: with_errors.any? ? (with_errors.sum(&:total_confidence) / with_errors.size * 100).round : 0,
        errorTypeCounts: error_type_map.map { |type, count| { type: type, count: count } },
        severityCounts: severity_counts,
        feedSourceCounts: feed_source_map.map { |name, counts| { name: name }.merge(counts) },
        officeCounts: office_map.map { |name, counts| { name: name }.merge(counts) },
        avgDescScore: avg_desc_score,
        dailyTrend: daily_trend
      }
    end

    # GET /api/remediation/recent?limit=&offset=&errorsOnly=
    def recent
      scope = RemediationResult.order(scanned_at: :desc, id: :desc)
      scope = scope.where(has_fixable_errors: true) if ActiveModel::Type::Boolean.new.cast(params[:errorsOnly])
      scope = scope.offset(params[:offset].to_i) if params[:offset].present?
      results = scope.limit(limit_param(100)).includes(:listing)

      render json: results.map { |result|
        listing = result.listing
        ConvexDoc.render(result).merge(
          "listing" => listing && LISTING_FIELDS.index_with { |f| listing.public_send(f) }
                                                .transform_keys { |k| k.camelize(:lower) }
        )
      }
    end

    # POST /api/remediation/batch-scan
    def batch_scan
      render json: Ai::RemediationScanner.batch_scan(limit: params[:limit].presence&.to_i)
    end
  end
end
