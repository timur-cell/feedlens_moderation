class MessageTemplate < ApplicationRecord
  CATEGORIES = %w[reject notice].freeze

  validates :name, presence: true, uniqueness: true
  validates :display_name, presence: true
  validates :category, presence: true, inclusion: { in: CATEGORIES }
  validates :body, presence: true
end
