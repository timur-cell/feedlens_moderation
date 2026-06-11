require "spec_helper"
require_relative "../../../app/services/moderation/country_matcher"

RSpec.describe Moderation::CountryMatcher do
  describe ".matches?" do
    it "matches identical codes and is case-insensitive" do
      expect(described_class.matches?("ES", [ "ES", "PT" ])).to be true
      expect(described_class.matches?("es", [ "ES" ])).to be true
      expect(described_class.matches?("ES", [ "PT" ])).to be false
    end

    it "matches a full country name against an ISO code filter" do
      expect(described_class.matches?("Spain", [ "ES", "FR" ])).to be true
      expect(described_class.matches?("United States", [ "US" ])).to be true
      expect(described_class.matches?("Spain", [ "PT" ])).to be false
    end

    it "matches an ISO code against a full-name filter" do
      expect(described_class.matches?("ES", [ "Spain" ])).to be true
      expect(described_class.matches?("FR", [ "France" ])).to be true
      expect(described_class.matches?("FR", [ "Spain" ])).to be false
    end

    it "normalizes the UK alias to GB in both directions" do
      expect(described_class.matches?("UK", [ "GB" ])).to be true
      expect(described_class.matches?("GB", [ "UK" ])).to be true
      expect(described_class.matches?("United Kingdom", [ "UK" ])).to be true
    end

    it "falls back to region names" do
      expect(described_class.matches?("Algarve", [ "ES", "PT" ])).to be true
      expect(described_class.matches?("Tuscany", [ "IT" ])).to be true
      expect(described_class.matches?("Dubai", [ "AE" ])).to be true
      expect(described_class.matches?("Algarve", [ "ES" ])).to be false
    end

    it "trims listing values" do
      expect(described_class.matches?(" Spain ", [ "ES" ])).to be true
    end

    it "rejects unknown and blank countries" do
      expect(described_class.matches?("Atlantis", [ "ES" ])).to be false
      expect(described_class.matches?("", [ "ES" ])).to be false
      expect(described_class.matches?(nil, [ "ES" ])).to be false
    end
  end

  describe ".to_country_code" do
    it "normalizes names, regions, codes and unknowns" do
      expect(described_class.to_country_code("Spain")).to eq("ES")
      expect(described_class.to_country_code("Algarve")).to eq("PT")
      expect(described_class.to_country_code("uk")).to eq("GB")
      expect(described_class.to_country_code("es")).to eq("ES")
      expect(described_class.to_country_code("Atlantis")).to eq("ATLANTIS")
      expect(described_class.to_country_code("")).to eq("")
      expect(described_class.to_country_code(nil)).to eq("")
    end
  end
end
