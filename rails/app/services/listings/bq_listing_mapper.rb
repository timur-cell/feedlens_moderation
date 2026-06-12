module Listings
  # Maps one BigQuery sync row (see Listings::BqSync::SQL) to Listing
  # attributes. Pure function; nil values are compacted away so sparse BQ
  # rows never write nil over anything (JeClient/upsert convention).
  class BqListingMapper
    CATEGORY_MAP = {
      "Listing::RealEstateListing" => "real_estate",
      "Listing::CarListing" => "cars"
    }.freeze

    # JeClient parity: descriptions are truncated for storage while
    # description_length keeps the full length.
    MAX_DESCRIPTION_LENGTH = 5000

    def self.call(row, batch_id:, imported_at:)
      je_id = row[:listing_id].to_s
      description = row[:description]
      price = row[:price_cents] && row[:price_cents] / 100.0

      {
        je_id: je_id,
        title: row[:headline].presence || "Listing #{je_id}",
        price: price,
        price_usd: row[:price_cents_usd] && row[:price_cents_usd] / 100.0,
        currency: row[:currency],
        price_on_request: row[:price_on_request],
        category: CATEGORY_MAP.fetch(row[:type], "other"),
        real_estate_type: row[:real_estate_type],
        country: row[:country_code],
        state: row[:country_subdivision],
        city: row[:city],
        bedrooms: row[:bedrooms],
        bathrooms: row[:bathrooms],
        living_area: row[:living_area],
        land_area: row[:land_area],
        image_count: row[:image_count],
        image_urls: Array(row[:image_urls]).presence,
        avg_image_width: row[:avg_image_width]&.round,
        avg_image_height: row[:avg_image_height]&.round,
        # listing_quality_score.score is 0-1; the seeded lqi rules expect 0-100.
        lqi: row[:lqi_score] && (row[:lqi_score] * 100.0).round(2),
        description: description && description[0, MAX_DESCRIPTION_LENGTH],
        description_length: description&.length,
        office: row[:office_name],
        office_subscription: row[:office_subscription],
        # groupFilter rules match officeGroupName against group IDs (e.g.
        # "3167"), so this carries the id, not the display name.
        office_group_name: row[:office_group_id]&.to_s,
        feed_source: row[:source],
        listing_url: "https://www.jamesedition.com/listing/#{je_id}",
        price_per_sqm: FetchAndModerate.compute_price_per_sqm(price, row[:living_area]),
        rental: row[:rental],
        pre_owned: row[:pre_owned],
        outdated: row[:outdated],
        year: row[:year],
        raw_data: {
          "source" => "bq_sync",
          "listingCreatedAt" => row[:listing_created_at]&.iso8601
        }.compact,
        batch_id: batch_id,
        moderation_status: "pending",
        imported_at: imported_at
      }.compact
    end
  end
end
