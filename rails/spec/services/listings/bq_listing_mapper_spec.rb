require "rails_helper"

RSpec.describe Listings::BqListingMapper do
  def full_row(overrides = {})
    {
      listing_id: 16_680_095,
      listing_created_at: Time.utc(2026, 6, 12, 8),
      headline: "Cheap Villa",
      price_cents: 100_000_000,
      price_cents_usd: 110_000_000,
      currency: "EUR",
      price_on_request: false,
      type: "Listing::RealEstateListing",
      country_code: "ES",
      country_subdivision: "Andalusia",
      city: "Marbella",
      rental: false,
      pre_owned: nil,
      year: 2020,
      outdated: false,
      office_id: 1,
      source: "feed",
      description: "A villa",
      bedrooms: 3,
      bathrooms: 2,
      living_area: 200.0,
      land_area: nil,
      real_estate_type: "Villa",
      office_name: "Office",
      office_subscription: "freemium",
      office_group_id: 3167,
      lqi_score: 0.42,
      image_count: 2,
      avg_image_width: 1200.0,
      avg_image_height: 800.0,
      image_urls: [ "https://img.example/1.jpg", "https://img.example/2.jpg" ]
    }.merge(overrides)
  end

  def map(row)
    described_class.call(row, batch_id: "bq-sync-2026-06-12", imported_at: 1_780_000_000_000)
  end

  it "maps a full BQ row to Listing attributes" do
    attrs = map(full_row)

    expect(attrs[:je_id]).to eq("16680095")
    expect(attrs[:title]).to eq("Cheap Villa")
    expect(attrs[:price]).to eq(1_000_000.0)
    expect(attrs[:price_usd]).to eq(1_100_000.0)
    expect(attrs[:category]).to eq("real_estate")
    expect(attrs[:country]).to eq("ES")
    expect(attrs[:state]).to eq("Andalusia")
    expect(attrs[:lqi]).to eq(42.0)
    expect(attrs[:office_group_name]).to eq("3167")
    expect(attrs[:office_subscription]).to eq("freemium")
    expect(attrs[:feed_source]).to eq("feed")
    expect(attrs[:listing_url]).to eq("https://www.jamesedition.com/listing/16680095")
    expect(attrs[:price_per_sqm]).to eq(5_000)
    expect(attrs[:description_length]).to eq(7)
    expect(attrs[:image_urls]).to eq([ "https://img.example/1.jpg", "https://img.example/2.jpg" ])
    expect(attrs[:raw_data]).to eq("source" => "bq_sync", "listingCreatedAt" => "2026-06-12T08:00:00Z")
    expect(attrs[:batch_id]).to eq("bq-sync-2026-06-12")
    expect(attrs[:moderation_status]).to eq("pending")
    expect(attrs[:imported_at]).to eq(1_780_000_000_000)
  end

  it "maps car listings to the cars category and unknown types to other" do
    expect(map(full_row(type: "Listing::CarListing"))[:category]).to eq("cars")
    expect(map(full_row(type: "Listing::YachtListing"))[:category]).to eq("other")
  end

  it "compacts nil values away and falls back to a placeholder title" do
    attrs = map(
      listing_id: 42_424_242, listing_created_at: nil, headline: nil, price_cents: nil,
      type: "Listing::CarListing", description: nil, image_urls: nil
    )

    expect(attrs[:title]).to eq("Listing 42424242")
    expect(attrs).not_to have_key(:price)
    expect(attrs).not_to have_key(:description)
    expect(attrs).not_to have_key(:image_urls)
    expect(attrs).not_to have_key(:lqi)
    expect(attrs[:raw_data]).to eq("source" => "bq_sync")
    expect(attrs[:moderation_status]).to eq("pending")
    expect(attrs[:imported_at]).to be_present
    expect(attrs[:batch_id]).to be_present
  end

  it "keeps false booleans (only nil is compacted)" do
    attrs = map(full_row)

    expect(attrs[:price_on_request]).to be(false)
    expect(attrs[:rental]).to be(false)
    expect(attrs).not_to have_key(:pre_owned)
  end

  it "truncates long descriptions but keeps the full description_length" do
    long = "x" * 6_000
    attrs = map(full_row(description: long))

    expect(attrs[:description].length).to eq(5_000)
    expect(attrs[:description_length]).to eq(6_000)
  end
end
