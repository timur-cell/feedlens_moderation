require "rails_helper"

RSpec.describe VisionAnalysisJob do
  let(:vision_result) do
    Ai::VisionAnalyzer::EMPTY_RESULT.merge(
      "property_condition" => 4.0, "conclusion" => 4.5, "watermark_share" => 1,
      "watermark_text" => "AGENCY", "image_quality" => "high", "image_type" => "Real photo",
      "model" => "claude-haiku-4-5-20251001"
    )
  end

  it "analyzes the listing images and patches the chat_gpt fields" do
    listing = create(:listing, image_urls: [ "https://img.example/1.jpg", "https://img.example/2.jpg" ])

    expect(Ai::VisionAnalyzer).to receive(:analyze)
      .with(image_urls: listing.image_urls, title: listing.title, je_id: listing.je_id)
      .and_return(vision_result)

    described_class.perform_now(listing.id)

    reloaded = listing.reload
    expect(reloaded.chat_gpt_property_condition).to eq(4.0)
    expect(reloaded.chat_gpt_conclusion).to eq("4.5")
    expect(reloaded.chat_gpt_watermark_share).to eq(1)
    expect(reloaded.chat_gpt_watermark_text).to eq("AGENCY")
  end

  it "respects max_images_per_vision_scan" do
    Setting.create!(key: Setting::KEY, max_images_per_vision_scan: 1)
    listing = create(:listing, image_urls: [ "https://img.example/1.jpg", "https://img.example/2.jpg" ])

    expect(Ai::VisionAnalyzer).to receive(:analyze)
      .with(image_urls: [ "https://img.example/1.jpg" ], title: listing.title, je_id: listing.je_id)
      .and_return(vision_result)

    described_class.perform_now(listing.id)
  end

  it "does not patch the listing on vision errors" do
    listing = create(:listing, image_urls: [ "https://img.example/1.jpg" ])
    allow(Ai::VisionAnalyzer).to receive(:analyze)
      .and_return(Ai::VisionAnalyzer::EMPTY_RESULT.merge("error" => "No images could be loaded"))

    described_class.perform_now(listing.id)

    expect(listing.reload.chat_gpt_property_condition).to be_nil
  end

  it "skips listings without images" do
    listing = create(:listing, image_urls: [])
    expect(Ai::VisionAnalyzer).not_to receive(:analyze)

    described_class.perform_now(listing.id)
  end
end
