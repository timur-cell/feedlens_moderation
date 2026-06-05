import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// ─── Seed default rules based on Implio analysis ─────────────────

export const seedRules = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Check if rules already exist
    const existing = await ctx.db.query("rules").first();
    if (existing) {
      console.log("Rules already seeded, skipping");
      return null;
    }

    const rules = [
      // ══════════════════════════════════════════════════════════
      // SIMPLE RULES — Tier: auto (high confidence)
      // ══════════════════════════════════════════════════════════
      {
        name: "price_too_low_re",
        displayName: "Price Below Minimum (RE)",
        description: "Real estate below $490,000 USD minimum",
        category: "simple",
        tier: "auto",
        enabled: true,
        action: "reject",
        priority: 10,
        config: {
          conditions: [
            { field: "category", operator: "eq", value: "real_estate" },
            { field: "priceUsd", operator: "<", value: 490000 },
            { field: "priceOnRequest", operator: "is_false", value: null },
          ],
        },
        sellerMessage: "Your listing price is below our minimum threshold of $490,000 USD for real estate listings.",
      },
      {
        name: "too_few_images",
        displayName: "Insufficient Images",
        description: "Listings with fewer than 2 images",
        category: "simple",
        tier: "auto",
        enabled: true,
        action: "reject",
        priority: 11,
        config: { field: "imageCount", operator: "<", value: 2 },
        sellerMessage: "Your listing requires at least 2 images to be published on JamesEdition.",
      },
      {
        name: "lqi_very_low",
        displayName: "Very Low LQI",
        description: "Listing Quality Index below 25",
        category: "simple",
        tier: "auto",
        enabled: true,
        action: "reject",
        priority: 12,
        config: { field: "lqi", operator: "<", value: 25 },
        sellerMessage: "Your listing quality score is too low. Please improve your listing with better images, a detailed description, and complete property information.",
      },
      {
        name: "lqi_low",
        displayName: "Low LQI",
        description: "LQI between 25 and 50 — warning only",
        category: "simple",
        tier: "auto",
        enabled: true,
        action: "notice",
        priority: 13,
        config: {
          conditions: [
            { field: "lqi", operator: ">=", value: 25 },
            { field: "lqi", operator: "<", value: 50 },
          ],
        },
        sellerMessage: "Your listing quality score could be improved. Consider adding more images and a more detailed description.",
      },
      {
        name: "short_description",
        displayName: "Very Short Description",
        description: "Description under 50 characters",
        category: "simple",
        tier: "auto",
        enabled: true,
        action: "notice",
        priority: 14,
        config: { field: "descriptionLength", operator: "<", value: 50 },
        sellerMessage: "Your listing description is very short. A more detailed description helps buyers and improves visibility.",
      },
      {
        name: "low_resolution_images",
        displayName: "Low Resolution Images",
        description: "Average image resolution below 800x600",
        category: "simple",
        tier: "verify",
        enabled: true,
        action: "notice",
        priority: 15,
        config: {
          conditions: [
            { field: "avgImageWidth", operator: "<", value: 800 },
            { field: "avgImageHeight", operator: "<", value: 600 },
          ],
        },
        sellerMessage: "Your listing images are low resolution. Higher quality images significantly improve buyer interest.",
      },
      {
        name: "unrealistic_living_area",
        displayName: "Unrealistic Living Area",
        description: "Living area over 10,000 sqm",
        category: "simple",
        tier: "manual",
        enabled: true,
        action: "flag",
        priority: 16,
        config: { field: "livingArea", operator: ">", value: 10000 },
        sellerMessage: "Please verify the living area of your property. The value seems unusually high.",
      },
      {
        name: "unrealistic_bedrooms",
        displayName: "Unrealistic Bedrooms",
        description: "More than 20 bedrooms",
        category: "simple",
        tier: "manual",
        enabled: true,
        action: "flag",
        priority: 17,
        config: { field: "bedrooms", operator: ">", value: 20 },
        sellerMessage: "Please verify the bedroom count for your property.",
      },
      {
        name: "land_equals_living",
        displayName: "Land = Living Area",
        description: "Land area equals living area (data quality flag)",
        category: "simple",
        tier: "manual",
        enabled: true,
        action: "flag",
        priority: 18,
        config: {
          conditions: [
            { field: "livingArea", operator: ">", value: 200 },
          ],
        },
        sellerMessage: "Please verify the living area and land area of your property. They appear to be the same value.",
      },

      // ══════════════════════════════════════════════════════════
      // REGEX RULES — Trigger LLM verification
      // ══════════════════════════════════════════════════════════
      {
        name: "bad_condition_keywords",
        displayName: "Bad Condition Keywords",
        description: "Detects ruins, derelict, renovation needed, etc.",
        category: "regex",
        tier: "verify",
        enabled: true,
        action: "flag",
        priority: 30,
        config: {
          patterns: [
            "\\bruin(s|ed|ous)?\\b",
            "\\bderelict\\b",
            "\\bdilapidated\\b",
            "\\babandoned\\b",
            "\\bcollaps(ed|ing)\\b",
            "\\btotal\\s*renovation\\b",
            "\\bcomplete\\s*renovation\\b",
            "\\bneeds?\\s*(full|total|complete)\\s*renovation\\b",
            "\\bto\\s*(be\\s*)?renovat(e|ed)\\b",
            "\\bfixer[\\s-]*upper\\b",
            "\\brehab(ilitat)?\\b",
            "\\buninhabitable\\b",
          ],
          fields: ["title", "description"],
        },
        sellerMessage: "Your listing appears to describe a property in poor condition. JamesEdition focuses on luxury properties in good condition.",
      },
      {
        name: "sold_keywords",
        displayName: "SOLD / Under Offer",
        description: "Detects sold, under offer, reserved properties",
        category: "regex",
        tier: "verify",
        enabled: true,
        action: "flag",
        priority: 31,
        config: {
          patterns: [
            "\\bsold\\b",
            "\\bunder\\s*offer\\b",
            "\\breserved\\b",
            "\\bunder\\s*contract\\b",
            "\\bpending\\s*sale\\b",
            "\\bvendido\\b",
            "\\bvendu(e)?\\b",
            "\\bverkauft\\b",
          ],
          fields: ["title", "description"],
        },
        sellerMessage: "Your listing appears to be marked as sold or under offer. Please remove sold listings from your feed.",
      },
      {
        name: "commercial_keywords",
        displayName: "Commercial Property",
        description: "Detects commercial/industrial property types",
        category: "regex",
        tier: "verify",
        enabled: true,
        action: "flag",
        priority: 32,
        config: {
          patterns: [
            "\\bwarehouse\\b",
            "\\bindustrial\\s*(unit|building|property)\\b",
            "\\bfactory\\b",
            "\\boffice\\s*(space|building)\\b",
            "\\bretail\\s*(space|unit|shop)\\b",
            "\\bcommercial\\s*(property|building|space|unit)\\b",
            "\\bstorage\\s*facility\\b",
          ],
          fields: ["title", "description"],
          textLists: {
            "commercial_types": [
              "warehouse", "factory", "industrial", "storage facility",
              "retail unit", "office building", "commercial building",
              "gas station", "car wash", "parking lot",
            ],
          },
        },
        sellerMessage: "JamesEdition is a residential luxury marketplace. Commercial properties are not accepted.",
      },
      {
        name: "watermark_sold_gpt",
        displayName: "Watermark/SOLD in Images",
        description: "AI detected watermarks or SOLD text in images",
        category: "regex",
        tier: "verify",
        enabled: true,
        action: "flag",
        priority: 33,
        config: {
          conditions: [
            { field: "chatGptWatermarkShare", operator: ">", value: 0.3 },
          ],
        },
        sellerMessage: "Your listing images contain watermarks or 'SOLD' text that covers too much of the image.",
      },

      // ══════════════════════════════════════════════════════════
      // OFFICE RULES — Specific seller restrictions
      // ══════════════════════════════════════════════════════════
      {
        name: "office_malta_block",
        displayName: "Malta Office Block",
        description: "Block listings from specific Malta offices",
        category: "office",
        tier: "auto",
        enabled: false,
        action: "reject",
        priority: 50,
        config: {
          officeNames: ["malta_blocked_office"],
        },
        sellerMessage: "Your account is currently restricted from publishing on JamesEdition.",
      },
    ];

    for (const rule of rules) {
      await ctx.db.insert("rules", {
        ...rule,
        matchCount: 0,
        falsePositiveCount: 0,
      });
    }

    console.log(`Seeded ${rules.length} rules`);

    // ─── Seed message templates ────────────────────────────────
    const templates = [
      {
        name: "generic_reject",
        displayName: "Generic Rejection",
        category: "reject",
        body: "Your listing does not meet JamesEdition's quality standards at this time. Please review our listing guidelines and resubmit.",
        isDefault: true,
      },
      {
        name: "condition_reject",
        displayName: "Poor Condition Rejection",
        category: "reject",
        body: "Your listing appears to describe a property that requires significant renovation. JamesEdition showcases luxury properties in good to excellent condition.",
      },
      {
        name: "price_reject",
        displayName: "Price Below Minimum",
        category: "reject",
        body: "Your listing price is below the minimum threshold for JamesEdition. Our platform features luxury properties starting at $490,000 USD.",
      },
      {
        name: "sold_reject",
        displayName: "Sold Property",
        category: "reject",
        body: "Your listing appears to be sold or under offer. Please remove sold properties from your feed to maintain accurate listings.",
      },
      {
        name: "commercial_reject",
        displayName: "Commercial Property",
        category: "reject",
        body: "JamesEdition is a luxury residential marketplace. Commercial and industrial properties are not accepted.",
      },
      {
        name: "generic_notice",
        displayName: "Generic Notice",
        category: "notice",
        body: "We noticed some areas where your listing could be improved. Please review and update accordingly.",
        isDefault: true,
      },
      {
        name: "photos_notice",
        displayName: "Improve Photos",
        category: "notice",
        body: "Your listing would benefit from higher quality photos. Professional photography significantly increases buyer interest.",
      },
      {
        name: "description_notice",
        displayName: "Improve Description",
        category: "notice",
        body: "Consider adding a more detailed property description to improve visibility and attract qualified buyers.",
      },
    ];

    for (const template of templates) {
      await ctx.db.insert("messageTemplates", template);
    }

    console.log(`Seeded ${templates.length} message templates`);
    return null;
  },
});
