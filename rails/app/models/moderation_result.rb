class ModerationResult < ApplicationRecord
  OUTCOMES = %w[approved rejected notice manual].freeze

  belongs_to :listing

  validates :je_id, presence: true
  validates :outcome, presence: true, inclusion: { in: OUTCOMES }
  validates :processed_at, presence: true
  validates :llm_triggered, inclusion: { in: [ true, false ] }
end
