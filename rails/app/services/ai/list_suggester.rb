require "json"

module Ai
  # Port of convex/listsAi.ts suggestList: AI-assisted moderation list
  # generation from a natural-language description.
  class ListSuggester
    MODEL = "claude-haiku-4-5-20251001".freeze
    MAX_TOKENS = 4000

    def self.call(description:)
      prompt = <<~PROMPT.chomp
        You are an expert at creating moderation lists for FeedLens, JamesEdition's listing moderation system.

        FeedLens moderates luxury listings on jamesedition.com. Lists are used by moderation rules to match patterns in listing data (titles, descriptions, office names, feed sources, etc.).

        The user wants to create a new moderation list. Based on their description, generate the complete list with items.

        EXISTING LIST CATEGORIES (use one of these or suggest a new one):
        - "automotive" — car brands, models, dealer terms
        - "exceptions" — whitelisted offices, feed sources
        - "image_quality" — watermark texts, low-quality indicators
        - "location" — city names, regions, areas
        - "location.alicante", "location.malaga" — specific location subcategories
        - "real_estate.availability" — sold/rented/reserved keywords
        - "real_estate.development" — under construction, off-plan keywords
        - "real_estate.property_type" — property type keywords
        - "real_estate.quality" — quality-related terms

        ITEM TYPES:
        - "exact" — exact string match (case-insensitive comparison in rules)
        - "regex" — regex pattern match. For regex items, also provide "pattern" (the regex without delimiters) and optional "flags" (e.g. "i" for case-insensitive)

        GUIDELINES:
        - Generate comprehensive lists with real, useful items
        - For location lists: include actual city/area names from that region
        - For keyword lists: include common variations, misspellings, multilingual terms
        - For brand lists: include major brands relevant to luxury market
        - Use "exact" type for simple words/phrases, "regex" for pattern matching
        - Aim for 10-50 items depending on the topic (be thorough)
        - The list name should be snake_case and descriptive

        USER'S DESCRIPTION: "#{description}"

        Generate a complete list. Respond with ONLY valid JSON (no markdown, no backticks):
        {
          "name": "<snake_case_unique_name>",
          "displayName": "<Human Readable Name>",
          "description": "<Brief description of what the list contains and how it's used>",
          "category": "<category>",
          "items": [
            { "value": "<item text>", "type": "exact" },
            { "value": "<regex pattern>", "type": "regex", "pattern": "<regex without delimiters>", "flags": "i" }
          ]
        }
      PROMPT

      response = ClaudeClient.messages(
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [ { role: "user", content: prompt } ]
      )
      text = ClaudeClient.text_content(response)
      SuggestionParsing.parse_suggestion_json(text)
    end
  end
end
