module Api
  # AI parameter scans. Mirrors convex/aiParamScan.ts queries; the actual
  # scan runs through the Ai::ParamScan service.
  class ParamScansController < BaseController
    # GET /api/param-scans/recent?limit=
    def recent
      scans = AiParameterScan.order(scanned_at: :desc, id: :desc).limit(limit_param(100))
      render json: ConvexDoc.render_many(scans)
    end

    # GET /api/param-scans/stats
    def stats
      verdicts = AiParameterScan.group(:verdict).count
      render json: {
        total: verdicts.values.sum,
        ok: verdicts["ok"] || 0,
        review: verdicts["review"] || 0,
        reject: verdicts["reject"] || 0,
        totalFlags: AiParameterScan.sum(:flag_count)
      }
    end

    # GET /api/param-scans/by-je-id/:je_id
    def by_je_id
      scan = AiParameterScan.where(je_id: params[:je_id].to_s).order(:id).first
      render json: ConvexDoc.render(scan)
    end

    # POST /api/listings/:id/param-scan
    def create
      listing = Listing.find(params[:id])
      render json: Ai::ParamScan.call(listing)
    end
  end
end
