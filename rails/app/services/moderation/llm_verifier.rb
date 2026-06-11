require "json"

module Moderation
  # Port of callLlm in convex/moderation.ts: asks Claude to verify the
  # auto_ai / former_manual rule matches for a listing and returns the
  # parsed assessment hash ("scores", "assessment", "recommendation",
  # "confidence", "notice", "model", "tokensUsed").
  #
  # Parse failures fall back to recommendation "manual" with confidence 0.3,
  # exactly like the TS. API failures raise — the caller routes to manual.
  class LlmVerifier
    MAX_TOKENS = 500
    AI_TRIGGER_CATEGORIES = %w[auto_ai former_manual].freeze

    FALLBACK_SCORES = { "condition" => 3, "watermark" => false, "quality" => 0.5, "policyOk" => true }.freeze

    class << self
      # listing: camelCase listing hash (same shape Engine#evaluate takes).
      # matches: engine rule-match hashes (:rule_name/:rule_category/...).
      def call(listing, matches, model:, temperature:)
        prompt = build_prompt(listing, matches)

        response = Ai::ClaudeClient.messages(
          model: model,
          max_tokens: MAX_TOKENS,
          temperature: temperature,
          messages: [ { role: "user", content: prompt } ]
        )
        content = Ai::ClaudeClient.text_content(response)
        tokens_used = Ai::ClaudeClient.tokens_used(response)

        begin
          cleaned = content.gsub(/```json\n?/, "").gsub(/```\n?/, "").strip
          parsed = JSON.parse(cleaned)
          raise JSON::ParserError, "non-object response" unless parsed.is_a?(Hash)

          parsed.merge("model" => model, "tokensUsed" => tokens_used)
        rescue JSON::ParserError
          {
            "scores" => FALLBACK_SCORES.dup,
            "assessment" => content[0, 500],
            "recommendation" => "manual",
            "confidence" => 0.3,
            "model" => model,
            "tokensUsed" => tokens_used
          }
        end
      end

      def build_prompt(listing, matches)
        triggered_rules = matches
          .select { |m| AI_TRIGGER_CATEGORIES.include?(m[:rule_category]) }
          .map { |m| "• [#{m[:rule_category]}] #{m[:rule_name]} (action: #{m[:action]}): #{m[:details]}" }
          .join("\n")

        price_line =
          if truthy(listing["priceUsd"])
            "$#{to_locale_string(listing["priceUsd"])}"
          elsif truthy(listing["price"])
            "#{js_str(listing["price"])} #{listing["currency"] || ""}"
          else
            "Price on request"
          end

        location = [ listing["city"], listing["state"], listing["country"] ].select { |v| truthy(v) }.join(", ")

        <<~PROMPT.chomp
          You are a luxury real estate listing moderator for JamesEdition, the world's largest luxury marketplace.

          Our automated rules have flagged this listing for verification. Your job: determine if the flagged issues are real problems or false positives. Be decisive — only send to manual review when genuinely uncertain.

          LISTING DATA:
          - Title: #{listing["title"]}
          - Price: #{price_line}
          - Location: #{location}
          - Type: #{js_or(listing["realEstateType"], listing["category"], "Unknown")}
          - Images: #{js_str(js_or(listing["imageCount"], 0))}
          - LQI: #{js_str(js_or(listing["lqi"], "N/A"))}
          - Description length: #{js_str(js_or(listing["descriptionLength"], 0))} chars
          #{truthy(listing["description"]) ? "- Description excerpt: #{listing["description"][0, 800]}" : ""}
          #{truthy(listing["livingArea"]) ? "- Living area: #{js_str(listing["livingArea"])} sqm" : ""}
          #{truthy(listing["landArea"]) ? "- Land area: #{js_str(listing["landArea"])} sqm" : ""}
          #{truthy(listing["bedrooms"]) ? "- Bedrooms: #{js_str(listing["bedrooms"])}" : ""}
          #{truthy(listing["bathrooms"]) ? "- Bathrooms: #{js_str(listing["bathrooms"])}" : ""}
          #{truthy(listing["office"]) ? "- Office: #{js_or(listing["officeGroupName"], listing["office"])}" : ""}
          #{truthy(listing["feedSource"]) ? "- Feed source: #{listing["feedSource"]}" : ""}
          #{truthy(listing["chatGptConclusion"]) ? "- Existing GPT assessment: #{listing["chatGptConclusion"]}" : ""}
          #{listing["chatGptPropertyCondition"].nil? ? "" : "- GPT condition score: #{js_str(listing["chatGptPropertyCondition"])}/5#{listing["chatGptPropertyCondition"] == 0 ? " (unidentifiable)" : ""}"}

          FLAGGED RULES TO VERIFY:
          #{truthy(triggered_rules) ? triggered_rules : "None"}

          VERIFICATION GUIDANCE BY RULE TYPE:
          - Price anomalies ($100M+, $50M+low quality): Could be a legitimate ultra-luxury property (castle, island, mega-yacht) or a pricing error. Consider if bedrooms/bathrooms/type justify the price.
          - Data anomalies (living area >10K sqm, <10 sqm, land=living): Likely data entry errors, but castles/estates can have 10K+ sqm. Check if the type/price/location make the values plausible.
          - Content issues (short description, bad condition keywords in title): Short descriptions may be acceptable for high-quality listings with many images. "Bad condition" keywords like "ruin", "renovation needed" signal non-luxury properties.
          - Commercial/sold signals: Check title and description for clear commercial or sold indicators.
          - Car rules: Verify if the car is genuinely luxury/exotic for JamesEdition's market.

          QUALITY STANDARDS:
          - Properties must be in good/acceptable condition (not ruins, derelict, or requiring total renovation)
          - No watermarks covering more than 30% of images
          - No "SOLD" or "UNDER OFFER" properties
          - Must be legitimate luxury properties (minimum $490K USD for real estate)
          - No commercial properties on residential marketplace
          - Descriptions must be meaningful (not just auto-generated filler)
          - Images should be real photos (not AI renders)

          YOUR CONFIDENCE SCORE DETERMINES THE OUTCOME:
          - confidence >= 0.90 → your recommendation executes automatically
          - confidence < 0.90 → listing goes to human moderator for review
          Only give high confidence when you are genuinely sure about the decision.

          Respond with ONLY valid JSON (no markdown):
          {
            "scores": {
              "condition": <1-5 scale, 5=excellent>,
              "watermark": <true/false>,
              "quality": <0-1 overall quality>,
              "policyOk": <true/false>
            },
            "assessment": "<2-3 sentence explanation of your reasoning for each flagged rule>",
            "recommendation": "<approve|reject|notice>",
            "confidence": <0.0-1.0>,
            "notice": "<optional seller message if minor issue, null otherwise>"
          }
        PROMPT
      end

      private

      # JS Number#toLocaleString("en-US"): comma-grouped, up to 3 decimals.
      def to_locale_string(value)
        return js_str(value) unless value.is_a?(Numeric)

        rounded = value.is_a?(Float) ? (value * 1000).round / 1000.0 : value
        int_part, dec_part = js_str(rounded).split(".")
        grouped = int_part.gsub(/\B(?=(\d{3})+(?!\d))/, ",")
        dec_part ? "#{grouped}.#{dec_part}" : grouped
      end

      def js_str(value)
        JsCompat.js_string(value)
      end

      def js_or(*values)
        JsCompat.js_or(*values)
      end

      def truthy(value)
        JsCompat.js_truthy?(value)
      end
    end
  end
end
