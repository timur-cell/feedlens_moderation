class AiParameterScan < ApplicationRecord
  VERDICTS = %w[reject review ok].freeze

  belongs_to :listing

  validates :je_id, presence: true
  validates :verdict, presence: true, inclusion: { in: VERDICTS }
  validates :flag_count, presence: true
  validates :summary, presence: true
  validates :confidence, presence: true
  validates :model, presence: true
  validates :scanned_at, presence: true
end
