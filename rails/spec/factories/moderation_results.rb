FactoryBot.define do
  factory :moderation_result do
    listing
    je_id { listing.je_id }
    outcome { "approved" }
    rule_matches { [] }
    llm_triggered { false }
    processed_at { 1_750_000_000_000 }
  end
end
