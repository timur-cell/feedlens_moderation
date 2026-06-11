require "rails_helper"

RSpec.describe "Api image recognition", type: :request do
  include_examples "requires moderator", :get, -> { "/api/image-recognition/results" }
  include_examples "requires moderator", :delete, -> { "/api/image-recognition/results/#{create(:image_recognition_result).id}" }
  include_examples "requires moderator", :delete, -> { "/api/image-recognition/results" }
  include_examples "requires moderator", :get, -> { "/api/image-recognition/analyses" }
  include_examples "requires moderator", :delete, -> { "/api/image-recognition/analyses/#{create(:listing_image_analysis).id}" }
  include_examples "requires moderator", :delete, -> { "/api/image-recognition/analyses" }
  include_examples "requires moderator", :post, -> { "/api/image-recognition/analyze" }
  include_examples "requires moderator", :post, -> { "/api/image-recognition/analyze-listing-url" }

  describe "GET /api/image-recognition/results" do
    it "lists saved results newest first" do
      old = create(:image_recognition_result)
      new = create(:image_recognition_result)
      sign_in_as(create(:moderator, role: "viewer"))

      get "/api/image-recognition/results"
      expect(json.map { |r| r["_id"] }).to eq([ new.id.to_s, old.id.to_s ])
      expect(json.first["analyzedAt"]).to eq(new.analyzed_at)
    end
  end

  describe "DELETE /api/image-recognition/results/:id" do
    it "deletes one result" do
      result = create(:image_recognition_result)
      sign_in_as(create(:moderator))
      expect { delete "/api/image-recognition/results/#{result.id}" }
        .to change(ImageRecognitionResult, :count).by(-1)
    end
  end

  describe "DELETE /api/image-recognition/results" do
    it "clears all results" do
      create_list(:image_recognition_result, 2)
      sign_in_as(create(:moderator))

      delete "/api/image-recognition/results"
      expect(json["deleted"]).to eq(2)
      expect(ImageRecognitionResult.count).to eq(0)
    end
  end

  describe "GET /api/image-recognition/analyses" do
    it "lists listing analyses newest first" do
      create(:listing_image_analysis)
      newest = create(:listing_image_analysis)
      sign_in_as(create(:moderator))

      get "/api/image-recognition/analyses"
      expect(json.first["_id"]).to eq(newest.id.to_s)
      expect(json.first["totalImages"]).to eq(10)
    end
  end

  describe "DELETE /api/image-recognition/analyses/:id and all" do
    it "deletes one and all analyses" do
      analysis = create(:listing_image_analysis)
      create(:listing_image_analysis)
      sign_in_as(create(:moderator))

      delete "/api/image-recognition/analyses/#{analysis.id}"
      expect(ListingImageAnalysis.count).to eq(1)

      delete "/api/image-recognition/analyses"
      expect(json["deleted"]).to eq(1)
      expect(ListingImageAnalysis.count).to eq(0)
    end
  end

  describe "POST /api/image-recognition/analyze" do
    it "delegates to the vision analyzer" do
      sign_in_as(create(:moderator))
      payload = { "property_condition" => 4.5, "conclusion" => 5.0, "model" => "claude" }
      expect(Ai::VisionAnalyzer).to receive(:analyze)
        .with(image_urls: [ "https://img.jamesedition.com/a.jpg" ], title: "Villa", je_id: "12345678")
        .and_return(payload)

      post "/api/image-recognition/analyze",
           params: { imageUrls: [ "https://img.jamesedition.com/a.jpg" ], title: "Villa", jeId: "12345678" },
           as: :json
      expect(json["property_condition"]).to eq(4.5)
    end
  end

  describe "POST /api/image-recognition/analyze-listing-url" do
    it "delegates to the vision analyzer URL flow" do
      sign_in_as(create(:moderator))
      payload = { "analysisId" => 1, "analyzedImages" => 3, "summary" => {} }
      expect(Ai::VisionAnalyzer).to receive(:analyze_listing_url)
        .with(url: "https://www.jamesedition.com/real_estate/x/-12345678")
        .and_return(payload)

      post "/api/image-recognition/analyze-listing-url",
           params: { url: "https://www.jamesedition.com/real_estate/x/-12345678" }, as: :json
      expect(json["analyzedImages"]).to eq(3)
    end
  end
end
