FactoryBot.define do
  factory :listing do
    sequence(:je_id) { |n| "JE#{n.to_s.rjust(8, "0")}" }
    title { "Luxury Villa with Sea View" }
    moderation_status { "pending" }
    imported_at { 1_750_000_000_000 }
  end
end
