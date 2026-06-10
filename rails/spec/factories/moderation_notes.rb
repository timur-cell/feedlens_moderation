FactoryBot.define do
  factory :moderation_note do
    listing
    je_id { listing.je_id }
    author_name { "Test Moderator" }
    content { "Checked manually, looks fine." }
    created_at_ms { 1_750_000_000_000 }
  end
end
