# Machine-managed sync cursors (e.g. the BigQuery listing-ingestion
# watermark). Deliberately not part of Setting: Setting.current merges every
# non-nil column and is exposed through GET/PATCH /api/settings + reset.
class SyncState < ApplicationRecord
  validates :key, presence: true, uniqueness: true
  validates :watermark_at, presence: true
end
