require "rails_helper"

RSpec.describe ModerationList, type: :model do
  it "has a valid factory" do
    expect(build(:moderation_list)).to be_valid
  end

  it "requires name, display_name and category" do
    expect(build(:moderation_list, name: nil)).not_to be_valid
    expect(build(:moderation_list, display_name: nil)).not_to be_valid
    expect(build(:moderation_list, category: nil)).not_to be_valid
  end

  it "requires a unique name" do
    existing = create(:moderation_list)
    expect(build(:moderation_list, name: existing.name)).not_to be_valid
  end

  it "requires item_count and updated_at_ms" do
    expect(build(:moderation_list, item_count: nil)).not_to be_valid
    expect(build(:moderation_list, updated_at_ms: nil)).not_to be_valid
  end
end
