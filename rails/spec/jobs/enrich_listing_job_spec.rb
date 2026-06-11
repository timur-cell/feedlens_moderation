require "rails_helper"

RSpec.describe EnrichListingJob do
  it "delegates to the fill-missing-only enrichment" do
    expect(Listings::FetchAndModerate).to receive(:enrich_listing)
      .with("16680095")
      .and_return(success: true, dataSource: "mobile_api")

    expect(described_class.perform_now("16680095")).to eq(success: true, dataSource: "mobile_api")
  end

  it "logs (but does not raise) on enrichment failure" do
    allow(Listings::FetchAndModerate).to receive(:enrich_listing)
      .and_return(success: false, error: "All data sources failed")

    expect { described_class.perform_now("16680095") }.not_to raise_error
  end

  it "fills missing fields end-to-end" do
    listing = create(:listing, je_id: "16680095", title: "Listing 16680095", country: nil)
    stub_request(:get, "https://www.jamesedition.com/api/mobile/v1/listings/16680095")
      .to_return(status: 200, body: {
        listing: { headline: "Real Title", price: "$500,000", humanized_location: "Villa in Nice, France",
                   images: [], description: "x", property_type: "Villa" }
      }.to_json)

    described_class.perform_now("16680095")

    expect(listing.reload.title).to eq("Real Title")
    expect(listing.country).to eq("France")
  end
end
