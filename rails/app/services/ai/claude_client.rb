require "net/http"
require "json"

module Ai
  # Thin Net::HTTP client for the Anthropic Messages API.
  # Mirrors the fetch("https://api.anthropic.com/v1/messages") calls in
  # convex/*.ts (x-api-key auth + anthropic-version 2023-06-01).
  class ClaudeClient
    API_URL = "https://api.anthropic.com/v1/messages".freeze
    ANTHROPIC_VERSION = "2023-06-01".freeze
    OPEN_TIMEOUT = 15
    READ_TIMEOUT = 120

    # Transient failures (rate limits, server errors, overload) are retried
    # with a short backoff before giving up; anything else raises immediately.
    RETRYABLE_STATUSES = [ 429, 500, 502, 503, 529 ].freeze
    RETRY_DELAYS = [ 1, 3 ].freeze

    class MissingApiKeyError < StandardError; end

    class ApiError < StandardError
      attr_reader :status, :body

      def initialize(message, status: nil, body: nil)
        super(message)
        @status = status
        @body = body
      end
    end

    class << self
      # POST /v1/messages. `messages` is the raw Anthropic messages array
      # (text and/or image content blocks). Returns the parsed response Hash.
      def messages(model:, max_tokens:, messages:, temperature: nil)
        api_key = ENV["ANTHROPIC_API_KEY"].to_s
        raise MissingApiKeyError, "No Anthropic API key configured" if api_key.empty?

        body = { model: model, max_tokens: max_tokens, messages: messages }
        body[:temperature] = temperature unless temperature.nil?
        payload = JSON.generate(body)

        attempts = 0
        begin
          response = post_request(api_key, payload)

          unless response.is_a?(Net::HTTPSuccess)
            raise ApiError.new("Claude API error #{response.code}: #{response.body}",
                               status: response.code.to_i, body: response.body)
          end

          JSON.parse(response.body)
        rescue ApiError => e
          raise unless RETRYABLE_STATUSES.include?(e.status) && attempts < RETRY_DELAYS.length

          pause(RETRY_DELAYS[attempts])
          attempts += 1
          retry
        rescue Net::OpenTimeout, Net::ReadTimeout, Errno::ECONNRESET, SocketError => e
          raise ApiError.new("Claude API connection error: #{e.message}") unless attempts < RETRY_DELAYS.length

          pause(RETRY_DELAYS[attempts])
          attempts += 1
          retry
        end
      end

      # First text block of a Messages API response (the TS code does
      # data.content?.find((b) => b.type === "text")?.text || "").
      def text_content(response)
        block = (response["content"] || []).find { |b| b["type"] == "text" }
        block&.dig("text") || ""
      end

      def input_tokens(response)
        response.dig("usage", "input_tokens") || 0
      end

      def output_tokens(response)
        response.dig("usage", "output_tokens") || 0
      end

      def tokens_used(response)
        input_tokens(response) + output_tokens(response)
      end

      # True when the model hit the max_tokens cap — the decision fields may
      # be missing from the JSON, so callers should treat the response as
      # degraded rather than silently falling back.
      def truncated?(response)
        response["stop_reason"] == "max_tokens"
      end

      private

      def post_request(api_key, payload)
        uri = URI(API_URL)
        Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                        open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |http|
          request = Net::HTTP::Post.new(uri)
          request["content-type"] = "application/json"
          request["x-api-key"] = api_key
          request["anthropic-version"] = ANTHROPIC_VERSION
          request.body = payload
          http.request(request)
        end
      end

      def pause(seconds)
        sleep(seconds)
      end
    end
  end
end
