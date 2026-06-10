class Setting < ApplicationRecord
  KEY = "app_settings".freeze

  validates :key, presence: true, uniqueness: true

  # Ported verbatim from convex/settings.ts DEFAULTS (snake_cased keys).
  def self.defaults
    {
      "alert_volume_per_hour" => 500,
      "alert_volume_per_day" => 5000,
      "alert_on_scan_failures" => true,
      "alert_on_api_errors" => true,
      "alert_on_rejection_spikes" => true,
      "rejection_spike_threshold" => 50,
      "notification_email" => "",
      "notification_slack_webhook" => "",
      "param_scan_model" => "claude-haiku-4-5-20251001",
      "vision_model" => "claude-haiku-4-5-20251001",
      "vision_countries" => [ "ES", "IT", "PT", "FR", "GR" ],
      "auto_approve_threshold" => 0.9,
      "auto_reject_threshold" => 0.85,
      "ai_temperature" => 0.1,
      "default_moderation_action" => "auto",
      "max_images_per_vision_scan" => 10,
      "enable_auto_moderation" => true
    }
  end

  # Mirrors convex getSettings: defaults overlaid with any non-nil
  # values stored on the settings row.
  def self.current
    overrides = find_by(key: KEY)
      &.attributes
      &.except("id", "key", "created_at", "updated_at")
      &.compact || {}

    defaults.merge(overrides)
  end
end
