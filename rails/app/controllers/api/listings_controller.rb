module Api
  # Mirrors convex/listings.ts queries plus the moderateListing entry point.
  class ListingsController < BaseController
    # GET /api/listings/pending — manual queue, newest first, limit 100
    def pending
      listings = Listing.where(moderation_status: "manual")
                        .order(created_at: :desc, id: :desc)
                        .limit(100)
      render json: ConvexDoc.render_many(listings)
    end

    # GET /api/listings/recent?limit=
    def recent
      listings = Listing.order(imported_at: :desc, id: :desc).limit(limit_param(50))
      render json: ConvexDoc.render_many(listings)
    end

    # GET /api/listings?status=&limit=
    def index
      listings = Listing.where(moderation_status: params[:status].to_s)
                        .order(created_at: :desc, id: :desc)
                        .limit(limit_param(50))
      render json: ConvexDoc.render_many(listings)
    end

    # GET /api/listings/stats
    def stats
      counts = Listing.group(:moderation_status).count
      render json: {
        total: counts.values.sum,
        approved: counts["approved"] || 0,
        rejected: counts["rejected"] || 0,
        noticed: counts["notice"] || 0,
        manual: counts["manual"] || 0,
        pending: counts["pending"] || 0
      }
    end

    # GET /api/listings/:id
    def show
      render json: ConvexDoc.render(Listing.find(params[:id]))
    end

    # GET /api/listings/by-je-id/:je_id
    def by_je_id
      render json: ConvexDoc.render(Listing.find_by(je_id: params[:je_id].to_s))
    end

    # POST /api/listings/:id/moderate — runs the rule engine
    def moderate
      listing = Listing.find(params[:id])

      if ActiveModel::Type::Boolean.new.cast(params[:async])
        ModerateListingJob.perform_later(listing.id, current_moderator&.id)
        render json: { status: "queued", listingId: listing.id }, status: :accepted
      else
        result = Moderation::Runner.call(listing, moderator: current_moderator)
        render json: result
      end
    end
  end
end
