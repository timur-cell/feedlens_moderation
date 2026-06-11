require "rails_helper"

RSpec.describe MessageTemplate, type: :model do
  it "has a valid factory" do
    expect(build(:message_template)).to be_valid
  end

  it "requires name, display_name and body" do
    expect(build(:message_template, name: nil)).not_to be_valid
    expect(build(:message_template, display_name: nil)).not_to be_valid
    expect(build(:message_template, body: nil)).not_to be_valid
  end

  it "requires a unique name" do
    existing = create(:message_template)
    expect(build(:message_template, name: existing.name)).not_to be_valid
  end

  it "requires a known category" do
    expect(build(:message_template, category: "bogus")).not_to be_valid

    %w[reject notice].each do |category|
      expect(build(:message_template, category: category)).to be_valid
    end
  end
end
