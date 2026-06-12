# Runs the moderation pipeline for an already-persisted listing off the
# request thread. This is the missing piece that let the whole AI pipeline
# (param scan, vision, LLM verification) run inline on Puma threads — at feed
# burst volumes that starved web threads. Enqueue this instead of calling
# Moderation::Runner.call from a controller when a synchronous result is not
# required.
class ModerateListingJob < ApplicationJob
  queue_as :default

  def perform(listing_id, moderator_id = nil)
    listing = Listing.find_by(id: listing_id)
    return if listing.nil?

    moderator = moderator_id && Moderator.find_by(id: moderator_id)
    Moderation::Runner.call(listing, moderator: moderator)
  end
end
