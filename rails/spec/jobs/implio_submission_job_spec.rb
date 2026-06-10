require "rails_helper"

RSpec.describe ImplioSubmissionJob do
  it "submits the moderation result through the Implio client" do
    moderation_result = create(:moderation_result)
    expect(Integrations::ImplioClient).to receive(:submit_result)
      .with(moderation_result)
      .and_return(success: true, stubbed: true)

    described_class.perform_now(moderation_result.id)
  end

  it "performs zero HTTP in default stub mode" do
    moderation_result = create(:moderation_result)

    with_env("IMPLIO_STUB" => nil) do
      expect(described_class.perform_now(moderation_result.id)).to eq(success: true, stubbed: true)
    end
    expect(WebMock).not_to have_requested(:post, "https://api.implio.com/v1/ads")
  end

  it "ignores missing records" do
    expect(Integrations::ImplioClient).not_to receive(:submit_result)
    expect { described_class.perform_now(-1) }.not_to raise_error
  end
end
