FactoryBot.define do
  factory :message_template do
    sequence(:name) { |n| "template_#{n}" }
    display_name { "Test Template" }
    category { "reject" }
    body { "Your listing does not meet our quality standards." }
  end
end
