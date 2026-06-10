require "rails_helper"

RSpec.describe ListingImageAnalysis, type: :model do
  it "has a valid factory" do
    expect(build(:listing_image_analysis)).to be_valid
  end

  it "requires je_id, title and image counts" do
    expect(build(:listing_image_analysis, je_id: nil)).not_to be_valid
    expect(build(:listing_image_analysis, title: nil)).not_to be_valid
    expect(build(:listing_image_analysis, total_images: nil)).not_to be_valid
    expect(build(:listing_image_analysis, analyzed_images: nil)).not_to be_valid
  end

  it "requires analyzed_at" do
    expect(build(:listing_image_analysis, analyzed_at: nil)).not_to be_valid
  end
end
