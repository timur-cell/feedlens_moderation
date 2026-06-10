# Serializes ActiveRecord rows in the shape of Convex documents, which is
# what the React SPA already consumes: `_id` (string), `_creationTime`
# (epoch milliseconds) plus all columns camelCased.
#
# Conventions:
#   * `id`, `created_at`, `updated_at` Rails bookkeeping columns are dropped.
#   * `created_at_ms` / `updated_at_ms` (Convex epoch-ms fields renamed to
#     avoid Rails collisions) serialize back as `createdAt` / `updatedAt`.
#   * Devise/secret columns are never serialized.
#   * Foreign-key columns (`*_id`) serialize as strings (Convex ids are
#     strings).
#   * jsonb columns pass through verbatim.
class ConvexDoc
  EXCLUDED_COLUMNS = %w[
    id created_at updated_at
    encrypted_password reset_password_token reset_password_sent_at remember_created_at
  ].freeze

  RENAMED_COLUMNS = {
    "created_at_ms" => "createdAt",
    "updated_at_ms" => "updatedAt"
  }.freeze

  def self.render(record)
    return nil if record.nil?

    doc = {
      "_id" => record.id.to_s,
      "_creationTime" => record.created_at.to_f * 1000
    }
    record.attributes.each do |column, value|
      next if EXCLUDED_COLUMNS.include?(column)

      key = RENAMED_COLUMNS[column] || column.camelize(:lower)
      value = value.to_s if foreign_key?(column) && !value.nil?
      doc[key] = value
    end
    doc
  end

  def self.render_many(records)
    records.map { |record| render(record) }
  end

  # Only true foreign keys get stringified; je_id & friends are already
  # strings, so to_s is a no-op there, but we keep the check explicit.
  def self.foreign_key?(column)
    column == "listing_id" || column == "moderator_id"
  end
  private_class_method :foreign_key?
end
