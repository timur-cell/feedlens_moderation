module Api
  # Image recognition results/analyses (convex/imageRecognition.ts) and the
  # vision analysis + Implio submission actions, delegated to service shells.
  class ImageRecognitionController < BaseController
    # GET /api/image-recognition/results
    def results
      records = ImageRecognitionResult.order(id: :desc).limit(200)
      render json: ConvexDoc.render_many(records)
    end

    # DELETE /api/image-recognition/results/:id
    def destroy_result
      ImageRecognitionResult.find(params[:id]).destroy!
      render json: { success: true }
    end

    # DELETE /api/image-recognition/results
    def destroy_all_results
      deleted = ImageRecognitionResult.delete_all
      render json: { deleted: deleted }
    end

    # GET /api/image-recognition/analyses
    def analyses
      records = ListingImageAnalysis.order(id: :desc).limit(50)
      render json: ConvexDoc.render_many(records)
    end

    # DELETE /api/image-recognition/analyses/:id
    def destroy_analysis
      ListingImageAnalysis.find(params[:id]).destroy!
      render json: { success: true }
    end

    # DELETE /api/image-recognition/analyses
    def destroy_all_analyses
      deleted = ListingImageAnalysis.delete_all
      render json: { deleted: deleted }
    end

    # POST /api/image-recognition/analyze
    def analyze
      result = Ai::VisionAnalyzer.analyze(
        image_urls: Array(params[:imageUrls]).map(&:to_s),
        title: params[:title].to_s,
        je_id: params[:jeId].presence
      )
      render json: result
    end

    # POST /api/image-recognition/analyze-listing-url
    def analyze_listing_url
      render json: Ai::VisionAnalyzer.analyze_listing_url(url: params[:url].to_s)
    end

    # POST /api/image-recognition/submit-implio
    def submit_implio
      result = Integrations::ImplioClient.submit_decision(
        je_id: params[:jeId].to_s,
        outcome: params[:outcome].to_s,
        message: params[:message].presence
      )
      render json: result
    end
  end
end
