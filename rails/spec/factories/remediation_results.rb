FactoryBot.define do
  factory :remediation_result do
    listing
    je_id { listing.je_id }
    has_fixable_errors { false }
    error_count { 0 }
    total_confidence { 0.0 }
    suggestions { [] }
    model { "claude-haiku-4-5-20251001" }
    scanned_at { 1_750_000_000_000 }
  end
end
