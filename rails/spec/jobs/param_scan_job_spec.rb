require "rails_helper"

RSpec.describe ParamScanJob do
  it "runs the AI parameter scan for the listing" do
    listing = create(:listing)
    expect(Ai::ParamScan).to receive(:call).with(listing, force_rescan: false)

    described_class.perform_now(listing.id)
  end

  it "passes force_rescan through" do
    listing = create(:listing)
    expect(Ai::ParamScan).to receive(:call).with(listing, force_rescan: true)

    described_class.perform_now(listing.id, true)
  end

  it "ignores missing listings" do
    expect(Ai::ParamScan).not_to receive(:call)
    expect { described_class.perform_now(-1) }.not_to raise_error
  end
end
