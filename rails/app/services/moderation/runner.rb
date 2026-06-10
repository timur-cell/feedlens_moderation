module Moderation
  # Orchestrates a full moderation run for a listing: rule engine, optional
  # vision/LLM verification, persistence, rule stats and Implio submission.
  # Mirrors the moderateListing action in convex/moderation.ts.
  class Runner
    def self.call(listing, moderator: nil)
      raise NotImplementedError, "implemented by the integrations track"
    end
  end
end
