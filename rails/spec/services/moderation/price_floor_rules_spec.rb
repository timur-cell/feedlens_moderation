require "spec_helper"
require "json"
require_relative "../../../app/services/moderation/rule_evaluator"

# Sale-price floors must never fire on rentals: rentals carry monthly prices,
# so any USD floor written for sale listings trivially matches them. Batch
# bq-sync-2026-06-12 auto-rejected 7 rental listings through price_too_low_re
# before the nonRentalOnly flag was added to these configs.
RSpec.describe "seeded price-floor rules" do
  rails_root = File.expand_path("../../..", __dir__)
  seed_rules = JSON.parse(File.read(File.join(rails_root, "db/seed_data/rules.json"), encoding: "UTF-8"))
  rules_by_name = seed_rules.to_h { |r| [ r["name"], r ] }

  # One listing per rule that satisfies every filter and condition except the
  # rental check — the minimal sale listing the floor is meant to reject.
  floor_listings = {
    # je_id 18143699: €2,750/mo Lisboa apartment, wrongly rejected in prod
    "price_too_low_re" => { "country" => "PT", "priceUsd" => 3000 },
    "too_low_price_430k" => { "country" => "ES", "priceUsd" => 3000 },
    "por_low_price" => { "country" => "ES", "priceOnRequest" => true, "priceUsd" => 5000 },
    "dubai_price_sqm" => { "country" => "AE", "realEstateType" => "apartment", "pricePerSqm" => 800 }
  }

  floor_listings.each do |rule_name, listing|
    describe rule_name do
      config = rules_by_name.fetch(rule_name)["config"]

      it "declares nonRentalOnly in the seed config" do
        expect(config["nonRentalOnly"]).to be(true)
      end

      it "still matches the equivalent sale listing" do
        result = Moderation::RuleEvaluator.evaluate_simple(listing.merge("rental" => false), config)
        expect(result[:matched]).to be(true)
      end

      it "does not match when rental=true" do
        result = Moderation::RuleEvaluator.evaluate_simple(listing.merge("rental" => true), config)
        expect(result[:matched]).to be(false)
        expect(result[:details]).to include("is a rental")
      end
    end
  end
end
