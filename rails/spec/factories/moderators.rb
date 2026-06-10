FactoryBot.define do
  factory :moderator do
    name { "Test Moderator" }
    sequence(:email) { |n| "moderator#{n}@example.com" }
    role { "moderator" }
    status { "active" }
    password { "Password!123" }
  end
end
