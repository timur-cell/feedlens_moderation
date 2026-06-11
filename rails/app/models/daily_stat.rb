class DailyStat < ApplicationRecord
  validates :date, presence: true, uniqueness: true
  validates :total, presence: true
  validates :approved, presence: true
  validates :rejected, presence: true
  validates :noticed, presence: true
  validates :manual, presence: true
  validates :llm_calls, presence: true
end
