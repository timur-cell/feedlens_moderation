namespace :bq do
  desc "Run the BigQuery listing sync once (respects the stored watermark)"
  task sync: :environment do
    puts Listings::BqSync.call.inspect
  end
end
