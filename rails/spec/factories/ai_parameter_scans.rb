FactoryBot.define do
  factory :ai_parameter_scan do
    listing
    je_id { listing.je_id }
    verdict { "ok" }
    flags { [] }
    flag_count { 0 }
    summary { "No issues found." }
    confidence { 0.95 }
    model { "claude-haiku-4-5-20251001" }
    scanned_at { 1_750_000_000_000 }
  end
end
