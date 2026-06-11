# Background submission of a persisted moderation decision to Implio.
# Stub-aware via Integrations::ImplioClient (IMPLIO_STUB defaults ON).
class ImplioSubmissionJob < ApplicationJob
  queue_as :default

  def perform(moderation_result_id)
    moderation_result = ModerationResult.find_by(id: moderation_result_id)
    return if moderation_result.nil?

    Integrations::ImplioClient.submit_result(moderation_result)
  end
end
