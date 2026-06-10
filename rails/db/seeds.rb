# Idempotent seeds for FeedLens moderation data.
#
# Loads rules, moderation lists and message templates from
# db/seed_data/*.json, ensures the singleton settings row exists and
# creates an initial admin moderator. Safe to run repeatedly.

require "json"

seed_data_dir = Rails.root.join("db/seed_data")
now_ms = (Time.current.to_f * 1000).to_i

# --- Rules -----------------------------------------------------------------
rules = JSON.parse(File.read(seed_data_dir.join("rules.json")))
rules.each do |attrs|
  rule = Rule.find_or_initialize_by(name: attrs.fetch("name"))
  rule.display_name = attrs.fetch("displayName")
  rule.description = attrs["description"]
  rule.category = attrs.fetch("category")
  rule.listing_category = attrs["listingCategory"]
  rule.tier = attrs.fetch("tier")
  rule.enabled = attrs.key?("enabled") ? attrs["enabled"] : true
  rule.action = attrs.fetch("action")
  rule.priority = attrs.fetch("priority")
  rule.config = attrs.fetch("config")
  rule.seller_message = attrs["sellerMessage"]

  if rule.new_record?
    rule.match_count = 0
    rule.false_positive_count = 0
    rule.created_at_ms = now_ms
  end

  rule.save!
end

# --- Moderation lists ------------------------------------------------------
lists = JSON.parse(File.read(seed_data_dir.join("lists.json")))
lists.each do |attrs|
  list = ModerationList.find_or_initialize_by(name: attrs.fetch("name"))
  list.display_name = attrs.fetch("displayName")
  list.description = attrs["description"]
  list.category = attrs.fetch("category")
  list.source = attrs["source"]
  list.items = attrs.fetch("items")
  list.item_count = attrs.fetch("itemCount")
  list.updated_at_ms = now_ms
  list.save!
end

# --- Message templates -----------------------------------------------------
templates = JSON.parse(File.read(seed_data_dir.join("message_templates.json")))
templates.each do |attrs|
  template = MessageTemplate.find_or_initialize_by(name: attrs.fetch("name"))
  template.display_name = attrs.fetch("displayName")
  template.category = attrs.fetch("category")
  template.subject = attrs["subject"]
  template.body = attrs.fetch("body")
  template.is_default = attrs["isDefault"]
  template.save!
end

# --- Settings (singleton overrides row) ------------------------------------
Setting.find_or_create_by!(key: Setting::KEY)

# --- Admin moderator --------------------------------------------------------
admin_email = ENV.fetch("ADMIN_EMAIL", "admin@feedlens.local")
admin_password = ENV.fetch("ADMIN_PASSWORD", "FeedLens!2026")

admin = Moderator.find_or_initialize_by(email: admin_email)
admin.name = "Admin"
admin.role = "admin"
admin.status = "active"
if admin.new_record?
  admin.password = admin_password
  admin.created_at_ms = now_ms
end
admin.save!

puts "Seeded:"
puts "  Rules:             #{Rule.count}"
puts "  Moderation lists:  #{ModerationList.count}"
puts "  Message templates: #{MessageTemplate.count}"
puts "  Settings rows:     #{Setting.count}"
puts "  Moderators:        #{Moderator.count}"
