module Api
  # Mirrors convex/rules.ts (reads: moderator, writes: admin) plus the AI
  # rule suggester (convex/rulesAi.ts).
  class RulesController < BaseController
    before_action :require_admin!, only: %i[create update destroy toggle]

    # GET /api/rules
    def index
      render json: ConvexDoc.render_many(Rule.all)
    end

    # POST /api/rules
    def create
      rule = Rule.create!(
        rule_params.merge(
          match_count: 0,
          false_positive_count: 0,
          created_at_ms: now_ms,
          last_modified_at: now_ms,
          last_modified_by: current_moderator.email
        )
      )
      log_activity(action: "rule_created", target_type: "rule", target_id: rule.id.to_s,
                   details: "Created rule #{rule.name}")
      render json: ConvexDoc.render(rule)
    end

    # PATCH /api/rules/:id
    def update
      rule = Rule.find(params[:id])
      rule.update!(
        rule_update_params.merge(
          last_modified_at: now_ms,
          last_modified_by: current_moderator.email
        )
      )
      log_activity(action: "rule_updated", target_type: "rule", target_id: rule.id.to_s,
                   details: "Updated rule #{rule.name}")
      render json: ConvexDoc.render(rule)
    end

    # POST /api/rules/:id/toggle
    def toggle
      rule = Rule.find(params[:id])
      rule.update!(
        enabled: !rule.enabled,
        last_modified_at: now_ms,
        last_modified_by: current_moderator.email
      )
      log_activity(action: "rule_toggled", target_type: "rule", target_id: rule.id.to_s,
                   details: "#{rule.enabled ? 'Enabled' : 'Disabled'} rule #{rule.name}")
      render json: ConvexDoc.render(rule)
    end

    # DELETE /api/rules/:id
    def destroy
      rule = Rule.find(params[:id])
      rule.destroy!
      log_activity(action: "rule_deleted", target_type: "rule", target_id: rule.id.to_s,
                   details: "Deleted rule #{rule.name}")
      render json: { success: true }
    end

    # POST /api/rules/suggest — AI-assisted rule generation
    def suggest
      render json: Ai::RuleSuggester.call(description: params[:description].to_s)
    end

    private

    def rule_params
      permitted = params.permit(
        :name, :displayName, :description, :category, :listingCategory,
        :tier, :enabled, :priority, :sellerMessage
      ).to_h.transform_keys(&:underscore)
      permitted["config"] = body_config
      # `action` must come from the request body — the routing params
      # (controller/action) shadow it in the merged params hash.
      permitted["action"] = body_params["action"]
      permitted
    end

    def rule_update_params
      permitted = params.permit(
        :displayName, :description, :listingCategory,
        :tier, :enabled, :priority, :sellerMessage
      ).to_h.transform_keys(&:underscore)
      permitted["config"] = body_config if body_params.key?("config")
      permitted["action"] = body_params["action"] if body_params.key?("action")
      permitted
    end

    def body_params
      request.request_parameters
    end

    def body_config
      config = body_params["config"]
      config.is_a?(Hash) ? config : {}
    end
  end
end
