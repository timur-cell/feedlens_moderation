class ModerationList < ApplicationRecord
  validates :name, presence: true, uniqueness: true
  validates :display_name, presence: true
  validates :category, presence: true
  validates :item_count, presence: true
  validates :updated_at_ms, presence: true
end
