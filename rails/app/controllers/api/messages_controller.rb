module Api
  # Message template CRUD. Mirrors convex/messages.ts (reads: moderator,
  # writes: admin).
  class MessagesController < BaseController
    before_action :require_admin!, only: %i[create update destroy]

    # GET /api/messages
    def index
      render json: ConvexDoc.render_many(MessageTemplate.all)
    end

    # POST /api/messages
    def create
      template = MessageTemplate.create!(
        params.permit(:name, :displayName, :category, :subject, :body, :isDefault)
              .to_h.transform_keys(&:underscore)
      )
      render json: ConvexDoc.render(template)
    end

    # PATCH /api/messages/:id
    def update
      template = MessageTemplate.find(params[:id])
      template.update!(
        params.permit(:displayName, :category, :subject, :body, :isDefault)
              .to_h.transform_keys(&:underscore)
      )
      render json: ConvexDoc.render(template)
    end

    # DELETE /api/messages/:id
    def destroy
      MessageTemplate.find(params[:id]).destroy!
      render json: { success: true }
    end
  end
end
