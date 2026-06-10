require "rails_helper"

RSpec.describe Moderator, type: :model do
  it "has a valid factory" do
    expect(build(:moderator)).to be_valid
  end

  it "requires name" do
    expect(build(:moderator, name: nil)).not_to be_valid
  end

  it "requires a unique email" do
    existing = create(:moderator)
    expect(build(:moderator, email: existing.email)).not_to be_valid
  end

  it "normalizes email before validation" do
    moderator = create(:moderator, email: "  Admin@Example.COM ")
    expect(moderator.email).to eq("admin@example.com")
  end

  it "requires a known role" do
    expect(build(:moderator, role: "bogus")).not_to be_valid

    %w[admin moderator viewer].each do |role|
      expect(build(:moderator, role: role)).to be_valid
    end
  end

  it "requires a known status" do
    expect(build(:moderator, status: "bogus")).not_to be_valid

    %w[active invited disabled].each do |status|
      expect(build(:moderator, status: status)).to be_valid
    end
  end

  it "sets created_at_ms on create when missing" do
    moderator = create(:moderator)
    expect(moderator.created_at_ms).to be_present
  end

  describe "#active?" do
    it "is true only for active status" do
      expect(build(:moderator, status: "active")).to be_active
      expect(build(:moderator, status: "disabled")).not_to be_active
    end
  end

  describe "#admin?" do
    it "is true only for admin role" do
      expect(build(:moderator, role: "admin")).to be_admin
      expect(build(:moderator, role: "moderator")).not_to be_admin
    end
  end

  it "authenticates with valid_password?" do
    moderator = create(:moderator, password: "Sup3rSecret!")
    expect(moderator.valid_password?("Sup3rSecret!")).to be(true)
    expect(moderator.valid_password?("wrong")).to be(false)
  end
end
