require "rails_helper"

RSpec.describe Rule, type: :model do
  it "has a valid factory" do
    expect(build(:rule)).to be_valid
  end

  it "requires name, display_name and priority" do
    expect(build(:rule, name: nil)).not_to be_valid
    expect(build(:rule, display_name: nil)).not_to be_valid
    expect(build(:rule, priority: nil)).not_to be_valid
  end

  it "requires a unique name" do
    existing = create(:rule)
    expect(build(:rule, name: existing.name)).not_to be_valid
  end

  it "requires a known category" do
    expect(build(:rule, category: "bogus")).not_to be_valid

    %w[simple_code hybrid_vision auto_ai former_manual internal].each do |category|
      expect(build(:rule, category: category)).to be_valid
    end
  end

  it "requires a known tier" do
    expect(build(:rule, tier: "bogus")).not_to be_valid

    %w[auto verify manual].each do |tier|
      expect(build(:rule, tier: tier)).to be_valid
    end
  end

  it "requires a known action" do
    expect(build(:rule, action: "bogus")).not_to be_valid

    %w[reject notice flag approve].each do |action|
      expect(build(:rule, action: action)).to be_valid
    end
  end

  it "requires enabled to be boolean" do
    expect(build(:rule, enabled: nil)).not_to be_valid
    expect(build(:rule, enabled: false)).to be_valid
  end
end
