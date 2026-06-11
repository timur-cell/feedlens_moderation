require "rails_helper"

RSpec.describe RemediationResult, type: :model do
  it "has a valid factory" do
    expect(build(:remediation_result)).to be_valid
  end

  it "requires a listing" do
    expect(build(:remediation_result, listing: nil, je_id: "JE1")).not_to be_valid
  end

  it "requires je_id, error_count, total_confidence, model and scanned_at" do
    expect(build(:remediation_result, je_id: nil)).not_to be_valid
    expect(build(:remediation_result, error_count: nil)).not_to be_valid
    expect(build(:remediation_result, total_confidence: nil)).not_to be_valid
    expect(build(:remediation_result, model: nil)).not_to be_valid
    expect(build(:remediation_result, scanned_at: nil)).not_to be_valid
  end

  it "requires has_fixable_errors to be boolean" do
    expect(build(:remediation_result, has_fixable_errors: nil)).not_to be_valid
    expect(build(:remediation_result, has_fixable_errors: true)).to be_valid
  end
end
