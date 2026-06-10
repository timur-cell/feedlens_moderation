require "rails_helper"

RSpec.describe ModerationNote, type: :model do
  it "has a valid factory" do
    expect(build(:moderation_note)).to be_valid
  end

  it "requires a listing" do
    expect(build(:moderation_note, listing: nil, je_id: "JE1")).not_to be_valid
  end

  it "requires je_id, author_name, content and created_at_ms" do
    expect(build(:moderation_note, je_id: nil)).not_to be_valid
    expect(build(:moderation_note, author_name: nil)).not_to be_valid
    expect(build(:moderation_note, content: nil)).not_to be_valid
    expect(build(:moderation_note, created_at_ms: nil)).not_to be_valid
  end
end
