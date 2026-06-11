FactoryBot.define do
  factory :moderator_activity do
    moderator
    moderator_name { moderator.name }
    action { "approve_listing" }
    timestamp { 1_750_000_000_000 }
  end
end
