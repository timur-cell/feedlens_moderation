require "rails_helper"

# Phase 3 reliability (review finding S7): the persist sequence is atomic and
# only one moderation run per listing can be in flight at a time.
RSpec.describe Moderation::Runner do
  around { |example| with_env("ANTHROPIC_API_KEY" => nil, "IMPLIO_STUB" => nil) { example.run } }

  describe "persist atomicity" do
    it "rolls back the ModerationResult when the listing status update fails" do
      listing = create(:listing, moderation_status: "pending")

      allow_any_instance_of(Listing).to receive(:update!)
        .and_raise(ActiveRecord::RecordInvalid.new(listing))

      expect { described_class.call(listing) }.to raise_error(ActiveRecord::RecordInvalid)
      expect(ModerationResult.count).to eq(0)
      expect(listing.reload.moderation_status).to eq("pending")
    end

    it "increments rule stats atomically inside the same transaction" do
      rule = create(:rule, name: "cheap", category: "simple_code", tier: "auto", action: "reject",
                    match_count: 41,
                    config: { "conditions" => [ { "field" => "price", "operator" => "<", "value" => 490_000 } ] })
      listing = create(:listing, price: 100_000)

      result = described_class.call(listing)

      expect(result[:outcome]).to eq("rejected")
      rule.reload
      expect(rule.match_count).to eq(42)
      expect(rule.last_matched_at).to be_present
    end
  end

  describe "per-listing advisory lock" do
    it "skips the run when another session already holds the listing's lock" do
      listing = create(:listing, moderation_status: "pending")

      # Transactional tests pin one connection for the whole pool, so a pool
      # checkout would be the SAME session (advisory locks are re-entrant per
      # session). Use a raw PG connection to get a genuinely separate session.
      config = ActiveRecord::Base.connection_db_config.configuration_hash
      other = PG.connect(
        host: config[:host], port: config[:port], dbname: config[:database],
        user: config[:username], password: config[:password]
      )
      begin
        got = other.exec(
          "SELECT pg_try_advisory_lock(#{described_class::ADVISORY_LOCK_CLASS}, #{listing.id})"
        ).getvalue(0, 0)
        expect(got).to eq("t")

        result = described_class.call(listing)

        expect(result[:skipped]).to eq("concurrent_run")
        expect(result[:outcome]).to eq("pending")
        expect(ModerationResult.count).to eq(0)
      ensure
        other.close
      end
    end

    it "releases the lock after a run so the next run proceeds" do
      listing = create(:listing, moderation_status: "pending")

      first = described_class.call(listing)
      expect(first[:skipped]).to be_nil

      second = described_class.call(listing)
      expect(second[:skipped]).to be_nil
      expect(ModerationResult.count).to eq(2)
    end
  end
end
