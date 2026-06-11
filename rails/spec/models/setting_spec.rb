require "rails_helper"

RSpec.describe Setting, type: :model do
  it "has a valid factory" do
    expect(build(:setting)).to be_valid
  end

  it "requires key" do
    expect(build(:setting, key: nil)).not_to be_valid
  end

  it "requires a unique key" do
    create(:setting)
    expect(build(:setting)).not_to be_valid
  end

  describe ".defaults" do
    it "matches the convex DEFAULTS" do
      defaults = described_class.defaults

      expect(defaults["alert_volume_per_hour"]).to eq(500)
      expect(defaults["alert_volume_per_day"]).to eq(5000)
      expect(defaults["alert_on_scan_failures"]).to be(true)
      expect(defaults["alert_on_api_errors"]).to be(true)
      expect(defaults["alert_on_rejection_spikes"]).to be(true)
      expect(defaults["rejection_spike_threshold"]).to eq(50)
      expect(defaults["notification_email"]).to eq("")
      expect(defaults["notification_slack_webhook"]).to eq("")
      expect(defaults["param_scan_model"]).to eq("claude-haiku-4-5-20251001")
      expect(defaults["vision_model"]).to eq("claude-haiku-4-5-20251001")
      expect(defaults["vision_countries"]).to eq(%w[ES IT PT FR GR])
      expect(defaults["auto_approve_threshold"]).to eq(0.9)
      expect(defaults["auto_reject_threshold"]).to eq(0.85)
      expect(defaults["ai_temperature"]).to eq(0.1)
      expect(defaults["default_moderation_action"]).to eq("auto")
      expect(defaults["max_images_per_vision_scan"]).to eq(10)
      expect(defaults["enable_auto_moderation"]).to be(true)
    end
  end

  describe ".current" do
    it "returns defaults when no settings row exists" do
      expect(described_class.current).to eq(described_class.defaults)
    end

    it "returns defaults when the row has no overrides" do
      create(:setting)
      expect(described_class.current).to eq(described_class.defaults)
    end

    it "merges non-nil row attributes over defaults" do
      create(:setting, auto_approve_threshold: 0.75, vision_countries: [ "US" ])

      current = described_class.current
      expect(current["auto_approve_threshold"]).to eq(0.75)
      expect(current["vision_countries"]).to eq([ "US" ])
      expect(current["ai_temperature"]).to eq(0.1)
      expect(current["param_scan_model"]).to eq("claude-haiku-4-5-20251001")
    end
  end
end
