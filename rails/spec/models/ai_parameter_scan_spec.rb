require "rails_helper"

RSpec.describe AiParameterScan, type: :model do
  it "has a valid factory" do
    expect(build(:ai_parameter_scan)).to be_valid
  end

  it "requires a listing" do
    expect(build(:ai_parameter_scan, listing: nil, je_id: "JE1")).not_to be_valid
  end

  it "requires a known verdict" do
    expect(build(:ai_parameter_scan, verdict: nil)).not_to be_valid
    expect(build(:ai_parameter_scan, verdict: "bogus")).not_to be_valid

    %w[reject review ok].each do |verdict|
      expect(build(:ai_parameter_scan, verdict: verdict)).to be_valid
    end
  end

  it "requires je_id, flag_count, summary, confidence, model and scanned_at" do
    expect(build(:ai_parameter_scan, je_id: nil)).not_to be_valid
    expect(build(:ai_parameter_scan, flag_count: nil)).not_to be_valid
    expect(build(:ai_parameter_scan, summary: nil)).not_to be_valid
    expect(build(:ai_parameter_scan, confidence: nil)).not_to be_valid
    expect(build(:ai_parameter_scan, model: nil)).not_to be_valid
    expect(build(:ai_parameter_scan, scanned_at: nil)).not_to be_valid
  end
end
