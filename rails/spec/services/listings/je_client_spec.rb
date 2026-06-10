require "rails_helper"

RSpec.describe Listings::JeClient do
  describe ".parse_mobile_api_price" do
    # Table test ported from parseMobileApiPrice in convex/fetchListing.ts.
    [
      # [input, expected price, expected currency]
      [ "$1,200,000", 1_200_000.0, "USD" ],
      [ "€950,000", 950_000.0, "EUR" ],
      [ "£2,500,000", 2_500_000.0, "GBP" ],
      [ "1.200.000 €", 1_200_000.0, "EUR" ],          # European thousands only
      [ "€1.200.000,50", 1_200_000.5, "EUR" ],        # European decimals
      [ "$1,200,000.50", 1_200_000.5, "USD" ],        # US decimals
      [ "$ 1 200 000", 1_200_000.0, "USD" ],          # space separators
      [ "950000€", 950_000.0, "EUR" ],                # symbol after number
      [ "$950", 950.0, "USD" ]
    ].each do |input, price, currency|
      it "parses #{input.inspect} as #{price} #{currency}" do
        expect(described_class.parse_mobile_api_price(input)).to eq(price: price, currency: currency)
      end
    end

    it "returns nil for Price On Request" do
      expect(described_class.parse_mobile_api_price("Price On Request")).to be_nil
    end

    it "returns nil for blank and symbol-free strings" do
      expect(described_class.parse_mobile_api_price("")).to be_nil
      expect(described_class.parse_mobile_api_price(nil)).to be_nil
      expect(described_class.parse_mobile_api_price("1200000")).to be_nil
    end

    it "handles binary-encoded input containing the euro sign" do
      expect(described_class.parse_mobile_api_price("€950,000".b)).to eq(price: 950_000.0, currency: "EUR")
    end
  end

  describe ".parse_numeric_value" do
    it "parses numeric prefixes like JS parseInt" do
      expect(described_class.parse_numeric_value("7 Baths")).to eq(7)
      expect(described_class.parse_numeric_value("2,159")).to eq(2159)
      expect(described_class.parse_numeric_value("23240 sqft")).to eq(23_240)
      expect(described_class.parse_numeric_value(nil)).to be_nil
      expect(described_class.parse_numeric_value("no digits")).to be_nil
    end
  end

  describe ".parse_living_area" do
    it "converts sqft to sqm and keeps sqm values" do
      expect(described_class.parse_living_area("23240 sqft")).to eq((23_240 * 0.0929).round)
      expect(described_class.parse_living_area("2159 Sq. Mt.")).to eq(2159)
      expect(described_class.parse_living_area(nil)).to be_nil
    end
  end

  describe ".parse_location" do
    it "strips property-type prefixes and splits city/state/country" do
      expect(described_class.parse_location("Villa in Marbella, Andalusia, Spain", "")).to eq(
        country: "Spain", state: "Andalusia", city: "Marbella"
      )
      expect(described_class.parse_location("Apulia, Italy", "")).to eq(
        country: "Italy", state: nil, city: "Apulia"
      )
      expect(described_class.parse_location("Spain", "")).to eq(country: "Spain")
      expect(described_class.parse_location("", "")).to eq({})
    end
  end

  describe ".resolve_country_code" do
    it "resolves ISO codes, names and regions" do
      expect(described_class.resolve_country_code("ES")).to eq("ES")
      expect(described_class.resolve_country_code("es")).to eq("ES")
      expect(described_class.resolve_country_code("Spain")).to eq("ES")
      expect(described_class.resolve_country_code("Algarve")).to eq("PT")
      expect(described_class.resolve_country_code("Atlantis")).to eq("ATLANTIS")
      expect(described_class.resolve_country_code("")).to eq("")
    end
  end

  describe ".fetch_listing" do
    let(:je_id) { "16680095" }
    let(:mobile_url) { "https://www.jamesedition.com/api/mobile/v1/listings/#{je_id}" }
    let(:search_url) { "https://www.jamesedition.com/api/mobile/v1/listings?listing_id=#{je_id}" }
    let(:html_url) { "https://www.jamesedition.com/listing/#{je_id}" }

    let(:mobile_body) do
      {
        listing: {
          listing_id: je_id.to_i,
          headline: "Stunning Villa",
          price: "€950,000",
          price_on_request: false,
          bedrooms: 4,
          bathrooms: "3 Baths",
          living_area: "2961 sqft",
          humanized_location: "Villa in Marbella, Spain",
          location_name: "Marbella, Spain",
          address: "Calle Test 1",
          images: [ "https://img.jamesedition.com/listing_images/a.jpg" ],
          floor_plan_images: [ "https://img.jamesedition.com/listing_images/plan.jpg" ],
          description: "A lovely villa " * 20,
          property_type: "Villa",
          office_name: "Lux Estates",
          url: "https://www.jamesedition.com/real_estate/marbella-spain/stunning-villa-#{je_id}",
          lot_size: { value: 1200.4, unit: "sqm", formatted: "1,200 sqm" },
          latitude: 36.5, longitude: -4.9, views: 10, saves: 2, is_active: true
        }
      }.to_json
    end

    it "uses the mobile API as the primary source" do
      stub_request(:get, mobile_url)
        .with(headers: { "Accept" => "application/json", "User-Agent" => "FeedLens/1.0" })
        .to_return(status: 200, body: mobile_body)

      result = described_class.fetch_listing(je_id)

      expect(result[:source]).to eq("mobile_api")
      data = result[:data]
      expect(data[:title]).to eq("Stunning Villa")
      expect(data[:price]).to eq(950_000.0)
      expect(data[:currency]).to eq("EUR")
      expect(data[:country]).to eq("Spain")
      expect(data[:city]).to eq("Marbella")
      expect(data[:real_estate_type]).to eq("Villa")
      expect(data[:bedrooms]).to eq(4)
      expect(data[:bathrooms]).to eq(3)
      expect(data[:living_area]).to eq((2961 * 0.0929).round)
      expect(data[:land_area]).to eq(1200)
      expect(data[:image_urls]).to eq([
        "https://img.jamesedition.com/listing_images/a.jpg",
        "https://img.jamesedition.com/listing_images/plan.jpg"
      ])
      expect(data[:image_count]).to eq(2)
      expect(data[:office]).to eq("Lux Estates")
      expect(data[:raw_data]["source"]).to eq("mobile_api")
    end

    it "falls back to the search API when the mobile API errors" do
      stub_request(:get, mobile_url).to_return(status: 500)
      stub_request(:get, search_url).to_return(status: 200, body: {
        listings: [ {
          listing_id: je_id.to_i,
          headline: "Search Villa",
          price: "$1,200,000",
          bedrooms: "3 Beds",
          bathrooms: "2 Baths",
          living_area: "200 Sq. Mt.",
          humanized_location: "House in Ulaanbaatar, Mongolia",
          images: [ "https://img.jamesedition.com/listing_images/s.jpg" ],
          office_name: "Search Office",
          available: true
        } ]
      }.to_json)

      result = described_class.fetch_listing(je_id)

      expect(result[:source]).to eq("search_api")
      data = result[:data]
      expect(data[:title]).to eq("Search Villa")
      expect(data[:price]).to eq(1_200_000.0)
      expect(data[:country]).to eq("Mongolia")
      expect(data[:city]).to eq("Ulaanbaatar")
      expect(data[:real_estate_type]).to eq("House")
      expect(data[:bedrooms]).to eq(3)
    end

    it "treats P.O.R. search prices as price on request" do
      stub_request(:get, mobile_url).to_return(status: 500)
      stub_request(:get, search_url).to_return(status: 200, body: {
        listings: [ { listing_id: je_id.to_i, headline: "POR Villa", price: "P.O.R.",
                      humanized_location: "Villa in Marbella, Spain", images: [] } ]
      }.to_json)

      data = described_class.fetch_listing(je_id)[:data]
      expect(data[:price]).to be_nil
      expect(data[:price_on_request]).to be(true)
    end

    it "falls back to HTML scraping when both APIs fail" do
      stub_request(:get, mobile_url).to_return(status: 500)
      stub_request(:get, search_url).to_return(status: 500)
      html = <<~HTML
        <html><head>
        <title>HTML Villa | JamesEdition</title>
        <meta property="og:title" content="HTML Villa | JamesEdition" />
        <script type="application/ld+json">
        {"@type":"Product","name":"HTML Villa","description":"Scraped description",
         "offers":{"price":"750000","priceCurrency":"EUR"},
         "image":["https://img.jamesedition.com/listing_images/h.jpg"]}
        </script>
        </head><body>4 Beds 3 Baths 250 Sq. M</body></html>
      HTML
      stub_request(:get, html_url).to_return(status: 200, body: html)

      result = described_class.fetch_listing(je_id)

      expect(result[:source]).to eq("html_scrape")
      data = result[:data]
      expect(data[:title]).to eq("HTML Villa")
      expect(data[:price]).to eq(750_000.0)
      expect(data[:currency]).to eq("EUR")
      expect(data[:bedrooms]).to eq(4)
      expect(data[:bathrooms]).to eq(3)
      expect(data[:living_area]).to eq(250)
      expect(data[:description]).to eq("Scraped description")
    end

    it "returns nil when every source fails" do
      stub_request(:get, mobile_url).to_return(status: 500)
      stub_request(:get, search_url).to_return(status: 500)
      stub_request(:get, html_url).to_return(status: 403, body: "Just a moment")

      expect(described_class.fetch_listing(je_id)).to be_nil
    end

    it "returns nil for Cloudflare-challenged HTML" do
      stub_request(:get, mobile_url).to_return(status: 500)
      stub_request(:get, search_url).to_return(status: 500)
      stub_request(:get, html_url).to_return(status: 200, body: "<html>Just a moment...</html>")

      expect(described_class.fetch_listing(je_id)).to be_nil
    end
  end

  describe ".fetch_listing_info" do
    it "builds the camelCase ListingInfo from the mobile API" do
      je_id = "16680095"
      stub_request(:get, "https://www.jamesedition.com/api/mobile/v1/listings/#{je_id}")
        .to_return(status: 200, body: {
          listing: {
            headline: "Info Villa",
            price: "$2,000,000",
            humanized_location: "Villa in Dubai, United Arab Emirates",
            location_name: "Dubai, United Arab Emirates",
            bedrooms: 6,
            bathrooms: "5 Baths",
            living_area: "500 Sq. Mt.",
            images: [ "https://img.example/1.jpg", "https://img.example/2.jpg" ],
            floor_plan_images: [],
            office_name: "Dubai Office",
            url: "https://www.jamesedition.com/real_estate/dubai/villa-#{je_id}"
          }
        }.to_json)

      info = described_class.fetch_listing_info(je_id)

      expect(info["jeId"]).to eq(je_id)
      expect(info["title"]).to eq("Info Villa")
      expect(info["price"]).to eq(2_000_000.0)
      expect(info["currency"]).to eq("USD")
      expect(info["country"]).to eq("United Arab Emirates")
      expect(info["city"]).to eq("Dubai")
      expect(info["realEstateType"]).to eq("Villa")
      expect(info["totalImages"]).to eq(2)
      expect(info["imageUrls"].length).to eq(2)
    end
  end
end
