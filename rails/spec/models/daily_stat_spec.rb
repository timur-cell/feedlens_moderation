require "rails_helper"

RSpec.describe DailyStat, type: :model do
  it "has a valid factory" do
    expect(build(:daily_stat)).to be_valid
  end

  it "requires date" do
    expect(build(:daily_stat, date: nil)).not_to be_valid
  end

  it "requires a unique date" do
    existing = create(:daily_stat)
    expect(build(:daily_stat, date: existing.date)).not_to be_valid
  end

  it "requires counters" do
    %i[total approved rejected noticed manual llm_calls].each do |counter|
      expect(build(:daily_stat, counter => nil)).not_to be_valid
    end
  end
end
