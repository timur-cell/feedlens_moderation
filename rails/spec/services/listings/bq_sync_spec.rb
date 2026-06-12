require "rails_helper"

RSpec.describe Listings::BqSync do
  around { |example| with_env("ANTHROPIC_API_KEY" => nil, "IMPLIO_STUB" => nil) { example.run } }

  def bq_row(je_id, overrides = {})
    {
      listing_id: je_id,
      listing_created_at: Time.utc(2026, 6, 12, 8),
      headline: "Cheap Villa #{je_id}",
      price_cents: 10_000_000,
      price_cents_usd: 10_000_000,
      currency: "USD",
      price_on_request: false,
      type: "Listing::RealEstateListing",
      country_code: "ES",
      country_subdivision: "Andalusia",
      city: "Marbella",
      rental: false,
      pre_owned: nil,
      year: nil,
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
      lqi_score: 0.55,
      image_count: 1,
      avg_image_width: 1200.0,
      avg_image_height: 800.0,
      image_urls: [ "https://img.example/1.jpg" ]
    }.merge(overrides)
  end

  def stub_bq(rows)
    allow(Integrations::BigqueryClient).to receive(:configured?).and_return(true)
    allow(Integrations::BigqueryClient).to receive(:query).and_return(rows)
  end

  it "limits the batch to the initial country scope" do
    expect(described_class::SQL).to include("l.country_code IN ('ES', 'PT')")
  end

  it "no-ops when BigQuery credentials are not configured" do
    allow(Integrations::BigqueryClient).to receive(:configured?).and_return(false)

    expect(described_class.call).to eq(skipped: true)
    expect(SyncState.count).to eq(0)
    expect(Listing.count).to eq(0)
  end

  describe "with configured credentials" do
    let!(:reject_rule) do
      create(:rule, name: "price_too_low", category: "simple_code", tier: "auto", action: "reject",
                    priority: 10, seller_message: "Too cheap.",
                    config: { "conditions" => [ { "field" => "price", "operator" => "<", "value" => 490_000 } ] })
    end

    it "creates and moderates new listings, skipping the param scan" do
      stub_bq([ bq_row(101), bq_row(102, listing_created_at: Time.utc(2026, 6, 12, 9)) ])

      result = described_class.call

      expect(result).to include(created: 2, skipped: 0, errors: 0, fetched: 2)

      listing = Listing.find_by(je_id: "101")
      expect(listing.title).to eq("Cheap Villa 101")
      expect(listing.batch_id).to eq("bq-sync-#{Time.current.utc.to_date.iso8601}")
      expect(listing.lqi).to eq(55.0)
      # price 100_000 < 490_000 -> the seeded reject rule fires via the engine
      expect(listing.reload.moderation_status).to eq("rejected")
      expect(ModerationResult.where(je_id: "101").count).to eq(1)
      expect(ModerationResult.where(je_id: "102").count).to eq(1)

      # param_scan: false -> no per-listing Claude scan rows
      expect(AiParameterScan.count).to eq(0)

      # watermark advanced to the max listing_created_at seen
      expect(SyncState.find_by(key: "bq_listings").watermark_at).to eq(Time.utc(2026, 6, 12, 9))
    end

    it "bootstraps the watermark to now on the first run" do
      stub_bq([])

      before = Time.current
      result = described_class.call

      expect(result).to include(created: 0, fetched: 0)
      state = SyncState.find_by(key: "bq_listings")
      expect(state.watermark_at).to be_between(before, Time.current)
    end

    it "skips listings that already exist without re-moderating them" do
      create(:listing, je_id: "101", moderation_status: "approved")
      stub_bq([ bq_row(101) ])

      result = described_class.call

      expect(result).to include(created: 0, skipped: 1, errors: 0)
      expect(Listing.find_by(je_id: "101").moderation_status).to eq("approved")
      expect(ModerationResult.count).to eq(0)
    end

    it "continues past a failing listing and still advances the watermark" do
      stub_bq([ bq_row(101), bq_row(102) ])
      call_count = 0
      allow(Moderation::Runner).to receive(:call) do |listing, **|
        call_count += 1
        raise "boom" if listing.je_id == "101"
      end

      result = described_class.call

      expect(result).to include(created: 1, errors: 1)
      expect(call_count).to eq(2)
      expect(SyncState.find_by(key: "bq_listings").watermark_at).to eq(Time.utc(2026, 6, 12, 8))
    end

    it "leaves the watermark untouched when the BigQuery query fails" do
      SyncState.create!(key: "bq_listings", watermark_at: Time.utc(2026, 6, 1))
      allow(Integrations::BigqueryClient).to receive(:configured?).and_return(true)
      allow(Integrations::BigqueryClient).to receive(:query).and_raise(StandardError, "BQ down")

      expect(described_class.call).to eq(error: true)
      expect(SyncState.find_by(key: "bq_listings").watermark_at).to eq(Time.utc(2026, 6, 1))
      expect(Listing.count).to eq(0)
    end

    it "warns when the per-run cap truncates the batch" do
      stub_const("#{described_class}::MAX_LISTINGS_PER_RUN", 2)
      stub_bq([ bq_row(101), bq_row(102) ])
      allow(Rails.logger).to receive(:warn).and_call_original

      described_class.call

      expect(Rails.logger).to have_received(:warn).with(/per-run cap 2 reached/)
    end
  end
end
