require "rails_helper"

RSpec.describe ModeratorActivity, type: :model do
  it "has a valid factory" do
    expect(build(:moderator_activity)).to be_valid
  end

  it "requires a moderator" do
    expect(build(:moderator_activity, moderator: nil, moderator_name: "x")).not_to be_valid
  end

  it "requires moderator_name, action and timestamp" do
    expect(build(:moderator_activity, moderator_name: nil)).not_to be_valid
    expect(build(:moderator_activity, action: nil)).not_to be_valid
    expect(build(:moderator_activity, timestamp: nil)).not_to be_valid
  end
end
