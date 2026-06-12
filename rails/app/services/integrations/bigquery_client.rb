module Integrations
  # Read-only BigQuery access for the listing sync. Enabled only when the
  # service-account key file referenced by GOOGLE_APPLICATION_CREDENTIALS
  # exists; the gem is required lazily so web boot stays lean.
  class BigqueryClient
    class << self
      def configured?
        credentials_path.present? && File.exist?(credentials_path)
      end

      # Runs a parameterized query, returns an Array of symbol-keyed Hashes.
      def query(sql, params: {})
        require "google/cloud/bigquery"

        bigquery = Google::Cloud::Bigquery.new(credentials: credentials_path)
        bigquery.query(sql, params: params).all.to_a
      end

      private

      def credentials_path
        ENV["GOOGLE_APPLICATION_CREDENTIALS"]
      end
    end
  end
end
