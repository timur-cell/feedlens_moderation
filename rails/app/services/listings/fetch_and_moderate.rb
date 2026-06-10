module Listings
  # Fetches listings from the JE mobile API (with fallbacks), creates/updates
  # local records and runs moderation. Mirrors convex/fetchListing.ts.
  class FetchAndModerate
    def self.call(inputs:, moderator: nil)
      raise NotImplementedError, "implemented by the integrations track"
    end
  end
end
