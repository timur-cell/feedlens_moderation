require "rails_helper"

RSpec.describe Integrations::BigqueryClient do
  describe ".configured?" do
    it "is false when the env var is unset" do
      with_env("GOOGLE_APPLICATION_CREDENTIALS" => nil) do
        expect(described_class.configured?).to be(false)
      end
    end

    it "is false when the key file does not exist" do
      with_env("GOOGLE_APPLICATION_CREDENTIALS" => "/nonexistent/key.json") do
        expect(described_class.configured?).to be(false)
      end
    end

    it "is true when the key file exists" do
      Tempfile.create("bq-key") do |file|
        with_env("GOOGLE_APPLICATION_CREDENTIALS" => file.path) do
          expect(described_class.configured?).to be(true)
        end
      end
    end
  end
end
