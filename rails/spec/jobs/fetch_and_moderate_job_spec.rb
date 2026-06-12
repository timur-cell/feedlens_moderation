require "rails_helper"

RSpec.describe FetchAndModerateJob do
  it "delegates a single input to FetchAndModerate.process_one" do
    moderator = create(:moderator)

    expect(Listings::FetchAndModerate).to receive(:process_one)
      .with("16680095", moderator: have_attributes(id: moderator.id))
      .and_return({ status: "success" })

    described_class.perform_now("16680095", moderator.id)
  end

  it "runs without a moderator" do
    expect(Listings::FetchAndModerate).to receive(:process_one)
      .with("16680095", moderator: nil)
      .and_return({ status: "success" })

    described_class.perform_now("16680095", nil)
  end
end
