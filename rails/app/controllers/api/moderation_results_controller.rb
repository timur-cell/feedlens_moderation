module Api
  # Mirrors convex/moderation.ts result queries plus overrideDecision /
  # overrideWithImplio.
  class ModerationResultsController < BaseController
    # GET /api/moderation-results/recent?limit=
    def recent
      results = ModerationResult.order(processed_at: :desc, id: :desc).limit(limit_param(50))
      render json: ConvexDoc.render_many(results)
    end

    # GET /api/moderation-results/by-outcome?outcome=&limit=
    def by_outcome
      results = ModerationResult.where(outcome: params[:outcome].to_s)
                                .order(processed_at: :desc, id: :desc)
                                .limit(limit_param(50))
      render json: ConvexDoc.render_many(results)
    end

    # GET /api/moderation-results/for-listing/:listing_id
    def for_listing
      results = ModerationResult.where(listing_id: params[:listing_id]).order(id: :desc)
      render json: ConvexDoc.render_many(results)
    end

    # GET /api/moderation-results/by-rule?ruleName=&limit=
    #
    # Ports getResultsByRule: results whose ruleMatches array contains an
    # entry with this ruleName, enriched with the listing, plus totals.
    def by_rule
      rule_name = params[:ruleName].to_s
      total_results = ModerationResult.count
      matched = ModerationResult.where("rule_matches @> ?", [ { ruleName: rule_name } ].to_json)
      total = matched.count
      items = matched.order(processed_at: :desc, id: :desc)
                     .limit(limit_param(20))
                     .includes(:listing)

      render json: {
        total: total,
        totalResults: total_results,
        percentage: total_results.positive? ? format("%.1f", total * 100.0 / total_results) : "0",
        items: items.map { |r| ConvexDoc.render(r).merge("listing" => ConvexDoc.render(r.listing)) }
      }
    end

    # GET /api/moderation-results/latest-by-je-id/:je_id
    def latest_by_je_id
      result = ModerationResult.where(je_id: params[:je_id].to_s).order(id: :desc).first
      render json: ConvexDoc.render(result)
    end

    # POST /api/moderation-results/:id/override
    def override
      result = ModerationResult.find(params[:id])
      apply_override!(result)
      render json: { success: true }
    end

    # POST /api/moderation-results/:id/override-with-implio
    def override_with_implio
      result = ModerationResult.find(params[:id])
      apply_override!(result)

      implio = Integrations::ImplioClient.submit_result(result)
      implio = (implio || {}).symbolize_keys

      payload = { success: true, implioSubmitted: implio[:success] == true }
      payload[:implioError] = implio[:error] if implio[:error].present?
      render json: payload
    end

    private

    # Mirrors moderation.overrideDecision: stores the original outcome,
    # attributes the override to the session moderator and updates the
    # listing's moderation status.
    def apply_override!(result)
      new_outcome = params[:newOutcome].to_s

      patch = {
        original_outcome: result.original_outcome.presence || result.outcome,
        outcome: new_outcome,
        overridden_by: current_moderator.name.presence || current_moderator.email,
        overridden_at: now_ms,
        override_reason: params[:reason].presence,
        seller_message: params[:sellerMessage].presence || result.seller_message
      }
      patch[:refuse_reason_type] = params[:refuseReasonType] if params[:refuseReasonType].present?
      result.update!(patch)

      result.listing.update!(moderation_status: new_outcome)

      log_activity(
        action: "override_decision",
        target_type: "moderationResult",
        target_id: result.id.to_s,
        details: "Overrode #{result.original_outcome} → #{new_outcome} for listing #{result.je_id}" \
                 "#{params[:reason].present? ? ". Reason: #{params[:reason]}" : ''}"
      )
    end
  end
end
