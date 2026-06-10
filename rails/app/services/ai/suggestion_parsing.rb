require "json"

module Ai
  # Shared defensive parsing for the rule/list suggesters: direct JSON parse,
  # then first-{...}-block extraction, then a descriptive error (port of the
  # try/catch fallback in convex/rulesAi.ts and convex/listsAi.ts).
  module SuggestionParsing
    class SuggestionParseError < StandardError; end

    module_function

    def parse_suggestion_json(text)
      JSON.parse(text.strip)
    rescue JSON::ParserError
      json_match = text[/\{[\s\S]*\}/]
      begin
        return JSON.parse(json_match) if json_match
      rescue JSON::ParserError
        # fall through to the error below
      end
      raise SuggestionParseError, "Failed to parse AI suggestion: #{text[0, 200]}"
    end
  end
end
