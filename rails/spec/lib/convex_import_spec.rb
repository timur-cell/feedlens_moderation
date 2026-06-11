require "rails_helper"
require "rake"

RSpec::Matchers.define_negated_matcher :not_change, :change

RSpec.describe "convex:import" do
  let(:task) do
    Rails.application.load_tasks unless Rake::Task.task_defined?("convex:import")
    Rake::Task["convex:import"].tap(&:reenable)
  end

  # Synthetic export in the flat <table>.jsonl layout (the production bot's
  # format); the nested <table>/documents.jsonl layout is covered too.
  def write_export(dir)
    creation = 1.7e12
    File.write(File.join(dir, "listings.jsonl"), <<~JSONL)
      {"_id":"lst_abc","_creationTime":#{creation},"jeId":"90000001","title":"Prod Villa","country":"Spain","moderationStatus":"approved","importedAt":#{creation.to_i},"rawData":{"source":"prod"}}
      {"_id":"lst_def","_creationTime":#{creation},"jeId":"90000002","title":"Prod Flat","country":"Italy","moderationStatus":"rejected","importedAt":#{creation.to_i}}
    JSONL
    File.write(File.join(dir, "moderationResults.jsonl"), <<~JSONL)
      {"_id":"res_1","_creationTime":#{creation},"jeId":"90000001","listingId":"lst_abc","outcome":"approved","processedAt":#{creation.to_i},"ruleMatches":[],"llmTriggered":false}
    JSONL
    File.write(File.join(dir, "moderators.jsonl"), <<~JSONL)
      {"_id":"mod_1","_creationTime":#{creation},"name":"Prod Admin","email":"prod-admin@example.com","role":"admin","status":"active","createdAt":#{creation.to_i},"actionCount":7}
    JSONL
    File.write(File.join(dir, "moderatorActivity.jsonl"), <<~JSONL)
      {"_id":"act_1","_creationTime":#{creation},"moderatorId":"mod_1","moderatorName":"Prod Admin","action":"login","timestamp":#{creation.to_i}}
    JSONL
    # Overrides a seeded rule by name (prod-edited config wins on import)
    File.write(File.join(dir, "rules.jsonl"), <<~JSONL)
      {"_id":"rul_1","_creationTime":#{creation},"name":"low_lqi","displayName":"Low LQI (prod)","category":"simple_code","tier":"auto","action":"reject","enabled":false,"priority":31,"matchCount":123,"config":{"conditions":[{"field":"lqi","operator":"<","value":25}]}}
    JSONL
  end

  it "imports a flat-layout export with upserts, FK remap and idempotent re-runs" do
    create(:rule, name: "low_lqi", display_name: "Low LQI", enabled: true, match_count: 0)

    Dir.mktmpdir do |dir|
      write_export(dir)

      expect {
        task.invoke(dir)
        task.reenable
      }.to change(Listing, :count).by(2)
         .and change(ModerationResult, :count).by(1)
         .and change(Moderator, :count).by(1)
         .and change(ModeratorActivity, :count).by(1)
         .and not_change(Rule, :count)

      listing = Listing.find_by!(je_id: "90000001")
      expect(listing.raw_data).to eq({ "source" => "prod" })
      expect(listing.created_at).to be_within(1.second).of(Time.zone.at(1.7e12 / 1000))

      # Convex listingId remapped to the new integer FK
      result = ModerationResult.find_by!(je_id: "90000001")
      expect(result.listing_id).to eq(listing.id)

      moderator = Moderator.find_by!(email: "prod-admin@example.com")
      expect(moderator.encrypted_password).to be_present
      expect(moderator.action_count).to eq(7)
      expect(ModeratorActivity.find_by!(action: "login").moderator_id).to eq(moderator.id)

      # Prod rule config wins over the seeded row (upsert by name)
      rule = Rule.find_by!(name: "low_lqi")
      expect(rule.display_name).to eq("Low LQI (prod)")
      expect(rule.enabled).to be(false)
      expect(rule.match_count).to eq(123)

      # Second run is idempotent
      expect {
        task.invoke(dir)
        task.reenable
      }.to not_change(Listing, :count)
         .and not_change(ModerationResult, :count)
         .and not_change(Moderator, :count)
         .and not_change(Rule, :count)
    end
  end
end
