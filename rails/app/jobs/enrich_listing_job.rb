class EnrichListingJob < ApplicationJob
  queue_as :default

  def perform(je_id)
    # implemented by the integrations track
  end
end
