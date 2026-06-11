class ApplicationJob < ActiveJob::Base
  # Retry on transient DB deadlocks with backoff instead of failing the job.
  retry_on ActiveRecord::Deadlocked, wait: :polynomially_longer, attempts: 3

  # If the underlying record was deleted before the job ran, drop it quietly
  # rather than retrying forever.
  discard_on ActiveJob::DeserializationError
end
