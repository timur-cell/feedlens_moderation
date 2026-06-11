require "json"

module Ai
  # Port of convex/rulesAi.ts suggestRule: AI-assisted moderation rule
  # generation from a natural-language description.
  class RuleSuggester
    MODEL = "claude-haiku-4-5-20251001".freeze
    MAX_TOKENS = 2000

    def self.call(description:)
      prompt = <<~PROMPT.chomp
        You are an expert at creating moderation rules for FeedLens, JamesEdition's listing moderation system.

        The user wants to create a new rule. Based on their description, generate the complete rule configuration.

        AVAILABLE LISTING FIELDS:
        - priceUsd (number) — listing price in USD
        - price (number) — listing price in original currency
        - priceOnRequest (boolean) — price on request flag
        - country (string) — country name or ISO code (ES, IT, PT, FR, GR, US, etc.)
        - city (string) — city name
        - category (string) — "real_estate", "cars", etc.
        - realEstateType (string) — "villa", "apartment", "house", "plot", "land", "commercial", etc.
        - imageCount (number) — number of images
        - avgImageWidth (number), avgImageHeight (number) — average image dimensions
        - lqi (number) — listing quality index 0-100
        - descriptionLength (number) — description character count
        - description (string) — listing description text
        - title (string) — listing title
        - livingArea (number) — living area in sqm
        - landArea (number) — land area in sqm
        - bedrooms (number), bathrooms (number)
        - office (string) — office ID
        - officeGroupName (string) — office group name
        - officeSubscription (string) — "freemium", "basic", "premium"
        - feedSource (string) — "Kyero", "DealerCenter", "OpenimmoMultiOfficeXML", etc.
        - rental (boolean) — is rental
        - outdated (boolean) — listing outdated flag
        - pricePerSqm (number) — price per sqm
        - chatGptConclusion (string) — GPT assessment conclusion
        - chatGptPropertyCondition (number) — GPT condition score 1-5
        - chatGptWatermarkShare (number) — watermark coverage percentage
        - chatGptWatermarkText (string) — detected watermark text
        - chatGptImageQuality (string) — image quality assessment
        - chatGptImageType (string) — "photo", "render", "ai_generated"
        - year (number) — for cars: model year

        RULE CONFIG STRUCTURE:
        {
          "conditions": [
            { "field": "<field_name>", "operator": "<op>", "value": <value> }
          ],
          "requireAll": true/false, // true = AND all conditions, false = OR any condition
          "countryFilter": ["ES", "IT", ...], // optional: only apply to these countries
          "excludeCountries": ["US", ...], // optional: exclude countries
          "categoryFilter": ["real_estate", "cars"], // optional: category filter
          "accountTypeFilter": ["freemium"], // optional: subscription filter
          "excludeAccountTypes": ["premium"], // optional: exclude subscription types
          "typeFilter": ["villa", "apartment"], // optional: RE type filter
          "excludeTypes": ["plot", "land"], // optional: exclude RE types
          "officeFilter": [12345], // optional: office ID filter
          "groupFilter": ["GroupName"], // optional: office group filter
          "feedSourceFilter": ["Kyero"], // optional: feed source filter
          "listRef": "list_name", // optional: reference to a moderation list (text matching)
          "fields": ["title", "description"], // optional: which fields to check against lists/patterns
          "patterns": ["regex1", "regex2"] // optional: regex patterns (for auto_ai category)
        }

        OPERATORS: "<", ">", "<=", ">=", "==", "!=", "contains", "not_contains", "matches" (regex)

        CATEGORIES:
        - "simple_code" — pure field checks (price, LQI, images, etc.)
        - "auto_ai" — regex/text matching rules
        - "hybrid_vision" — rules that trigger AI vision analysis
        - "former_manual" — rules that were previously manual in Implio
        - "internal" — internal system rules

        TIERS:
        - "auto" — high confidence, auto-decide
        - "verify" — medium confidence, LLM verification
        - "manual" — low confidence, human review

        ACTIONS:
        - "reject" — reject the listing
        - "notice" — approve with a notice to seller
        - "flag" — flag for manual review

        USER'S DESCRIPTION: "#{description}"

        Generate a complete rule. Respond with ONLY valid JSON (no markdown, no backticks):
        {
          "name": "<snake_case_unique_name>",
          "displayName": "<Human Readable Name>",
          "description": "<Brief description of what the rule does>",
          "category": "<category>",
          "tier": "<tier>",
          "enabled": false,
          "action": "<action>",
          "priority": <number 10-100>,
          "config": { <rule config object> },
          "sellerMessage": "<Message to show the seller when this rule triggers>"
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
