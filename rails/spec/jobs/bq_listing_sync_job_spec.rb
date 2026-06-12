require "rails_helper"

RSpec.describe BqListingSyncJob do
  it "delegates to the BigQuery sync service" do
    expect(Listings::BqSync).to receive(:call).and_return(created: 3, skipped: 0, errors: 0)

    expect(described_class.perform_now).to eq(created: 3, skipped: 0, errors: 0)
  end
end
