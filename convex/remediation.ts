import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireModerator, requireModeratorAction } from "./authz";

declare const process: { env: Record<string, string | undefined> };

// Minimum confidence for a remediation suggestion to be kept. Must match the
// ">0.75 confidence" instruction and the 0.75-1.0 range in the prompt below.
const MIN_SUGGESTION_CONFIDENCE = 0.75;

// ─── Error Type Definitions ──────────────────────────────────────

export const ERROR_TYPES = {
  BEDROOM_ANOMALY: "bedroom_anomaly",
  AREA_CONVERSION: "area_conversion",
  PRICE_ANOMALY: "price_anomaly",
  PRICE_MISSING_ZEROS: "price_missing_zeros",
  DESCRIPTION_TOO_SHORT: "description_too_short",
  DESCRIPTION_ALL_CAPS: "description_all_caps",
  DESCRIPTION_PLACEHOLDER: "description_placeholder",
  DESCRIPTION_AUTO_TRANSLATE: "description_auto_translate",
  DESCRIPTION_MISSING_DETAILS: "description_missing_details",
  BATHROOM_ANOMALY: "bathroom_anomaly",
  YEAR_ANOMALY: "year_anomaly",
  AREA_SWAP: "area_swap",
} as const;

// ─── Types ───────────────────────────────────────────────────────

interface Suggestion {
  errorType: string;
  severity: "high" | "medium" | "low";
  field: string;
  currentValue: string;
  suggestedFix: string;
  explanation: string;
  confidence: number;
}

interface DescriptionScore {
  overall: number;
  length: "too_short" | "ok" | "good";
  hasPlaceholder: boolean;
  hasAllCaps: boolean;
  hasAutoTranslateArtifacts: boolean;
  missingKeyDetails?: string[];
}

interface RemediationResult {
  hasFixableErrors: boolean;
  errorCount: number;
  totalConfidence: number;
  suggestions: Suggestion[];
  descriptionScore?: DescriptionScore;
}

// ─── Extract Data for Analysis ────────────────────────────────────

function extractListingData(listing: any): Record<string, unknown> {
  return {
    title: listing.title,
    category: listing.category,
    realEstateType: listing.realEstateType,
    country: listing.country,
    city: listing.city,
    price: listing.price,
    currency: listing.currency,
    priceUsd: listing.priceUsd,
    priceOnRequest: listing.priceOnRequest,
    pricePerSqm: listing.pricePerSqm,
    livingArea: listing.livingArea,
    landArea: listing.landArea,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    imageCount: listing.imageCount,
    rental: listing.rental,
    year: listing.year,
    feedSource: listing.feedSource,
    office: listing.office,
    officeSubscription: listing.officeSubscription,
    description: listing.description
      ? listing.description.substring(0, 1500)
      : undefined,
    descriptionLength: listing.descriptionLength,
    lqi: listing.lqi,
  };
}

// ─── Build the prompt ────────────────────────────────────────────

function buildPrompt(data: Record<string, unknown>): string {
  return `You are a data quality analyst for JamesEdition, the world's largest luxury marketplace. Find CLEAR, FIXABLE data errors in this listing. Be precise and concise.

LISTING DATA:
${JSON.stringify(data, null, 2)}

ERROR TYPES TO CHECK:

1. **bedroom_anomaly** — Bedroom count is obviously a typo (55 → 5, 99 → placeholder). Normal range is 1-20.
2. **bathroom_anomaly** — Bathroom count is obviously a typo (33 → 3). Normal range is 1-15.
3. **area_conversion** — Area entered in wrong unit. Only flag if clearly wrong (e.g. apartment with 5000 sqm is likely sqft).
4. **area_swap** — Living area and land area are swapped (living > land for houses with land).
5. **price_anomaly** — Price is clearly wrong for the category/location (not just unusual).
6. **price_missing_zeros** — Price is missing digits ($1,200 for a luxury property → $1,200,000).
7. **year_anomaly** — Year is impossible (2099, 1800 for modern property, 0).
8. **description_too_short** — Description under 50 characters.
9. **description_all_caps** — Entire description is ALL CAPS.
10. **description_placeholder** — Contains actual placeholder text: "Lorem ipsum", "test listing", "TBD", "N/A", "description coming soon". NOTE: "[hidden information]" is JamesEdition's standard way of hiding contact details — this is NORMAL, NOT a placeholder.
11. **description_auto_translate** — Clearly auto-translated with nonsensical grammar/word soup.
12. **description_missing_details** — Very bare description for a luxury listing (just a sentence or two with no property details).

DESCRIPTION QUALITY SCORE (if description exists):
- overall: 0-100, length: "too_short"|"ok"|"good", hasPlaceholder, hasAllCaps, hasAutoTranslateArtifacts, missingKeyDetails

STRICT RULES:
- Only flag errors you are CONFIDENT about (>0.75 confidence)
- Luxury properties have extreme values — large areas, high prices, many rooms are NORMAL
- "[hidden information]" in descriptions is NORMAL (contact hiding), do NOT flag it
- Keep explanations to 1-2 sentences max
- If the data looks reasonable, return empty suggestions — false positives are worse than missed errors
- When in doubt, do NOT flag it

Respond with ONLY valid JSON (no markdown, no backticks):
{"hasFixableErrors":boolean,"errorCount":number,"suggestions":[{"errorType":"code","severity":"high"|"medium"|"low","field":"field_name","currentValue":"current","suggestedFix":"fix","explanation":"short reason","confidence":0.75-1.0}],"descriptionScore":{"overall":0-100,"length":"too_short"|"ok"|"good","hasPlaceholder":false,"hasAllCaps":boolean,"hasAutoTranslateArtifacts":boolean,"missingKeyDetails":["detail"]}}`;
}

// ─── Call Claude Haiku ───────────────────────────────────────────

async function callClaude(
  prompt: string,
  apiKey: string
): Promise<{ result: RemediationResult; tokensUsed: number }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const apiData = await response.json();
  const textBlock = apiData.content?.find((b: any) => b.type === "text");
  const content = textBlock?.text || "";
  const tokensUsed =
    (apiData.usage?.input_tokens || 0) + (apiData.usage?.output_tokens || 0);

  let result: RemediationResult;
  try {
    const cleaned = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    result = JSON.parse(cleaned);
  } catch {
    result = {
      hasFixableErrors: false,
      errorCount: 0,
      totalConfidence: 0,
      suggestions: [],
    };
  }

  // Validate & filter low-confidence suggestions
  if (!Array.isArray(result.suggestions)) result.suggestions = [];
  result.suggestions = result.suggestions.filter(
    (s) => (s.confidence || 0) >= MIN_SUGGESTION_CONFIDENCE
  );
  result.errorCount = result.suggestions.length;
  result.hasFixableErrors = result.errorCount > 0;
  result.totalConfidence =
    result.suggestions.length > 0
      ? result.suggestions.reduce((s, x) => s + (x.confidence || 0), 0) /
        result.suggestions.length
      : 0;

  return { result, tokensUsed };
}

// ─── Save to DB helper ───────────────────────────────────────────

function buildSaveArgs(
  listingId: any,
  listing: any,
  result: RemediationResult,
  tokensUsed: number
) {
  return {
    listingId,
    jeId: listing.jeId,
    hasFixableErrors: result.hasFixableErrors,
    errorCount: result.errorCount,
    totalConfidence: Math.round(result.totalConfidence * 100) / 100,
    suggestions: result.suggestions.map((s: any) => ({
      errorType: s.errorType || "unknown",
      severity: s.severity || "low",
      field: s.field || "unknown",
      currentValue: String(s.currentValue ?? ""),
      suggestedFix: String(s.suggestedFix ?? ""),
      explanation: String(s.explanation ?? ""),
      // Coerce — the model occasionally returns numbers as strings, which
      // would fail saveResult's v.number() validator and abort the scan.
      confidence: Number(s.confidence) || 0,
    })),
    descriptionScore: result.descriptionScore
      ? {
          overall: Number(result.descriptionScore.overall) || 0,
          length: result.descriptionScore.length || "ok",
          hasPlaceholder: result.descriptionScore.hasPlaceholder || false,
          hasAllCaps: result.descriptionScore.hasAllCaps || false,
          hasAutoTranslateArtifacts:
            result.descriptionScore.hasAutoTranslateArtifacts || false,
          missingKeyDetails:
            result.descriptionScore.missingKeyDetails || undefined,
        }
      : undefined,
    feedSource: listing.feedSource || undefined,
    office: listing.office || undefined,
    category: listing.category || undefined,
    country: listing.country || undefined,
    model: "claude-sonnet-4-20250514",
    tokensUsed,
  };
}

// ─── Shadow Remediation Scanner ──────────────────────────────────

export const scanListing = action({
  args: { listingId: v.id("listings") },
  returns: v.any(),
  handler: async (ctx, { listingId }): Promise<any> => {
    await requireModeratorAction(ctx);
    const listing = await ctx.runQuery(internal.remediation.getListingInternal, {
      id: listingId,
    });
    if (!listing) throw new Error("Listing not found");

    // Check if already scanned
    const existing = await ctx.runQuery(
      internal.remediation.getResultByListing,
      { listingId }
    );
    if (existing) return existing;

    const data = extractListingData(listing);
    const apiKey =
      process.env.ANTHROPIC_API_KEY ||
      (await import("./serverConfig")).config.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("No Anthropic API key configured");

    const prompt = buildPrompt(data);
    const { result, tokensUsed } = await callClaude(prompt, apiKey);

    const resultId = await ctx.runMutation(
      internal.remediation.saveResult,
      buildSaveArgs(listingId, listing, result, tokensUsed)
    );

    return { resultId, ...result, tokensUsed };
  },
});

// ─── Batch Scan ──────────────────────────────────────────────────

export const batchScan = action({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { limit }): Promise<any> => {
    await requireModeratorAction(ctx);
    const batchSize = limit || 20;
    const listings = await ctx.runQuery(
      internal.remediation.getUnscannedListings,
      { limit: batchSize }
    );

    const apiKey =
      process.env.ANTHROPIC_API_KEY ||
      (await import("./serverConfig")).config.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("No Anthropic API key configured");

    const results: Array<{
      jeId: string;
      hasFixableErrors: boolean;
      errorCount: number;
    }> = [];
    let errors = 0;

    for (const listing of listings) {
      try {
        // Check if already scanned
        const existing = await ctx.runQuery(
          internal.remediation.getResultByListing,
          { listingId: listing._id }
        );
        if (existing) {
          results.push({
            jeId: listing.jeId,
            hasFixableErrors: existing.hasFixableErrors,
            errorCount: existing.errorCount,
          });
          continue;
        }

        const data = extractListingData(listing);
        const prompt = buildPrompt(data);
        const { result, tokensUsed } = await callClaude(prompt, apiKey);

        await ctx.runMutation(
          internal.remediation.saveResult,
          buildSaveArgs(listing._id, listing, result, tokensUsed)
        );

        results.push({
          jeId: listing.jeId,
          hasFixableErrors: result.hasFixableErrors,
          errorCount: result.errorCount,
        });
      } catch (e: any) {
        console.error(`Remediation scan failed for ${listing.jeId}:`, e);
        errors++;
      }
    }

    return {
      scanned: results.length,
      errors,
      withIssues: results.filter((r) => r.hasFixableErrors).length,
      results,
    };
  },
});

// ─── Internal Queries & Mutations ─────────────────────────────────

export const getListingInternal = internalQuery({
  args: { id: v.id("listings") },
  returns: v.any(),
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const getResultByListing = internalQuery({
  args: { listingId: v.id("listings") },
  returns: v.any(),
  handler: async (ctx, { listingId }) => {
    return await ctx.db
      .query("remediationResults")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .first();
  },
});

export const getUnscannedListings = internalQuery({
  args: { limit: v.number() },
  returns: v.any(),
  handler: async (ctx, { limit }) => {
    // Find listings that had moderation issues (non-approved outcome or rule
    // matches) and have NOT yet been remediation-scanned. We page through
    // moderationResults oldest-first so repeated batchScan runs progressively
    // drain the whole backlog instead of being permanently capped to a recent
    // window. A safety bound limits how much a single call will scan.
    const MAX_RESULTS_SCANNED = 5000;
    const PAGE_SIZE = 200;
    const unscanned: any[] = [];
    const seen = new Set<string>();
    let scanned = 0;
    // Walk the by_processedAt index in ascending ranges. Convex permits only
    // one .paginate() call per query execution, so a paginate loop would
    // throw on the second page; an index-range walk has no such limit.
    let lastProcessedAt = 0;

    while (unscanned.length < limit && scanned < MAX_RESULTS_SCANNED) {
      const cutoff = lastProcessedAt;
      const page = await ctx.db
        .query("moderationResults")
        .withIndex("by_processedAt", (q) => q.gt("processedAt", cutoff))
        .order("asc")
        .take(PAGE_SIZE);
      if (page.length === 0) break;

      for (const mr of page) {
        scanned++;
        const hasIssues =
          mr.outcome !== "approved" ||
          (mr.ruleMatches && mr.ruleMatches.length > 0);
        if (!hasIssues) continue;

        const lid = mr.listingId as string;
        if (seen.has(lid)) continue;
        seen.add(lid);

        // Skip listings that already have a remediation scan.
        const scan = await ctx.db
          .query("remediationResults")
          .withIndex("by_listing", (q) => q.eq("listingId", mr.listingId))
          .first();
        if (scan) continue;

        const listing = await ctx.db.get(mr.listingId);
        if (listing) {
          unscanned.push(listing);
          if (unscanned.length >= limit) break;
        }
      }

      lastProcessedAt = page[page.length - 1].processedAt;
      if (page.length < PAGE_SIZE) break;
    }
    return unscanned;
  },
});

export const saveResult = internalMutation({
  args: {
    listingId: v.id("listings"),
    jeId: v.string(),
    hasFixableErrors: v.boolean(),
    errorCount: v.number(),
    totalConfidence: v.number(),
    suggestions: v.array(
      v.object({
        errorType: v.string(),
        severity: v.string(),
        field: v.string(),
        currentValue: v.string(),
        suggestedFix: v.string(),
        explanation: v.string(),
        confidence: v.number(),
      })
    ),
    descriptionScore: v.optional(
      v.object({
        overall: v.number(),
        length: v.string(),
        hasPlaceholder: v.boolean(),
        hasAllCaps: v.boolean(),
        hasAutoTranslateArtifacts: v.boolean(),
        missingKeyDetails: v.optional(v.array(v.string())),
      })
    ),
    feedSource: v.optional(v.string()),
    office: v.optional(v.string()),
    category: v.optional(v.string()),
    country: v.optional(v.string()),
    model: v.string(),
    tokensUsed: v.optional(v.number()),
  },
  returns: v.id("remediationResults"),
  handler: async (ctx, args) => {
    // Upsert: delete existing
    const existing = await ctx.db
      .query("remediationResults")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return await ctx.db.insert("remediationResults", {
      ...args,
      scannedAt: Date.now(),
    });
  },
});

// ─── Frontend Queries ──────────────────────────────────────────────

export const getStats = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireModerator(ctx);
    const all = await ctx.db.query("remediationResults").collect();
    const withErrors = all.filter((r) => r.hasFixableErrors);

    // Count by error type — use Map then convert to array for safety
    const errorTypeMap = new Map<string, number>();
    const severityCounts = { high: 0, medium: 0, low: 0 };

    for (const result of withErrors) {
      for (const s of result.suggestions) {
        errorTypeMap.set(s.errorType, (errorTypeMap.get(s.errorType) || 0) + 1);
        if (s.severity === "high") severityCounts.high++;
        else if (s.severity === "medium") severityCounts.medium++;
        else severityCounts.low++;
      }
    }
    const errorTypeCounts = Array.from(errorTypeMap.entries()).map(
      ([type, count]) => ({ type, count })
    );

    // Count by feed source — use Map then convert to array (avoids non-ASCII key issues)
    const feedSourceMap = new Map<string, { total: number; withErrors: number }>();
    for (const result of all) {
      const src = result.feedSource || "Unknown";
      const entry = feedSourceMap.get(src) || { total: 0, withErrors: 0 };
      entry.total++;
      if (result.hasFixableErrors) entry.withErrors++;
      feedSourceMap.set(src, entry);
    }
    const feedSourceCounts = Array.from(feedSourceMap.entries()).map(
      ([name, counts]) => ({ name, ...counts })
    );

    // Count by office/seller — same array approach
    const officeMap = new Map<string, { total: number; withErrors: number; errorCount: number }>();
    for (const result of all) {
      const office = result.office || "Unknown";
      const entry = officeMap.get(office) || { total: 0, withErrors: 0, errorCount: 0 };
      entry.total++;
      if (result.hasFixableErrors) {
        entry.withErrors++;
        entry.errorCount += result.errorCount;
      }
      officeMap.set(office, entry);
    }
    const officeCounts = Array.from(officeMap.entries()).map(
      ([name, counts]) => ({ name, ...counts })
    );

    // Description quality stats
    const withDescScore = all.filter((r) => r.descriptionScore);
    const avgDescScore =
      withDescScore.length > 0
        ? Math.round(
            withDescScore.reduce(
              (s, r) => s + (r.descriptionScore?.overall || 0),
              0
            ) / withDescScore.length
          )
        : 0;

    // Daily trend (last 14 days)
    const dailyTrend: Array<{
      date: string;
      scanned: number;
      withErrors: number;
      errorCount: number;
    }> = [];
    const now = Date.now();
    for (let i = 13; i >= 0; i--) {
      const dayStart = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateStr = dayStart.toISOString().split("T")[0];
      const dayStartMs = new Date(dateStr).getTime();
      const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

      const dayResults = all.filter(
        (r) => r.scannedAt >= dayStartMs && r.scannedAt < dayEndMs
      );
      dailyTrend.push({
        date: dateStr,
        scanned: dayResults.length,
        withErrors: dayResults.filter((r) => r.hasFixableErrors).length,
        errorCount: dayResults.reduce((s, r) => s + r.errorCount, 0),
      });
    }

    return {
      totalScanned: all.length,
      withErrors: withErrors.length,
      totalSuggestions: withErrors.reduce((s, r) => s + r.errorCount, 0),
      errorRate:
        all.length > 0
          ? Math.round((withErrors.length / all.length) * 100)
          : 0,
      avgConfidence:
        withErrors.length > 0
          ? Math.round(
              (withErrors.reduce((s, r) => s + r.totalConfidence, 0) /
                withErrors.length) *
                100
            )
          : 0,
      errorTypeCounts,
      severityCounts,
      feedSourceCounts,
      officeCounts,
      avgDescScore,
      dailyTrend,
    };
  },
});

export const getRecent = query({
  args: { limit: v.optional(v.number()), errorsOnly: v.optional(v.boolean()) },
  returns: v.any(),
  handler: async (ctx, { limit, errorsOnly }) => {
    await requireModerator(ctx);
    let results;
    if (errorsOnly) {
      results = await ctx.db
        .query("remediationResults")
        .withIndex("by_hasFixableErrors", (q) =>
          q.eq("hasFixableErrors", true)
        )
        .order("desc")
        .take(limit || 100);
    } else {
      results = await ctx.db
        .query("remediationResults")
        .withIndex("by_scannedAt")
        .order("desc")
        .take(limit || 100);
    }

    // Enrich with listing data
    const enriched = [];
    for (const result of results) {
      const listing = await ctx.db.get(result.listingId);
      enriched.push({
        ...result,
        listing: listing
          ? {
              title: listing.title,
              price: listing.price,
              currency: listing.currency,
              category: listing.category,
              country: listing.country,
              city: listing.city,
              bedrooms: listing.bedrooms,
              imageCount: listing.imageCount,
              listingUrl: listing.listingUrl,
              feedSource: listing.feedSource,
              office: listing.office,
            }
          : null,
      });
    }

    return enriched;
  },
});

export const getByJeId = query({
  args: { jeId: v.string() },
  returns: v.any(),
  handler: async (ctx, { jeId }) => {
    await requireModerator(ctx);
    return await ctx.db
      .query("remediationResults")
      .withIndex("by_jeId", (q) => q.eq("jeId", jeId))
      .first();
  },
});

export const getByFeedSource = query({
  args: { feedSource: v.string(), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { feedSource, limit }) => {
    await requireModerator(ctx);
    return await ctx.db
      .query("remediationResults")
      .withIndex("by_feedSource", (q) => q.eq("feedSource", feedSource))
      .order("desc")
      .take(limit || 50);
  },
});
