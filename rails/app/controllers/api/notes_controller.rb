module Api
  # Listing-scoped moderation notes. Mirrors convex/notes.ts — the author is
  # always the authenticated moderator.
  class NotesController < BaseController
    # GET /api/listings/:listing_id/notes
    def index
      listing = Listing.find(params[:listing_id])
      notes = listing.moderation_notes.order(created_at_ms: :desc, id: :desc)
      render json: ConvexDoc.render_many(notes)
    end

    # POST /api/listings/:listing_id/notes
    def create
      listing = Listing.find(params[:listing_id])
      note = listing.moderation_notes.create!(
        je_id: listing.je_id,
        author_name: current_moderator.name.presence || current_moderator.email,
        author_role: current_moderator.role,
        content: params.require(:content).to_s,
        created_at_ms: now_ms
      )
      render json: ConvexDoc.render(note)
    end

    # DELETE /api/notes/:id
    def destroy
      ModerationNote.find(params[:id]).destroy!
      render json: { success: true }
    end
  end
end
