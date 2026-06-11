module Api
  # Session endpoints used by the SPA: GET returns the current user (or null)
  # plus a CSRF token; POST signs in via warden; DELETE signs out.
  class SessionsController < BaseController
    skip_before_action :require_moderator!

    # GET /api/session
    def show
      render json: { user: ConvexDoc.render(current_moderator), csrfToken: csrf_token }
    end

    # POST /api/session
    def create
      moderator = Moderator.find_by(email: params[:email].to_s.strip.downcase)

      unless moderator&.valid_password?(params[:password].to_s)
        return render json: { error: "Invalid email or password." }, status: :unauthorized
      end
      if moderator.status == "disabled"
        return render json: { error: "Unauthorized: an active moderator account is required." },
                      status: :unauthorized
      end

      updates = { last_login_at: now_ms }
      updates[:status] = "active" if moderator.status == "invited"
      moderator.update_columns(updates)

      sign_in(:moderator, moderator)

      # Fresh token post-login (Devise rotates the CSRF token on sign-in).
      render json: { user: ConvexDoc.render(moderator.reload), csrfToken: csrf_token }
    end

    # DELETE /api/session
    def destroy
      sign_out(:moderator)
      head :no_content
    end

    private

    # The SPA reads the token from the JSON body; we also expose it as a
    # readable cookie for convenience (contract: XSRF-TOKEN).
    def csrf_token
      token = form_authenticity_token
      cookies["XSRF-TOKEN"] = { value: token, same_site: :lax }
      token
    end
  end
end
