class Rule < ApplicationRecord
  CATEGORIES = %w[simple_code hybrid_vision auto_ai former_manual internal accuracy].freeze
  TIERS = %w[auto verify manual].freeze
  ACTIONS = %w[reject notice flag approve].freeze

  validates :name, presence: true, uniqueness: true
  validates :display_name, presence: true
  validates :category, presence: true, inclusion: { in: CATEGORIES }
  validates :tier, presence: true, inclusion: { in: TIERS }
  validates :action, presence: true, inclusion: { in: ACTIONS }
  validates :priority, presence: true
  validates :enabled, inclusion: { in: [ true, false ] }
end
