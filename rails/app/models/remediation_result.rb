class RemediationResult < ApplicationRecord
  belongs_to :listing

  validates :je_id, presence: true
  validates :error_count, presence: true
  validates :total_confidence, presence: true
  validates :model, presence: true
  validates :scanned_at, presence: true
  validates :has_fixable_errors, inclusion: { in: [ true, false ] }
end
