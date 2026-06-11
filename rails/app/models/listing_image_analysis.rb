class ListingImageAnalysis < ApplicationRecord
  validates :je_id, presence: true
  validates :title, presence: true
  validates :total_images, presence: true
  validates :analyzed_images, presence: true
  validates :analyzed_at, presence: true
end
