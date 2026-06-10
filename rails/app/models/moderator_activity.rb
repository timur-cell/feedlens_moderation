class ModeratorActivity < ApplicationRecord
  belongs_to :moderator

  validates :moderator_name, presence: true
  validates :action, presence: true
  validates :timestamp, presence: true
end
