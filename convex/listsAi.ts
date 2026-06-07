"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { requireAdminAction } from "./authz";

// ─── AI-Assisted List Generation ─────────────────────────────────

export const suggestList = action({
  args: {
    description: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, { description }) => {
    await requireAdminAction(ctx);
    const apiKey = process.env.ANTHROPIC_API_KEY || (await import("./serverConfig")).config.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("No Anthropic API key configured");

    const prompt = `You are an expert at creating moderation lists for FeedLens, JamesEdition's listing moderation system.

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

USER'S DESCRIPTION: "${description}"

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
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} — ${errText}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    try {
      const suggestion = JSON.parse(text.trim());
      return suggestion;
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("Failed to parse AI suggestion: " + text.substring(0, 200));
    }
  },
});
