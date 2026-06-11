module Api
  # POST /api/moderate-by-id — fetch listings from the JE API and moderate
  # them. Mirrors convex/fetchListing.ts fetchAndModerate.
  class ModerateByIdController < BaseController
    def create
      inputs = Array(params[:inputs]).map(&:to_s)
      result = Listings::FetchAndModerate.call(inputs: inputs, moderator: current_moderator)
      render json: result
    end
  end
end
