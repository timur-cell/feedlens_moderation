module Api
  # Per-moderator saved filter sets (Decisions screen). Each moderator only
  # ever sees and manages their own views.
  class SavedViewsController < BaseController
    # GET /api/saved-views?scope=decisions
    def index
      views = current_moderator.saved_views
      views = views.where(scope: params[:scope]) if params[:scope].present?
      render json: ConvexDoc.render_many(views.order(created_at_ms: :asc, id: :asc))
    end

    # POST /api/saved-views
    def create
      view = current_moderator.saved_views.create!(
        name: params.require(:name).to_s,
        scope: params[:scope].presence || "decisions",
        query: params[:query].to_s,
        created_at_ms: now_ms
      )
      render json: ConvexDoc.render(view)
    end

    # DELETE /api/saved-views/:id
    def destroy
      current_moderator.saved_views.find(params[:id]).destroy!
      render json: { success: true }
    end
  end
end
