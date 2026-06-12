# Fetches a single listing from the JE sources and moderates it off the
# request thread. Used by the async path of POST /api/moderate-by-id so a
# large batch (or a feed burst) does not hold a Puma thread for the full
# fetch + vision + LLM chain per input.
class FetchAndModerateJob < ApplicationJob
  queue_as :default

  def perform(input, moderator_id = nil)
    moderator = moderator_id && Moderator.find_by(id: moderator_id)
    Listings::FetchAndModerate.process_one(input.to_s, moderator: moderator)
  end
end
