FactoryBot.define do
  factory :moderation_list do
    sequence(:name) { |n| "list_#{n}" }
    display_name { "Test List" }
    category { "exceptions" }
    items { [] }
    item_count { 0 }
    updated_at_ms { 1_750_000_000_000 }
  end
end
