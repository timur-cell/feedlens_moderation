# Imports a Convex export (`npx convex export` ZIP, or the extracted directory)
# into the Rails database. Auth password hashes (Convex Scrypt) are NOT migrated:
# imported moderators get a random password and must use password reset
# (or an admin sets one via the Users page).
#
#   bin/rails "convex:import[/path/to/export.zip]"
#   bin/rails "convex:import[/path/to/extracted_dir]"
namespace :convex do
  desc "Import a Convex export ZIP/directory (listings, results, rules, lists, users, ...)"
  task :import, [ :path ] => :environment do |_t, args|
    require "json"
    require "securerandom"
    require "tmpdir"

    path = args[:path] or abort "Usage: bin/rails \"convex:import[/path/to/export.zip]\""
    abort "Not found: #{path}" unless File.exist?(path)

    Dir.mktmpdir do |tmp|
      dir =
        if File.directory?(path)
          path
        else
          system("unzip", "-qo", path, "-d", tmp) || abort("Failed to unzip #{path} (is `unzip` installed?)")
          tmp
        end

      importer = ConvexImporter.new(dir)
      importer.run
    end
  end
end

# Maps Convex table documents (camelCase JSONL) onto ActiveRecord models.
class ConvexImporter
  # Convex table name => model. Order matters: parents before FK dependents.
  TABLES = {
    "moderators" => "Moderator",
    "listings" => "Listing",
    "moderationResults" => "ModerationResult",
    "rules" => "Rule",
    "moderationLists" => "ModerationList",
    "messageTemplates" => "MessageTemplate",
    "moderatorActivity" => "ModeratorActivity",
    "imageRecognitionResults" => "ImageRecognitionResult",
    "listingImageAnalyses" => "ListingImageAnalysis",
    "moderationNotes" => "ModerationNote",
    "aiParameterScans" => "AiParameterScan",
    "remediationResults" => "RemediationResult",
    "dailyStats" => "DailyStat",
    "settings" => "Setting"
  }.freeze

  # Convex field => column when straight underscoring is not enough.
  RENAMES = {
    "Rule" => { "createdAt" => "created_at_ms", "lastModifiedAt" => "last_modified_at" },
    "Moderator" => { "createdAt" => "created_at_ms" },
    "ModerationNote" => { "createdAt" => "created_at_ms" },
    "ModerationList" => { "updatedAt" => "updated_at_ms" },
    "Setting" => { "updatedAt" => "updated_at_ms" }
  }.freeze

  UNIQUE_KEYS = {
    "Listing" => :je_id, "Rule" => :name, "ModerationList" => :name,
    "MessageTemplate" => :name, "Moderator" => :email, "DailyStat" => :date, "Setting" => :key
  }.freeze

  def initialize(dir)
    @dir = dir
    @id_maps = Hash.new { |h, k| h[k] = {} } # convex table => { convex _id => AR id }
  end

  def run
    TABLES.each do |convex_table, model_name|
      model = model_name.constantize
      file = documents_file(convex_table)
      unless file
        puts "skip   #{convex_table}: no documents.jsonl found"
        next
      end
      import_table(convex_table, model, file)
    end
  end

  private

  def documents_file(convex_table)
    [ File.join(@dir, convex_table, "documents.jsonl"),
      Dir.glob(File.join(@dir, "**", convex_table, "documents.jsonl")).first ].compact.find { |f| File.exist?(f) }
  end

  def import_table(convex_table, model, file)
    created = updated = errors = 0
    File.foreach(file) do |line|
      line = line.strip
      next if line.empty?

      doc = JSON.parse(line)
      record = build_record(model, doc)
      record.new_record? ? created += 1 : updated += 1
      record.save!
      @id_maps[convex_table][doc["_id"]] = record.id if doc["_id"]
    rescue StandardError => e
      errors += 1
      warn "  #{convex_table}: #{e.class}: #{e.message.lines.first&.strip}"
    end
    puts format("import %-22s created=%-6d updated=%-6d errors=%d", convex_table, created, updated, errors)
  end

  def build_record(model, doc)
    attrs = transform(model, doc)
    key = UNIQUE_KEYS[model.name]
    record = key && attrs[key.to_s].present? ? model.find_or_initialize_by(key => attrs[key.to_s]) : model.new
    attrs.each { |k, v| record[k] = v }
    record.created_at ||= Time.zone.at(doc["_creationTime"].to_f / 1000.0) if doc["_creationTime"]
    if model.name == "Moderator" && record.new_record? && record.encrypted_password.blank?
      record.password = SecureRandom.base58(24) # Scrypt hashes are not portable; reset via admin/mailer
    end
    record
  end

  def transform(model, doc)
    renames = RENAMES[model.name] || {}
    cols = model.column_names
    out = {}
    doc.each do |k, v|
      next if k.start_with?("_")

      col = renames[k] || k.underscore
      case col
      when "listing_id" then out["listing_id"] = resolve_listing_id(v, doc)
      when "moderator_id" then out["moderator_id"] = @id_maps["moderators"][v]
      else
        out[col] = v if cols.include?(col)
      end
    end
    out.compact
  end

  def resolve_listing_id(convex_id, doc)
    @id_maps["listings"][convex_id] ||
      (doc["jeId"] && Listing.find_by(je_id: doc["jeId"])&.id)
  end
end
