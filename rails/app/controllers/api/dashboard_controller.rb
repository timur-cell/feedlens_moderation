module Api
  # Ports convex/moderation.ts getDashboardStats + exportCSV.
  class DashboardController < BaseController
    # GET /api/dashboard/stats?startDate=&endDate= (epoch ms)
    def stats
      results = filtered_results

      auto_results = results.reject { |r| r.overridden_by.present? }
      manual_results = results.select { |r| r.overridden_by.present? }

      stats = {
        total: results.size,
        approved: results.count { |r| r.outcome == "approved" },
        rejected: results.count { |r| r.outcome == "rejected" },
        noticed: results.count { |r| r.outcome == "notice" },
        manual: results.count { |r| r.outcome == "manual" },
        autoTotal: auto_results.size,
        manualTotal: manual_results.size,
        autoApproved: auto_results.count { |r| r.outcome == "approved" },
        manualApproved: manual_results.count { |r| r.outcome == "approved" },
        autoRejected: auto_results.count { |r| r.outcome == "rejected" },
        manualRejected: manual_results.count { |r| r.outcome == "rejected" },
        autoNoticed: auto_results.count { |r| r.outcome == "notice" },
        manualNoticed: manual_results.count { |r| r.outcome == "notice" }
      }

      daily = Hash.new do |hash, date|
        hash[date] = {
          date: date, total: 0,
          approvedAuto: 0, approvedManual: 0,
          rejectedAuto: 0, rejectedManual: 0,
          noticedAuto: 0, noticedManual: 0,
          manualQueue: 0
        }
      end

      results.each do |r|
        bucket = daily[date_key(r.processed_at)]
        bucket[:total] += 1
        is_manual = r.overridden_by.present?

        case r.outcome
        when "approved" then bucket[is_manual ? :approvedManual : :approvedAuto] += 1
        when "rejected" then bucket[is_manual ? :rejectedManual : :rejectedAuto] += 1
        when "notice" then bucket[is_manual ? :noticedManual : :noticedAuto] += 1
        when "manual" then bucket[:manualQueue] += 1
        end
      end

      render json: { stats: stats, dailyData: daily.values.sort_by { |d| d[:date] } }
    end

    # GET /api/dashboard/export-csv?startDate=&endDate= — JSON array of rows
    def export_csv
      results = filtered_results
      listings = Listing.where(id: results.map(&:listing_id).uniq).index_by(&:id)

      rows = results.map do |r|
        listing = listings[r.listing_id]
        {
          jeId: r.je_id,
          title: listing&.title || "",
          outcome: r.outcome,
          category: listing&.category || "",
          country: listing&.country || "",
          city: listing&.city || "",
          price: listing&.price_usd || listing&.price || "",
          rules: (r.rule_matches || []).map { |m| m["ruleName"] }.join("; "),
          llmTriggered: r.llm_triggered ? "Yes" : "No",
          confidence: r.confidence.present? && r.confidence != 0 ? r.confidence : "",
          processedAt: Time.at(r.processed_at / 1000.0).utc.strftime("%Y-%m-%dT%H:%M:%S.%LZ"),
          overriddenBy: r.overridden_by || ""
        }
      end

      render json: rows
    end

    private

    def filtered_results
      scope = ModerationResult.order(processed_at: :desc, id: :desc)
      start_date = params[:startDate].presence&.to_i
      end_date = params[:endDate].presence&.to_i
      scope = scope.where(processed_at: start_date..) if start_date
      scope = scope.where(processed_at: ..end_date) if end_date
      scope.to_a
    end

    def date_key(processed_at_ms)
      Time.at(processed_at_ms / 1000.0).utc.strftime("%Y-%m-%d")
    end
  end
end
