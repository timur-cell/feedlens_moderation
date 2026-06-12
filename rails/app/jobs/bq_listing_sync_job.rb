# Daily BigQuery listing ingestion (scheduled in config/recurring.yml).
# No-ops with a log line when GOOGLE_APPLICATION_CREDENTIALS is not
# configured, so deployments without the key file are unaffected.
class BqListingSyncJob < ApplicationJob
  queue_as :default

  def perform
    result = Listings::BqSync.call
    # Surface run-level failures (BQ query error, fully-failed batch) to
    # Solid Queue as a FailedExecution instead of a silently "successful"
    # job — otherwise a broken sync is invisible outside the logs.
    raise "BQ sync failed: #{result.inspect}" if result[:error]

    result
  end
end
