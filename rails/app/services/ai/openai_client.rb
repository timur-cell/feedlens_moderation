require "net/http"
require "json"

module Ai
  # Thin Net::HTTP client for the OpenAI Chat Completions API (GPT-4o vision
  # fallback). Mirrors the fetch("https://api.openai.com/v1/chat/completions")
  # calls in convex/imageRecognitionActions.ts.
  class OpenaiClient
    API_URL = "https://api.openai.com/v1/chat/completions".freeze
    DEFAULT_MODEL = "gpt-4o".freeze
    OPEN_TIMEOUT = 15
    READ_TIMEOUT = 120

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
      def chat_completions(messages:, model: DEFAULT_MODEL, max_tokens: 1024, temperature: nil)
        api_key = ENV["OPENAI_API_KEY"].to_s
        raise MissingApiKeyError, "No OPENAI_API_KEY configured" if api_key.empty?

        body = { model: model, max_tokens: max_tokens, messages: messages }
        body[:temperature] = temperature unless temperature.nil?

        uri = URI(API_URL)
        response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                                   open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |http|
          request = Net::HTTP::Post.new(uri)
          request["Authorization"] = "Bearer #{api_key}"
          request["Content-Type"] = "application/json"
          request.body = JSON.generate(body)
          http.request(request)
        end

        unless response.is_a?(Net::HTTPSuccess)
          raise ApiError.new("OpenAI API error #{response.code}: #{response.body}",
                             status: response.code.to_i, body: response.body)
        end

        JSON.parse(response.body)
      end

      def text_content(response)
        response.dig("choices", 0, "message", "content") || ""
      end

      def prompt_tokens(response)
        response.dig("usage", "prompt_tokens") || 0
      end

      def completion_tokens(response)
        response.dig("usage", "completion_tokens") || 0
      end
    end
  end
end
