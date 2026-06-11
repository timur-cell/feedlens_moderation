module Api
  # Team management. Mirrors convex/users.ts + adminUsers.ts/adminAuth.ts,
  # including the moderatorActivity rows those mutations insert.
  class UsersController < BaseController
    before_action :require_admin!, only: %i[create update destroy reactivate set_password]

    # GET /api/users
    def index
      render json: ConvexDoc.render_many(Moderator.all)
    end

    # GET /api/users/stats
    def stats
      all = Moderator.all.to_a
      render json: {
        total: all.size,
        active: all.count { |u| u.status == "active" },
        invited: all.count { |u| u.status == "invited" },
        disabled: all.count { |u| u.status == "disabled" },
        admins: all.count { |u| u.role == "admin" },
        moderators: all.count { |u| u.role == "moderator" },
        viewers: all.count { |u| u.role == "viewer" }
      }
    end

    # GET /api/users/:id/activity?limit=
    def activity
      moderator = Moderator.find(params[:id])
      entries = ModeratorActivity.where(moderator_id: moderator.id)
                                 .order(timestamp: :desc, id: :desc)
                                 .limit(limit_param(20))
      render json: ConvexDoc.render_many(entries)
    end

    # GET /api/activity?limit=
    def recent_activity
      entries = ModeratorActivity.order(timestamp: :desc, id: :desc).limit(limit_param(50))
      render json: ConvexDoc.render_many(entries)
    end

    # POST /api/users — mirrors adminUsers.createUserWithLogin: creates an
    # immediately-active login; duplicate emails yield success: false.
    def create
      email = params[:email].to_s.strip.downcase
      password = params[:password].presence || ENV["DEFAULT_USER_PASSWORD"].to_s

      if Moderator.exists?(email: email)
        return render json: {
          success: false,
          message: "Auth account created but moderator record failed: " \
                   "User with email #{email} already exists",
          password: password
        }
      end

      moderator = Moderator.create!(
        name: params[:name].to_s,
        email: email,
        role: params[:role].to_s,
        password: password,
        status: "active",
        invited_by: current_moderator.email,
        action_count: 0
      )

      ModeratorActivity.create!(
        moderator: moderator,
        moderator_name: moderator.name,
        action: "invited",
        details: "Created as #{moderator.role} with login credentials by #{current_moderator.email}",
        timestamp: now_ms
      )

      render json: {
        success: true,
        moderatorId: moderator.id.to_s,
        message: "User #{moderator.name} created with password",
        password: password
      }
    end

    # PATCH /api/users/:id
    def update
      moderator = Moderator.find(params[:id])
      updates = params.permit(:name, :role, :status).to_h.compact
      moderator.update!(updates) if updates.present?

      changes = updates.map { |k, v| "#{k}: #{v}" }.join(", ")
      ModeratorActivity.create!(
        moderator: moderator,
        moderator_name: moderator.name,
        action: "profile_updated",
        details: "Updated: #{changes}",
        timestamp: now_ms
      )

      render json: ConvexDoc.render(moderator)
    end

    # DELETE /api/users/:id — soft delete (status → disabled)
    def destroy
      moderator = Moderator.find(params[:id])
      moderator.update!(status: "disabled")

      ModeratorActivity.create!(
        moderator: moderator,
        moderator_name: moderator.name,
        action: "disabled",
        details: "Account disabled",
        timestamp: now_ms
      )

      render json: ConvexDoc.render(moderator)
    end

    # POST /api/users/:id/reactivate
    def reactivate
      moderator = Moderator.find(params[:id])
      moderator.update!(status: "active")

      ModeratorActivity.create!(
        moderator: moderator,
        moderator_name: moderator.name,
        action: "reactivated",
        details: "Account reactivated",
        timestamp: now_ms
      )

      render json: ConvexDoc.render(moderator)
    end

    # POST /api/users/set-password — mirrors adminUsers.setUserPassword
    def set_password
      email = params[:email].to_s.strip.downcase
      moderator = Moderator.find_by(email: email)

      unless moderator
        return render json: {
          success: false,
          message: "Failed to reset password: user #{email} not found"
        }
      end

      moderator.update!(password: params[:newPassword].to_s)
      render json: { success: true, message: "Password updated for #{email}" }
    end
  end
end
