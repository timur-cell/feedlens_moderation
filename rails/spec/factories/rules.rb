FactoryBot.define do
  factory :rule do
    sequence(:name) { |n| "rule_#{n}" }
    display_name { "Test Rule" }
    category { "simple_code" }
    tier { "auto" }
    enabled { true }
    action { "reject" }
    priority { 10 }
    config { {} }
  end
end
