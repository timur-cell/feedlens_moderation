module Api
  # App settings singleton. Mirrors convex/settings.ts: GET merges the DB row
  # with defaults; PATCH/reset are admin-only.
  class SettingsController < BaseController
    before_action :require_admin!, only: %i[update reset]

    CAMEL_KEYS = %w[
      alertVolumePerHour alertVolumePerDay alertOnScanFailures alertOnApiErrors
      alertOnRejectionSpikes rejectionSpikeThreshold notificationEmail
      notificationSlackWebhook paramScanModel visionModel visionCountries
      autoApproveThreshold autoRejectThreshold aiTemperature
      defaultModerationAction maxImagesPerVisionScan enableAutoModeration
    ].freeze

    # GET /api/settings
    def show
      render json: merged_settings
    end

    # PATCH /api/settings
    def update
      row = Setting.find_or_initialize_by(key: Setting::KEY)
      row.assign_attributes(settings_params)
      row.updated_at_ms = now_ms
      row.updated_by = current_moderator.email
      row.save!
      render json: merged_settings
    end

    # POST /api/settings/reset — restore defaults (mirrors resetToDefaults:
    # only replaces when a row exists).
    def reset
      row = Setting.find_by(key: Setting::KEY)
      if row
        row.assign_attributes(Setting.defaults)
        row.updated_at_ms = now_ms
        row.updated_by = nil
        row.save!
      end
      render json: merged_settings
    end

    private

    def settings_params
      scalar_keys = CAMEL_KEYS - %w[visionCountries]
      permitted = params.permit(*scalar_keys, visionCountries: [])
                        .to_h.transform_keys(&:underscore)
      permitted
    end

    def merged_settings
      row = Setting.find_by(key: Setting::KEY)
      json = Setting.current.each_with_object({}) do |(key, value), hash|
        next if %w[updated_at_ms updated_by].include?(key)

        hash[key.camelize(:lower)] = value
      end
      json["updatedAt"] = row&.updated_at_ms
      json["updatedBy"] = row&.updated_by
      json["_id"] = row&.id&.to_s
      json
    end
  end
end
