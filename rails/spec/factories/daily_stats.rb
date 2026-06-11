FactoryBot.define do
  factory :daily_stat do
    sequence(:date) { |n| (Date.new(2026, 1, 1) + n).iso8601 }
    total { 0 }
    approved { 0 }
    rejected { 0 }
    noticed { 0 }
    manual { 0 }
    llm_calls { 0 }
  end
end
