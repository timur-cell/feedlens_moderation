class CreateSettings < ActiveRecord::Migration[8.1]
  def change
    create_table :settings do |t|
      t.string :key, null: false
      t.integer :alert_volume_per_hour
      t.integer :alert_volume_per_day
      t.boolean :alert_on_scan_failures
      t.boolean :alert_on_api_errors
      t.boolean :alert_on_rejection_spikes
      t.float :rejection_spike_threshold
      t.string :notification_email
      t.string :notification_slack_webhook
      t.string :param_scan_model
      t.string :vision_model
      t.jsonb :vision_countries
      t.float :auto_approve_threshold
      t.float :auto_reject_threshold
      t.float :ai_temperature
      t.string :default_moderation_action
      t.integer :max_images_per_vision_scan
      t.boolean :enable_auto_moderation
      t.bigint :updated_at_ms
      t.string :updated_by

      t.timestamps
    end

    add_index :settings, :key, unique: true
  end
end
