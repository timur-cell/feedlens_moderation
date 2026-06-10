FactoryBot.define do
  factory :image_recognition_result do
    sequence(:je_id) { |n| "JE#{n.to_s.rjust(8, "0")}" }
    title { "Luxury Villa with Sea View" }
    image_urls { [] }
    llm { "claude-haiku-4-5-20251001" }
    analyzed_at { 1_750_000_000_000 }
  end
end
