# Background AI vision analysis for a listing's images. Runs the Claude
# vision pipeline and patches the listing's chat_gpt_* scores on success
# (mirrors the analyzeForModeration + patchVisionScores flow).
class VisionAnalysisJob < ApplicationJob
  queue_as :default

  def perform(listing_id)
    listing = Listing.find_by(id: listing_id)
    return if listing.nil? || listing.image_urls.blank?

    max_images = Setting.current["max_images_per_vision_scan"]
    max_images = 10 unless max_images.is_a?(Numeric) && max_images.positive?

    vision = Ai::VisionAnalyzer.analyze(
      image_urls: listing.image_urls.first(max_images.to_i),
      title: listing.title || "",
      je_id: listing.je_id
    )
    return vision unless vision && !vision["error"] && !vision["property_condition"].nil?

    attrs = {
      chat_gpt_property_condition: vision["property_condition"],
      chat_gpt_conclusion: vision["conclusion"].nil? ? nil : Moderation::JsCompat.js_string(vision["conclusion"]),
      chat_gpt_watermark_share: vision["watermark_share"],
      chat_gpt_watermark_text: vision["watermark_text"],
      chat_gpt_image_quality: vision["image_quality"],
      chat_gpt_image_type: vision["image_type"]
    }.compact
    listing.update!(attrs) if attrs.any?
    vision
  end
end
