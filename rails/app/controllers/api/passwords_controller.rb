module Api
  # Devise-backed password reset endpoints (JSON only).
  class PasswordsController < BaseController
    skip_before_action :require_moderator!

    # POST /api/password — always 200 to avoid account enumeration.
    def create
      Moderator.send_reset_password_instructions(email: params[:email].to_s)
      render json: { success: true }
    end

    # PUT /api/password
    def update
      moderator = Moderator.reset_password_by_token(
        reset_password_token: params[:token].to_s,
        password: params[:password].to_s,
        password_confirmation: params[:password].to_s
      )

      if moderator.persisted? && moderator.errors.empty?
        render json: { success: true }
      else
        message = moderator.errors.full_messages.presence&.join(", ") || "Invalid token"
        render json: { error: message }, status: :unprocessable_entity
      end
    end
  end
end
