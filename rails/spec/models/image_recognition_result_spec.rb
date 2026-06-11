require "rails_helper"

RSpec.describe ImageRecognitionResult, type: :model do
  it "has a valid factory" do
    expect(build(:image_recognition_result)).to be_valid
  end

  it "allows a missing listing" do
    expect(build(:image_recognition_result, listing: nil)).to be_valid
  end

  it "can belong to a listing" do
    listing = create(:listing)
    result = create(:image_recognition_result, listing: listing)
    expect(result.listing).to eq(listing)
  end

  it "requires je_id, title, llm and analyzed_at" do
    expect(build(:image_recognition_result, je_id: nil)).not_to be_valid
    expect(build(:image_recognition_result, title: nil)).not_to be_valid
    expect(build(:image_recognition_result, llm: nil)).not_to be_valid
    expect(build(:image_recognition_result, analyzed_at: nil)).not_to be_valid
  end
end
