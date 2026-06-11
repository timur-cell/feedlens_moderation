# Background enrichment of a minimal listing record with full JE data
# (fill-missing-only). Mirrors the scheduled enrichListing internal action
# in convex/fetchListing.ts.
class EnrichListingJob < ApplicationJob
  queue_as :default

  def perform(je_id)
    result = Listings::FetchAndModerate.enrich_listing(je_id)
    unless result[:success]
      Rails.logger.warn("EnrichListingJob failed for #{je_id}: #{result[:error]}")
    end
    result
  end
end
