require "rails_helper"

RSpec.describe Listings::FetchAndModerate do
  let(:je_id) { "16680095" }
  let(:mobile_url) { "https://www.jamesedition.com/api/mobile/v1/listings/#{je_id}" }
  let(:search_url) { "https://www.jamesedition.com/api/mobile/v1/listings?listing_id=#{je_id}" }
  let(:html_url) { "https://www.jamesedition.com/listing/#{je_id}" }

  def mobile_body(overrides = {})
    {
      listing: {
        listing_id: je_id.to_i,
        headline: "Cheap Villa",
        price: "$100,000",
        price_on_request: false,
        bedrooms: 3,
        bathrooms: "2 Baths",
        living_area: "200 Sq. Mt.",
        humanized_location: "Villa in Ulaanbaatar, Mongolia",
        location_name: "Ulaanbaatar, Mongolia",
        address: "",
        images: [ "https://img.example/1.jpg" ],
        floor_plan_images: [],
        description: "A villa",
        property_type: "Villa",
        office_name: "Office",
        url: "https://www.jamesedition.com/real_estate/villa-#{je_id}"
      }.merge(overrides)
    }.to_json
  end

  around { |example| with_env("ANTHROPIC_API_KEY" => nil, "IMPLIO_STUB" => nil) { example.run } }

  describe ".call" do
    let!(:reject_rule) do
      create(:rule, name: "price_too_low", category: "simple_code", tier: "auto", action: "reject",
                    priority: 10, seller_message: "Too cheap.",
                    config: { "conditions" => [ { "field" => "price", "operator" => "<", "value" => 490_000 } ] })
    end

    it "fetches, creates the listing, moderates and returns the contract shape" do
      stub_request(:get, mobile_url).to_return(status: 200, body: mobile_body)

      result = described_class.call(inputs: [ je_id ])

      expect(result[:success]).to be(true)
      expect(result[:count]).to eq(1)
      expect(result[:successCount]).to eq(1)
      expect(result[:errorCount]).to eq(0)

      entry = result[:results].first
      expect(entry[:jeId]).to eq(je_id)
      expect(entry[:input]).to eq(je_id)
      expect(entry[:status]).to eq("success")
      expect(entry[:dataSource]).to eq("mobile_api")
      expect(entry[:title]).to eq("Cheap Villa")
      expect(entry[:outcome]).to eq("rejected")
      expect(entry[:ruleMatches]).to eq(1)
      expect(entry[:ruleMatchDetails].first[:ruleName]).to eq("price_too_low")
      expect(entry[:llmTriggered]).to be(false)
      expect(entry[:visionAnalyzed]).to be(false)
      expect(entry[:aiScan]).to include(verdict: kind_of(String), flagCount: kind_of(Integer))

      listing = Listing.find_by(je_id: je_id)
      expect(entry[:listingId]).to eq(listing.id)
      expect(listing.title).to eq("Cheap Villa")
      expect(listing.price).to eq(100_000.0)
      expect(listing.price_per_sqm).to eq(500)
      expect(listing.country).to eq("Mongolia")
      expect(listing.moderation_status).to eq("rejected")
      expect(ModerationResult.where(je_id: je_id).count).to eq(1)
    end

    it "accepts jamesedition.com URLs and extracts the id" do
      stub_request(:get, mobile_url).to_return(status: 200, body: mobile_body)

      url = "https://www.jamesedition.com/real_estate/ulaanbaatar/cheap-villa-#{je_id}"
      result = described_class.call(inputs: [ url ])

      entry = result[:results].first
      expect(entry[:jeId]).to eq(je_id)
      expect(entry[:status]).to eq("success")
    end

    it "rejects invalid ids" do
      result = described_class.call(inputs: [ "123" ])

      expect(result[:errorCount]).to eq(1)
      expect(result[:results].first).to include(error: "Invalid listing ID", status: "error")
    end

    it "updates the existing listing (reset to pending) instead of duplicating" do
      existing = create(:listing, je_id: je_id, title: "Old title", moderation_status: "approved", lqi: 42.0)
      stub_request(:get, mobile_url).to_return(status: 200, body: mobile_body)

      described_class.call(inputs: [ je_id ])

      expect(Listing.where(je_id: je_id).count).to eq(1)
      reloaded = existing.reload
      expect(reloaded.title).to eq("Cheap Villa")
      expect(reloaded.lqi).to eq(42.0) # untouched: fetcher provides no lqi
      expect(reloaded.moderation_status).to eq("rejected") # pending → moderated
    end

    it "routes minimal records (all sources failed) to manual review without moderation" do
      stub_request(:get, mobile_url).to_return(status: 500)
      stub_request(:get, search_url).to_return(status: 500)
      stub_request(:get, html_url).to_return(status: 500)

      result = described_class.call(inputs: [ je_id ])

      entry = result[:results].first
      expect(entry[:status]).to eq("success")
      expect(entry[:dataSource]).to eq("minimal")
      expect(entry[:outcome]).to eq("manual")
      expect(entry[:ruleMatches]).to eq(1)
      expect(entry[:error]).to eq("Data fetch failed — routed to manual review")

      listing = Listing.find_by(je_id: je_id)
      expect(listing.title).to eq("Listing #{je_id}")
      expect(listing.moderation_status).to eq("manual")

      mod = ModerationResult.find_by(je_id: je_id)
      expect(mod.outcome).to eq("manual")
      expect(mod.rule_matches.first["ruleName"]).to eq("data_fetch_failed")
      expect(mod.rule_matches.first["ruleCategory"]).to eq("internal")
      expect(mod.confidence).to eq(0)
    end

    it "runs vision for visionCountries listings and patches chat_gpt fields" do
      stub_request(:get, mobile_url).to_return(
        status: 200,
        body: mobile_body(humanized_location: "Villa in Marbella, Spain", location_name: "Marbella, Spain")
      )

      vision = Ai::VisionAnalyzer::EMPTY_RESULT.merge(
        "property_condition" => 4.5, "conclusion" => 5.0, "watermark_share" => 0,
        "image_quality" => "high", "image_type" => "Real photo", "model" => "claude-haiku-4-5-20251001"
      )
      expect(Ai::VisionAnalyzer).to receive(:analyze)
        .with(image_urls: [ "https://img.example/1.jpg" ], title: "Cheap Villa", je_id: je_id)
        .and_return(vision)

      entry = described_class.call(inputs: [ je_id ])[:results].first

      expect(entry[:visionAnalyzed]).to be(true)
      listing = Listing.find_by(je_id: je_id)
      expect(listing.chat_gpt_property_condition).to eq(4.5)
      expect(listing.chat_gpt_conclusion).to eq("5")
      expect(listing.chat_gpt_image_type).to eq("Real photo")
    end

    it "skips vision for non-vision countries" do
      stub_request(:get, mobile_url).to_return(status: 200, body: mobile_body) # Mongolia
      expect(Ai::VisionAnalyzer).not_to receive(:analyze)

      entry = described_class.call(inputs: [ je_id ])[:results].first
      expect(entry[:visionAnalyzed]).to be(false)
    end

    it "captures per-input errors without failing the batch" do
      stub_request(:get, mobile_url).to_return(status: 200, body: mobile_body)
      allow(Moderation::Runner).to receive(:call).and_raise(StandardError, "engine exploded")

      result = described_class.call(inputs: [ je_id ])

      expect(result[:errorCount]).to eq(1)
      expect(result[:results].first).to include(status: "error", error: "engine exploded")
    end
  end

  describe ".enrich_listing" do
    it "fills only missing fields and replaces placeholder titles" do
      listing = create(:listing,
                       je_id: je_id,
                       title: "Listing #{je_id}", # placeholder → replaced
                       price: 555_000.0,          # already set → kept
                       country: nil,
                       bedrooms: nil)
      stub_request(:get, mobile_url).to_return(status: 200, body: mobile_body)

      result = described_class.enrich_listing(je_id)

      expect(result).to eq(success: true, dataSource: "mobile_api")
      reloaded = listing.reload
      expect(reloaded.title).to eq("Cheap Villa")        # placeholder replaced
      expect(reloaded.price).to eq(555_000.0)            # NOT clobbered by fetched $100,000
      expect(reloaded.country).to eq("Mongolia")         # filled
      expect(reloaded.bedrooms).to eq(3)                 # filled
      expect(reloaded.image_urls).to eq([ "https://img.example/1.jpg" ])
    end

    it "keeps a real title" do
      listing = create(:listing, je_id: je_id, title: "Hand-curated title")
      stub_request(:get, mobile_url).to_return(status: 200, body: mobile_body)

      described_class.enrich_listing(je_id)

      expect(listing.reload.title).to eq("Hand-curated title")
    end

    it "reports when all data sources fail" do
      create(:listing, je_id: je_id)
      stub_request(:get, mobile_url).to_return(status: 500)
      stub_request(:get, search_url).to_return(status: 500)
      stub_request(:get, html_url).to_return(status: 500)

      expect(described_class.enrich_listing(je_id)).to eq(success: false, error: "All data sources failed")
    end

    it "reports unknown listings" do
      stub_request(:get, mobile_url).to_return(status: 200, body: mobile_body)

      expect(described_class.enrich_listing(je_id)).to eq(success: false, error: "Listing not found in database")
    end
  end

  describe ".parse_input" do
    it "extracts ids from URLs, with the longest-digit-run fallback" do
      expect(described_class.parse_input("16680095").first).to eq("16680095")
      expect(described_class.parse_input("https://www.jamesedition.com/real_estate/x/villa-16680095?utm=1").first)
        .to eq("16680095")
      # No [-/]id boundary match → longest standalone digit run wins
      expect(described_class.parse_input("https://www.jamesedition.com/x?year=2024&id16680095z&ref=12345").first)
        .to eq("16680095")
    end

    it "never scrapes non-JE hosts" do
      je_id, url = described_class.parse_input("https://evil.example.com/listing-16680095")
      expect(je_id).to eq("16680095")
      expect(url).to eq("https://www.jamesedition.com/listing/16680095")
    end
  end
end
