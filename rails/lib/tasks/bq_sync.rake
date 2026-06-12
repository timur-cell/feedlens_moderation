namespace :bq do
  desc "Run the daily BigQuery listing sync once (cron path: ES/PT, cap 300, advances the watermark)"
  task sync: :environment do
    puts Listings::BqSync.call.inspect
  end

  # On-demand test harness — does NOT touch the cron watermark. Use it to try
  # the pipeline at larger volume or other markets before widening the cron.
  #   COUNTRIES=ES,PT,FR,IT LIMIT=1000 DAYS=14 bin/rails bq:test
  # Defaults: COUNTRIES=ES,PT  LIMIT=100  DAYS=7. Tags rows batch_id
  # bq-test-<date> (view in the UI, then `rake bq:test_purge`). Moderation
  # runs the full engine incl. vision/LLM on triggered listings → real
  # Anthropic spend that scales with LIMIT.
  desc "Test the BQ sync on arbitrary countries/volume (ENV: COUNTRIES, LIMIT, DAYS) without touching the cron watermark"
  task test: :environment do
    countries = (ENV["COUNTRIES"].presence || "ES,PT").split(",")
    limit = (ENV["LIMIT"].presence || "100").to_i
    days = (ENV["DAYS"].presence || "7").to_i
    result = Listings::BqSync.test_run(countries: countries, limit: limit, since: days.days.ago)
    puts JSON.pretty_generate(result)
  end

  desc "Delete all bq-test-* listings created by bq:test (cascades to their moderation results)"
  task test_purge: :environment do
    scope = Listing.where("batch_id LIKE 'bq-test-%'")
    count = scope.count
    scope.destroy_all
    puts "Purged #{count} bq-test listings"
  end
end
