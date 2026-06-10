require "rails_helper"

RSpec.describe ModerationResult, type: :model do
  it "has a valid factory" do
    expect(build(:moderation_result)).to be_valid
  end

  it "requires a listing" do
    expect(build(:moderation_result, listing: nil, je_id: "JE1")).not_to be_valid
  end

  it "requires je_id" do
    expect(build(:moderation_result, je_id: nil)).not_to be_valid
  end

  it "requires processed_at" do
    expect(build(:moderation_result, processed_at: nil)).not_to be_valid
  end

  it "requires a known outcome" do
    expect(build(:moderation_result, outcome: nil)).not_to be_valid
    expect(build(:moderation_result, outcome: "bogus")).not_to be_valid

    %w[approved rejected notice manual].each do |outcome|
      expect(build(:moderation_result, outcome: outcome)).to be_valid
    end
  end

  it "requires llm_triggered to be boolean" do
    expect(build(:moderation_result, llm_triggered: nil)).not_to be_valid
    expect(build(:moderation_result, llm_triggered: true)).to be_valid
  end
end
