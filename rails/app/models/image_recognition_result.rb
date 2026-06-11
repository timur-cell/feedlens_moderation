class ImageRecognitionResult < ApplicationRecord
  belongs_to :listing, optional: true

  validates :je_id, presence: true
  validates :title, presence: true
  validates :llm, presence: true
  validates :analyzed_at, presence: true
end
