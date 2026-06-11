class Listing < ApplicationRecord
  MODERATION_STATUSES = %w[pending approved rejected notice manual].freeze

  has_many :moderation_results, dependent: :destroy
  has_many :moderation_notes, dependent: :destroy
  has_many :ai_parameter_scans, dependent: :destroy
  has_many :remediation_results, dependent: :destroy
  has_many :image_recognition_results, dependent: :destroy

  validates :je_id, presence: true, uniqueness: true
  validates :title, presence: true
  validates :moderation_status, presence: true, inclusion: { in: MODERATION_STATUSES }
  validates :imported_at, presence: true
end
