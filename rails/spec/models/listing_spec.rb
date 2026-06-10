require "rails_helper"

RSpec.describe Listing, type: :model do
  it "has a valid factory" do
    expect(build(:listing)).to be_valid
  end

  it "requires je_id" do
    expect(build(:listing, je_id: nil)).not_to be_valid
  end

  it "requires a unique je_id" do
    existing = create(:listing)
    expect(build(:listing, je_id: existing.je_id)).not_to be_valid
  end

  it "requires title" do
    expect(build(:listing, title: nil)).not_to be_valid
  end

  it "requires imported_at" do
    expect(build(:listing, imported_at: nil)).not_to be_valid
  end

  it "requires a known moderation_status" do
    expect(build(:listing, moderation_status: nil)).not_to be_valid
    expect(build(:listing, moderation_status: "bogus")).not_to be_valid

    %w[pending approved rejected notice manual].each do |status|
      expect(build(:listing, moderation_status: status)).to be_valid
    end
  end

  it "destroys dependent records" do
    listing = create(:listing)
    create(:moderation_result, listing: listing)
    create(:moderation_note, listing: listing)
    create(:ai_parameter_scan, listing: listing)
    create(:remediation_result, listing: listing)
    create(:image_recognition_result, listing: listing)

    expect { listing.destroy! }
      .to change(ModerationResult, :count).by(-1)
      .and change(ModerationNote, :count).by(-1)
      .and change(AiParameterScan, :count).by(-1)
      .and change(RemediationResult, :count).by(-1)
      .and change(ImageRecognitionResult, :count).by(-1)
  end
end
