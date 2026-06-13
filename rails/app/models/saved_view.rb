class SavedView < ApplicationRecord
  belongs_to :moderator

  validates :name, presence: true
  validates :scope, presence: true
end
