class ModerationNote < ApplicationRecord
  belongs_to :listing

  validates :je_id, presence: true
  validates :author_name, presence: true
  validates :content, presence: true
  validates :created_at_ms, presence: true
end
