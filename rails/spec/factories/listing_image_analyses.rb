FactoryBot.define do
  factory :listing_image_analysis do
    sequence(:je_id) { |n| "JE#{n.to_s.rjust(8, "0")}" }
    title { "Luxury Villa with Sea View" }
    total_images { 10 }
    analyzed_images { 5 }
    analyzed_at { 1_750_000_000_000 }
  end
end
