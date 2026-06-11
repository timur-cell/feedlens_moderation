require "rails_helper"

RSpec.describe ModerateListingJob do
  it "runs the moderation runner for the listing" do
    listing = create(:listing)
    moderator = create(:moderator)

    expect(Moderation::Runner).to receive(:call)
      .with(listing, moderator: have_attributes(id: moderator.id))
      .and_return({ outcome: "approved" })

    described_class.perform_now(listing.id, moderator.id)
  end

  it "no-ops when the listing no longer exists" do
    expect(Moderation::Runner).not_to receive(:call)
    expect { described_class.perform_now(-1) }.not_to raise_error
  end

  it "runs without a moderator" do
    listing = create(:listing)
    expect(Moderation::Runner).to receive(:call).with(listing, moderator: nil).and_return({})
    described_class.perform_now(listing.id, nil)
  end
end
