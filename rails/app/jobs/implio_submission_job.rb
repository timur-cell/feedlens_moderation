class ImplioSubmissionJob < ApplicationJob
  queue_as :default

  def perform(moderation_result_id)
    # implemented by the integrations track
  end
end
