# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_06_10_000014) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "ai_parameter_scans", force: :cascade do |t|
    t.float "confidence", null: false
    t.datetime "created_at", null: false
    t.integer "flag_count", default: 0, null: false
    t.jsonb "flags", default: [], null: false
    t.string "je_id", null: false
    t.bigint "listing_id", null: false
    t.string "model", null: false
    t.jsonb "parameters_checked"
    t.bigint "scanned_at", null: false
    t.text "summary", null: false
    t.integer "tokens_used"
    t.datetime "updated_at", null: false
    t.string "verdict", null: false
    t.index ["flag_count"], name: "index_ai_parameter_scans_on_flag_count"
    t.index ["je_id"], name: "index_ai_parameter_scans_on_je_id"
    t.index ["listing_id"], name: "index_ai_parameter_scans_on_listing_id"
    t.index ["scanned_at"], name: "index_ai_parameter_scans_on_scanned_at"
    t.index ["verdict"], name: "index_ai_parameter_scans_on_verdict"
  end

  create_table "daily_stats", force: :cascade do |t|
    t.integer "approved", default: 0, null: false
    t.float "avg_confidence"
    t.datetime "created_at", null: false
    t.string "date", null: false
    t.integer "llm_calls", default: 0, null: false
    t.integer "manual", default: 0, null: false
    t.integer "noticed", default: 0, null: false
    t.integer "rejected", default: 0, null: false
    t.integer "total", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["date"], name: "index_daily_stats_on_date", unique: true
  end

  create_table "image_recognition_results", force: :cascade do |t|
    t.bigint "analyzed_at", null: false
    t.datetime "created_at", null: false
    t.jsonb "image_urls", default: [], null: false
    t.string "je_id", null: false
    t.bigint "listing_id"
    t.string "llm", null: false
    t.jsonb "result"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.index ["analyzed_at"], name: "index_image_recognition_results_on_analyzed_at"
    t.index ["je_id"], name: "index_image_recognition_results_on_je_id"
    t.index ["listing_id"], name: "index_image_recognition_results_on_listing_id"
    t.index ["llm"], name: "index_image_recognition_results_on_llm"
  end

  create_table "listing_image_analyses", force: :cascade do |t|
    t.bigint "analyzed_at", null: false
    t.integer "analyzed_images", null: false
    t.integer "bathrooms"
    t.integer "bedrooms"
    t.string "city"
    t.string "country"
    t.datetime "created_at", null: false
    t.string "currency"
    t.string "implio_status"
    t.bigint "implio_submitted_at"
    t.string "je_id", null: false
    t.string "listing_url"
    t.float "living_area"
    t.string "office"
    t.jsonb "per_image_results"
    t.float "price"
    t.string "real_estate_type"
    t.string "state"
    t.jsonb "summary"
    t.string "title", null: false
    t.integer "total_images", null: false
    t.datetime "updated_at", null: false
    t.index ["analyzed_at"], name: "index_listing_image_analyses_on_analyzed_at"
    t.index ["je_id"], name: "index_listing_image_analyses_on_je_id"
  end

  create_table "listings", force: :cascade do |t|
    t.string "accuracy_action"
    t.jsonb "accuracy_flags"
    t.bigint "accuracy_scanned_at"
    t.float "accuracy_score"
    t.bigint "accuracy_source_updated_at"
    t.text "accuracy_user_message"
    t.float "avg_image_height"
    t.float "avg_image_width"
    t.string "batch_id"
    t.integer "bathrooms"
    t.integer "bedrooms"
    t.string "category"
    t.string "chat_gpt_conclusion"
    t.string "chat_gpt_image_quality"
    t.string "chat_gpt_image_type"
    t.float "chat_gpt_property_condition"
    t.float "chat_gpt_watermark_share"
    t.string "chat_gpt_watermark_text"
    t.string "city"
    t.string "country"
    t.datetime "created_at", null: false
    t.string "currency"
    t.text "description"
    t.integer "description_length"
    t.string "feed_source"
    t.integer "image_count"
    t.jsonb "image_urls"
    t.bigint "imported_at", null: false
    t.string "je_id", null: false
    t.float "land_area"
    t.string "listing_url"
    t.float "living_area"
    t.float "lqi"
    t.string "moderation_status", null: false
    t.string "office"
    t.string "office_group_name"
    t.string "office_subscription"
    t.boolean "outdated"
    t.boolean "pre_owned"
    t.float "price"
    t.boolean "price_on_request"
    t.float "price_per_sqm"
    t.float "price_usd"
    t.jsonb "raw_data"
    t.string "real_estate_type"
    t.boolean "rental"
    t.string "state"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.integer "year"
    t.index ["batch_id"], name: "index_listings_on_batch_id"
    t.index ["country"], name: "index_listings_on_country"
    t.index ["feed_source"], name: "index_listings_on_feed_source"
    t.index ["imported_at"], name: "index_listings_on_imported_at"
    t.index ["je_id"], name: "index_listings_on_je_id", unique: true
    t.index ["moderation_status"], name: "index_listings_on_moderation_status"
  end

  create_table "message_templates", force: :cascade do |t|
    t.text "body", null: false
    t.string "category", null: false
    t.datetime "created_at", null: false
    t.string "display_name", null: false
    t.boolean "is_default"
    t.string "name", null: false
    t.string "subject"
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_message_templates_on_name", unique: true
  end

  create_table "moderation_lists", force: :cascade do |t|
    t.string "category", null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.string "display_name", null: false
    t.integer "item_count", default: 0, null: false
    t.jsonb "items", default: [], null: false
    t.string "name", null: false
    t.string "source"
    t.datetime "updated_at", null: false
    t.bigint "updated_at_ms", null: false
    t.index ["category"], name: "index_moderation_lists_on_category"
    t.index ["name"], name: "index_moderation_lists_on_name", unique: true
  end

  create_table "moderation_notes", force: :cascade do |t|
    t.string "author_name", null: false
    t.string "author_role"
    t.text "content", null: false
    t.datetime "created_at", null: false
    t.bigint "created_at_ms", null: false
    t.string "je_id", null: false
    t.bigint "listing_id", null: false
    t.datetime "updated_at", null: false
    t.index ["created_at_ms"], name: "index_moderation_notes_on_created_at_ms"
    t.index ["je_id"], name: "index_moderation_notes_on_je_id"
    t.index ["listing_id"], name: "index_moderation_notes_on_listing_id"
  end

  create_table "moderation_results", force: :cascade do |t|
    t.float "confidence"
    t.datetime "created_at", null: false
    t.string "je_id", null: false
    t.bigint "listing_id", null: false
    t.jsonb "llm_response"
    t.boolean "llm_triggered", default: false, null: false
    t.string "original_outcome"
    t.string "outcome", null: false
    t.bigint "overridden_at"
    t.string "overridden_by"
    t.text "override_reason"
    t.bigint "processed_at", null: false
    t.string "refuse_reason_type"
    t.jsonb "rule_matches", default: [], null: false
    t.text "seller_message"
    t.datetime "updated_at", null: false
    t.string "vision_model"
    t.jsonb "vision_result"
    t.index ["je_id"], name: "index_moderation_results_on_je_id"
    t.index ["listing_id"], name: "index_moderation_results_on_listing_id"
    t.index ["outcome"], name: "index_moderation_results_on_outcome"
    t.index ["processed_at"], name: "index_moderation_results_on_processed_at"
  end

  create_table "moderator_activities", force: :cascade do |t|
    t.string "action", null: false
    t.datetime "created_at", null: false
    t.text "details"
    t.bigint "moderator_id", null: false
    t.string "moderator_name", null: false
    t.string "target_id"
    t.string "target_type"
    t.bigint "timestamp", null: false
    t.datetime "updated_at", null: false
    t.index ["moderator_id"], name: "index_moderator_activities_on_moderator_id"
    t.index ["timestamp"], name: "index_moderator_activities_on_timestamp"
  end

  create_table "moderators", force: :cascade do |t|
    t.integer "action_count"
    t.datetime "created_at", null: false
    t.bigint "created_at_ms"
    t.string "email", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "invited_by"
    t.bigint "last_login_at"
    t.string "name", null: false
    t.datetime "remember_created_at"
    t.datetime "reset_password_sent_at"
    t.string "reset_password_token"
    t.string "role", default: "moderator", null: false
    t.string "status", default: "active", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_moderators_on_email", unique: true
    t.index ["reset_password_token"], name: "index_moderators_on_reset_password_token", unique: true
    t.index ["role"], name: "index_moderators_on_role"
    t.index ["status"], name: "index_moderators_on_status"
  end

  create_table "remediation_results", force: :cascade do |t|
    t.string "category"
    t.string "country"
    t.datetime "created_at", null: false
    t.jsonb "description_score"
    t.integer "error_count", default: 0, null: false
    t.string "feed_source"
    t.boolean "has_fixable_errors", default: false, null: false
    t.string "je_id", null: false
    t.bigint "listing_id", null: false
    t.string "model", null: false
    t.string "office"
    t.bigint "scanned_at", null: false
    t.jsonb "suggestions", default: [], null: false
    t.integer "tokens_used"
    t.float "total_confidence", default: 0.0, null: false
    t.datetime "updated_at", null: false
    t.index ["feed_source"], name: "index_remediation_results_on_feed_source"
    t.index ["has_fixable_errors"], name: "index_remediation_results_on_has_fixable_errors"
    t.index ["je_id"], name: "index_remediation_results_on_je_id"
    t.index ["listing_id"], name: "index_remediation_results_on_listing_id"
    t.index ["office"], name: "index_remediation_results_on_office"
    t.index ["scanned_at"], name: "index_remediation_results_on_scanned_at"
  end

  create_table "rules", force: :cascade do |t|
    t.string "action", null: false
    t.string "category", null: false
    t.jsonb "config", default: {}, null: false
    t.datetime "created_at", null: false
    t.bigint "created_at_ms"
    t.text "description"
    t.string "display_name", null: false
    t.boolean "enabled", default: true, null: false
    t.integer "false_positive_count"
    t.bigint "last_matched_at"
    t.bigint "last_modified_at"
    t.string "last_modified_by"
    t.string "listing_category"
    t.integer "match_count"
    t.string "name", null: false
    t.integer "priority", null: false
    t.text "seller_message"
    t.string "tier", null: false
    t.datetime "updated_at", null: false
    t.index ["category"], name: "index_rules_on_category"
    t.index ["enabled"], name: "index_rules_on_enabled"
    t.index ["listing_category"], name: "index_rules_on_listing_category"
    t.index ["name"], name: "index_rules_on_name", unique: true
  end

  create_table "settings", force: :cascade do |t|
    t.float "ai_temperature"
    t.boolean "alert_on_api_errors"
    t.boolean "alert_on_rejection_spikes"
    t.boolean "alert_on_scan_failures"
    t.integer "alert_volume_per_day"
    t.integer "alert_volume_per_hour"
    t.float "auto_approve_threshold"
    t.float "auto_reject_threshold"
    t.datetime "created_at", null: false
    t.string "default_moderation_action"
    t.boolean "enable_auto_moderation"
    t.string "key", null: false
    t.integer "max_images_per_vision_scan"
    t.string "notification_email"
    t.string "notification_slack_webhook"
    t.string "param_scan_model"
    t.float "rejection_spike_threshold"
    t.datetime "updated_at", null: false
    t.bigint "updated_at_ms"
    t.string "updated_by"
    t.jsonb "vision_countries"
    t.string "vision_model"
    t.index ["key"], name: "index_settings_on_key", unique: true
  end

  add_foreign_key "ai_parameter_scans", "listings"
  add_foreign_key "image_recognition_results", "listings"
  add_foreign_key "moderation_notes", "listings"
  add_foreign_key "moderation_results", "listings"
  add_foreign_key "moderator_activities", "moderators"
  add_foreign_key "remediation_results", "listings"
end
