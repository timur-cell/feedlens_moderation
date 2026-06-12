# Daily BigQuery listing ingestion (scheduled in config/recurring.yml).
# No-ops with a log line when GOOGLE_APPLICATION_CREDENTIALS is not
# configured, so deployments without the key file are unaffected.
class BqListingSyncJob < ApplicationJob
  queue_as :default

  def perform
    Listings::BqSync.call
  end
end
