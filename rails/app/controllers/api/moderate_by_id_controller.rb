module Api
  # POST /api/moderate-by-id — fetch listings from the JE API and moderate
  # them. Mirrors convex/fetchListing.ts fetchAndModerate.
  class ModerateByIdController < BaseController
    def create
      inputs = Array(params[:inputs]).map(&:to_s).reject(&:blank?)
      if inputs.empty?
        return render json: { error: "inputs array required" }, status: :unprocessable_entity
      end

      if ActiveModel::Type::Boolean.new.cast(params[:async])
        result = Listings::FetchAndModerate.enqueue(inputs: inputs, moderator: current_moderator)
        render json: result, status: :accepted
      else
        result = Listings::FetchAndModerate.call(inputs: inputs, moderator: current_moderator)
        render json: result
      end
    end
  end
end
