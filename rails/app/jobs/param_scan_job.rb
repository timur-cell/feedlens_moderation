# Background AI parameter scan for a listing (deterministic checks +
# Claude contextual analysis). Mirrors aiParamScan.scanListingParameters.
class ParamScanJob < ApplicationJob
  queue_as :default

  def perform(listing_id, force_rescan = false)
    listing = Listing.find_by(id: listing_id)
    return if listing.nil?

    Ai::ParamScan.call(listing, force_rescan: force_rescan)
  end
end
