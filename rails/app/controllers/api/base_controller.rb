module Api
  # Base controller for all JSON API endpoints. Mirrors convex/authz.ts:
  # `require_moderator!` admits any ACTIVE account (admin/moderator/viewer),
  # `require_admin!` additionally requires the admin role.
  class BaseController < ActionController::Base
    protect_from_forgery with: :exception

    before_action :require_moderator!

    rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
    rescue_from ActiveRecord::RecordInvalid, with: :render_record_invalid
    rescue_from ActionController::ParameterMissing, with: :render_param_missing

    private

    def require_moderator!
      return if current_moderator&.active?

      render json: { error: "Unauthorized: an active moderator account is required." },
             status: :unauthorized
    end

    def require_admin!
      return if performed?
      return if current_moderator&.active? && current_moderator.admin?

      render json: { error: "Forbidden: admin role required." }, status: :forbidden
    end

    # Mirrors users.ts logActivity: increments the moderator's actionCount and
    # inserts a moderatorActivity row attributed to them.
    def log_activity(action:, target_type: nil, target_id: nil, details: nil, moderator: current_moderator)
      moderator.update_columns(action_count: (moderator.action_count || 0) + 1)
      ModeratorActivity.create!(
        moderator: moderator,
        moderator_name: moderator.name,
        action: action,
        target_type: target_type,
        target_id: target_id,
        details: details,
        timestamp: now_ms
      )
    end

    def now_ms
      (Time.current.to_f * 1000).to_i
    end

    def limit_param(default)
      value = params[:limit].presence&.to_i
      value && value.positive? ? value : default
    end

    def render_not_found(exception = nil)
      message = exception.respond_to?(:model) && exception.model == "Moderator" ? "User not found" : "Not found"
      render json: { error: message }, status: :not_found
    end

    def render_record_invalid(exception)
      render json: { error: exception.record.errors.full_messages.join(", ") },
             status: :unprocessable_entity
    end

    def render_param_missing(exception)
      render json: { error: exception.message }, status: :unprocessable_entity
    end
  end
end
