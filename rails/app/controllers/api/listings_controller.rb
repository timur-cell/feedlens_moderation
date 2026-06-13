module Api
  # Mirrors convex/listings.ts queries plus the moderateListing entry point.
  class ListingsController < BaseController
    # GET /api/listings/pending — manual queue, newest first, limit 100.
    # Each listing embeds its current moderation result as `latestResult` so the
    # queue can always act on it. (The Queue used to join pending listings to the
    # capped /moderation-results/recent feed; manual items older than that window
    # had no joinable result and could not be approved/rejected — see QueuePage
    # resultFor.) Mirrors the embed pattern used by #recent / #by_rule.
    def pending
      listings = Listing.where(moderation_status: "manual")
                        .order(created_at: :desc, id: :desc)
                        .limit(100)
      latest_by_listing = ModerationResult.where(listing_id: listings.map(&:id))
                                          .order(processed_at: :desc, id: :desc)
                                          .group_by(&:listing_id)
      render json: listings.map { |listing|
        result = latest_by_listing[listing.id]&.first
        ConvexDoc.render(listing).merge("latestResult" => ConvexDoc.render(result))
      }
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

    # POST /api/listings/:id/unlock — releases a permanent human decision so
    # the listing can be re-moderated again.
    def unlock
      listing = Listing.find(params[:id])
      listing.update!(moderation_locked: false, moderation_locked_at: nil, moderation_locked_by: nil)

      log_activity(
        action: "unlock_listing",
        target_type: "listing",
        target_id: listing.id.to_s,
        details: "Unlocked listing #{listing.je_id} for re-moderation"
      )
      render json: { success: true, listingId: listing.id }
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
