import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { api, internal } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

// ─── Flag Codes ──────────────────────────────────────────────────

export const FLAG_CODES = {
  PRICE_SUSPICIOUS: "Price seems unrealistic for the country, type, and size",
  PRICE_PER_SQM_ANOMALY: "Price per sqm is outside normal range for this location/type",
  AREA_MISMATCH: "Living area and land area values seem inconsistent or unrealistic",
  LOCATION_SUSPICIOUS: "Location data seems wrong or inconsistent",
  CATEGORY_MISMATCH: "Parameters don't match the listing category",
  MISSING_CRITICAL_DATA: "Key fields are missing that should exist for this listing type",
  PRICE_AREA_CONFLICT: "Price doesn't align with the property size",
  DATA_ENTRY_ERROR: "Values suggest a data entry or unit conversion mistake",
} as const;

// ─── Types ───────────────────────────────────────────────────────

interface ScanFlag {
  code: string;
  severity: "high" | "medium" | "low";
  message: string;
  field?: string;
  expected?: string;
  actual?: string;
}

interface ScanResult {
  verdict: "reject" | "review" | "ok";
  flags: ScanFlag[];
  summary: string;
  confidence: number;
}

// ─── Helpers ─────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function determineVerdict(flags: ScanFlag[]): "reject" | "review" | "ok" {
  const high = flags.filter((f) => f.severity === "high").length;
  const medium = flags.filter((f) => f.severity === "medium").length;
  if (high >= 2) return "reject";
  if (high >= 1 || medium >= 1) return "review";
  return "ok";
}

function worstVerdict(a: string, b: string): "reject" | "review" | "ok" {
  const order: Record<string, number> = { reject: 0, review: 1, ok: 2 };
  return ((order[a] ?? 2) <= (order[b] ?? 2) ? a : b) as "reject" | "review" | "ok";
}

// ─── Deterministic Pre-checks ─────────────────────────────────────
// Hard-coded threshold rules that catch obvious data quality issues
// WITHOUT relying on AI. These ALWAYS run first and override AI "ok"
// verdicts when they find clear violations.
//
// Why: Claude Haiku sometimes marks blatant anomalies as "ok"
// (e.g. listing #16680095 with $1/sqm and 5.6M sqm living area).
// These deterministic checks provide a safety net.

function runDeterministicChecks(params: Record<string, unknown>): ScanFlag[] {
  const flags: ScanFlag[] = [];

  const price = params.price as number | undefined;
  const priceOnRequest = params.priceOnRequest as boolean | undefined;
  const livingArea = params.livingArea as number | undefined;
  const landArea = params.landArea as number | undefined;
  const bedrooms = params.bedrooms as number | undefined;
  const bathrooms = params.bathrooms as number | undefined;
  const realEstateType = ((params.realEstateType as string) || "").toLowerCase();
  const country = ((params.country as string) || "").toUpperCase();

  // High-cost countries where pricePerSqm thresholds should be stricter
  const HIGH_COST_COUNTRIES = new Set([
    "AE", "MC", "CH", "SG", "HK", "LU", "GB", "FR", "IT", "ES",
    "US", "AU", "NL", "NO", "SE", "DK", "AT", "DE", "JP", "IL",
  ]);
  // Residential types where price/sqm checks apply
  const RESIDENTIAL_TYPES = new Set([
    "apartment", "villa", "house", "penthouse", "townhouse",
    "condo", "flat", "duplex", "triplex",
  ]);
  const isResidential = RESIDENTIAL_TYPES.has(realEstateType) || realEstateType === "";
  const isHighCostCountry = HIGH_COST_COUNTRIES.has(country);

  // Compute pricePerSqm if not already stored on the listing
  let pricePerSqm = params.pricePerSqm as number | undefined;
  if (pricePerSqm === undefined && price && price > 0 && livingArea && livingArea > 0) {
    pricePerSqm = Math.round(price / livingArea);
  }

  // ── Price checks (skip if Price on Request) ──────────────
  if (!priceOnRequest && price && price > 0) {
    // Price/sqm anomaly — tiered thresholds
    if (pricePerSqm !== undefined) {
      if (pricePerSqm < 10) {
        flags.push({
          code: "PRICE_PER_SQM_ANOMALY",
          severity: "high",
          message: `Price per sqm is $${pricePerSqm}/sqm — far below $10/sqm minimum. Almost certainly a data error.`,
          field: "pricePerSqm",
          expected: "$100–$50,000/sqm for luxury real estate",
          actual: `$${pricePerSqm}/sqm`,
        });
      } else if (pricePerSqm < 100) {
        flags.push({
          code: "PRICE_PER_SQM_ANOMALY",
          severity: "high",
          message: `Price per sqm is $${pricePerSqm}/sqm — below $100/sqm minimum for luxury properties.`,
          field: "pricePerSqm",
          expected: "$100–$50,000/sqm for luxury real estate",
          actual: `$${pricePerSqm}/sqm`,
        });
      } else if (pricePerSqm < 500 && isResidential) {
        // $100–$500/sqm is suspicious for any residential listing on a luxury marketplace
        flags.push({
          code: "PRICE_PER_SQM_ANOMALY",
          severity: "medium",
          message: `Price per sqm is $${fmtNum(pricePerSqm)}/sqm — unusually low for a luxury marketplace listing.`,
          field: "pricePerSqm",
          expected: "$500–$50,000/sqm for residential luxury properties",
          actual: `$${fmtNum(pricePerSqm)}/sqm`,
        });
      } else if (pricePerSqm < 1000 && isResidential && isHighCostCountry) {
        // $500–$1000/sqm in high-cost countries (UAE, Monaco, Switzerland etc.) is very suspicious
        flags.push({
          code: "PRICE_PER_SQM_ANOMALY",
          severity: "medium",
          message: `Price per sqm is $${fmtNum(pricePerSqm)}/sqm — below $1,000/sqm minimum for residential properties in ${country}.`,
          field: "pricePerSqm",
          expected: `$1,000–$50,000/sqm for residential properties in ${country}`,
          actual: `$${fmtNum(pricePerSqm)}/sqm`,
        });
      } else if (pricePerSqm > 200000) {
        flags.push({
          code: "PRICE_PER_SQM_ANOMALY",
          severity: "high",
          message: `Price per sqm is $${fmtNum(pricePerSqm)}/sqm — above $200K/sqm maximum threshold.`,
          field: "pricePerSqm",
          expected: "$100–$50,000/sqm for luxury real estate",
          actual: `$${fmtNum(pricePerSqm)}/sqm`,
        });
      }
    }

    // Price too low for non-POR
    if (price < 1000) {
      flags.push({
        code: "PRICE_SUSPICIOUS",
        severity: "high",
        message: `Price is $${fmtNum(price)} — below $1,000 minimum for non-POR listings.`,
        field: "price",
        expected: "> $1,000 for a luxury listing",
        actual: `$${fmtNum(price)}`,
      });
    }
  }

  // ── Living area checks ────────────────────────────────────
  if (livingArea !== undefined && livingArea > 0) {
    if (livingArea > 100000) {
      flags.push({
        code: "AREA_MISMATCH",
        severity: "high",
        message: `Living area is ${fmtNum(livingArea)} sqm (${(livingArea / 10000).toFixed(1)} hectares) — impossibly large for a building.`,
        field: "livingArea",
        expected: "< 100,000 sqm for even the largest structures",
        actual: `${fmtNum(livingArea)} sqm`,
      });
    } else if (livingArea < 3) {
      flags.push({
        code: "AREA_MISMATCH",
        severity: "high",
        message: `Living area is ${livingArea} sqm — too small to be habitable.`,
        field: "livingArea",
        expected: "> 3 sqm for any habitable space",
        actual: `${livingArea} sqm`,
      });
    }
  }

  // ── Land area checks ──────────────────────────────────────
  if (landArea !== undefined && landArea > 50000000) {
    flags.push({
      code: "AREA_MISMATCH",
      severity: "medium",
      message: `Land area is ${fmtNum(landArea)} sqm (${(landArea / 1000000).toFixed(1)} km²) — extremely large.`,
      field: "landArea",
      expected: "< 50,000,000 sqm (5,000 hectares)",
      actual: `${fmtNum(landArea)} sqm`,
    });
  }

  // ── Living area ≈ land area (copy-paste error) ────────────
  if (livingArea && landArea && livingArea > 1000 && landArea > 1000) {
    const ratio = livingArea / landArea;
    if (ratio > 0.95 && ratio < 1.05) {
      if (livingArea > 10000) {
        // Large estate with living area ≈ land area: almost certainly wrong
        flags.push({
          code: "DATA_ENTRY_ERROR",
          severity: "high",
          message: `Living area (${fmtNum(livingArea)} sqm) ≈ land area (${fmtNum(landArea)} sqm) — likely copy-paste error. A ${(livingArea / 10000).toFixed(1)}-hectare building is physically impossible.`,
          field: "livingArea",
          expected: "Living area << land area for large estates",
          actual: `Living: ${fmtNum(livingArea)} sqm ≈ Land: ${fmtNum(landArea)} sqm`,
        });
      } else {
        flags.push({
          code: "DATA_ENTRY_ERROR",
          severity: "medium",
          message: `Living area (${fmtNum(livingArea)} sqm) ≈ land area (${fmtNum(landArea)} sqm) — valid for apartment/condo or could be copy-paste error.`,
          field: "livingArea",
          expected: "Usually living area < land area",
          actual: `Living: ${fmtNum(livingArea)} sqm ≈ Land: ${fmtNum(landArea)} sqm`,
        });
      }
    }
  }

  // ── Living area > land area (non-apartment types) ─────────
  if (livingArea && landArea && livingArea > landArea * 1.1) {
    const aptTypes = ["apartment", "condo", "flat", "penthouse", "studio", "loft"];
    if (!aptTypes.includes(realEstateType)) {
      flags.push({
        code: "AREA_MISMATCH",
        severity: "medium",
        message: `Living area (${fmtNum(livingArea)} sqm) exceeds land area (${fmtNum(landArea)} sqm) — unusual for ${realEstateType || "this property type"}.`,
        field: "livingArea",
        expected: "Living area ≤ land area for houses/villas",
        actual: `Living: ${fmtNum(livingArea)} sqm > Land: ${fmtNum(landArea)} sqm`,
      });
    }
  }

  // ── Bedrooms / bathrooms ──────────────────────────────────
  if (bedrooms !== undefined && bedrooms > 50) {
    flags.push({
      code: "DATA_ENTRY_ERROR",
      severity: "high",
      message: `${bedrooms} bedrooms — almost certainly a data entry error.`,
      field: "bedrooms",
      expected: "< 50 bedrooms",
      actual: `${bedrooms} bedrooms`,
    });
  }

  if (bathrooms !== undefined && bathrooms > 50) {
    flags.push({
      code: "DATA_ENTRY_ERROR",
      severity: "high",
      message: `${bathrooms} bathrooms — almost certainly a data entry error.`,
      field: "bathrooms",
      expected: "< 50 bathrooms",
      actual: `${bathrooms} bathrooms`,
    });
  }

  return flags;
}

// ─── Extract Parameters for AI ────────────────────────────────────

function extractParameters(listing: any): Record<string, unknown> {
  return {
    title: listing.title,
    category: listing.category,
    realEstateType: listing.realEstateType,
    country: listing.country,
    city: listing.city,
    state: listing.state,
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
    preOwned: listing.preOwned,
    year: listing.year,
    feedSource: listing.feedSource,
    officeSubscription: listing.officeSubscription,
    lqi: listing.lqi,
    // Intentionally exclude: description, imageUrls, rawData
  };
}

// ─── AI Scan Action ──────────────────────────────────────────────

export const scanListingParameters = action({
  args: {
    listingId: v.id("listings"),
    forceRescan: v.optional(v.boolean()),
  },
  returns: v.any(),
  handler: async (ctx, { listingId, forceRescan }): Promise<any> => {
    // Get listing
    const listing = await ctx.runQuery(internal.aiParamScan.getListingInternal, { id: listingId });
    if (!listing) throw new Error("Listing not found");

    // Check if already scanned (skip cache if forceRescan)
    if (!forceRescan) {
      const existing = await ctx.runQuery(internal.aiParamScan.getScanByListing, { listingId });
      if (existing) return existing;
    }

    const params = extractParameters(listing);

    // ─── Phase 1: Deterministic pre-checks ───────────────────
    // Hard-coded threshold rules that ALWAYS catch obvious issues
    const deterministicFlags = runDeterministicChecks(params);
    const detVerdict = determineVerdict(deterministicFlags);

    // ─── Phase 2: AI contextual analysis ─────────────────────
    // The AI adds nuance beyond simple thresholds (e.g. country-specific
    // price ranges, category mismatches, contextual anomalies).
    let aiResult: ScanResult = {
      verdict: "ok",
      flags: [],
      summary: "",
      confidence: 0,
    };
    let tokensUsed = 0;
    let modelUsed = "deterministic-only";

    try {
      const apiKey = process.env.ANTHROPIC_API_KEY || (await import("./serverConfig")).config.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("No Anthropic API key configured");

      // Tell the AI about deterministic findings so it can focus on contextual checks
      const detNote = deterministicFlags.length > 0
        ? `\n\nNOTE: Deterministic threshold checks already found ${deterministicFlags.length} issue(s):\n${deterministicFlags.map((f) => `- ${f.code}: ${f.message}`).join("\n")}\nYou should confirm or add to these findings with contextual analysis. Focus on issues that simple thresholds can't catch.`
        : "";

      const prompt = `You are a data quality analyst for JamesEdition, the world's largest luxury marketplace. Your job is to check listing PARAMETERS ONLY (not images, not description text) for data quality issues.

LISTING PARAMETERS:
${JSON.stringify(params, null, 2)}${detNote}

CRITICAL UNIT CONTEXT:
- All areas on JamesEdition are in SQUARE METERS (sqm), never sq ft
- Typical residential property sizes in sqm:
  - Studio/1-bed apartment: 30–80 sqm
  - 2-3 bed apartment: 80–200 sqm
  - Average US/EU house: 150–350 sqm (≈1,600–3,800 sqft)
  - Large luxury house/villa: 300–1,500 sqm
  - Mansion/estate: 1,000–5,000 sqm
  - Anything > 5,000 sqm living area is very unusual
- Typical price per sqm ranges for LUXURY real estate (this is a luxury marketplace):
  - Budget markets (Bulgaria, Turkey, Egypt): $500–$3,000/sqm
  - Mid markets (Spain, Portugal, Italy, Greece): $2,000–$10,000/sqm
  - US suburban: $2,000–$6,000/sqm ($200–$550/sqft)
  - US urban/coastal: $5,000–$20,000/sqm ($500–$1,800/sqft)
  - Premium markets (London, Paris, Zurich): $10,000–$30,000/sqm
  - Ultra-premium (Monaco, Manhattan, HK): $20,000–$100,000+/sqm
- DO NOT confuse sqm with sqft. 1 sqm ≈ 10.76 sqft.

CHECK FOR THESE ISSUES (use these exact flag codes):

1. PRICE_SUSPICIOUS — Is the price realistic for the country, property type, and size? 
   - Ultra-luxury ($10M+) properties exist but are rare — flag only truly absurd prices
   - A $500 villa in Spain is suspicious, a $5M villa is not
   - Consider country price levels (e.g., Bulgaria < France < Monaco)

2. PRICE_PER_SQM_ANOMALY — Is price/sqm within reason?
   - If pricePerSqm is provided, check against the ranges above for the specific country
   - Below $100/sqm or above $100K/sqm is almost always wrong
   - $2,000-$6,000/sqm is NORMAL for US suburban houses — do NOT flag this range
   - If missing but price+livingArea exist, calculate and check

3. AREA_MISMATCH — Do area values make sense?
   - All areas are in sqm. A 200 sqm house is ~2,150 sqft — perfectly normal
   - Living area > land area is usually wrong (apartments can be exceptions)
   - Living area < 5 sqm or > 50,000 sqm is suspicious
   - Land area > 10,000,000 sqm is suspicious (unless it's an island/ranch)
   - Living area = land area exactly could be valid (condo) or copy-paste error
   - DO NOT flag normal-sized houses (100–500 sqm) as too small

4. LOCATION_SUSPICIOUS — Does the location data make sense?
   - City should be a real place in the listed country
   - If country is empty but city is provided, that's fine (might be inferred)

5. CATEGORY_MISMATCH — Do parameters match the category?
   - Real estate should have area/bedrooms fields
   - Cars should have year, not bedrooms
   - Yacht/boat/jet categories exist too

6. MISSING_CRITICAL_DATA — Are essential fields missing?
   - Real estate should have: price (or POR), country, at least one area measurement
   - No price AND no POR flag = suspicious
   - Be lenient — many feeds don't provide all fields

7. PRICE_AREA_CONFLICT — Does price match the size?
   - $50M for 30sqm apartment (likely data error unless Monaco/NYC penthouse)
   - $10K for 500sqm villa (likely wrong price)

8. DATA_ENTRY_ERROR — Common data entry mistakes
   - Price in wrong currency (listed as USD but seems like local currency value)
   - Area in sq ft entered as sqm (values 10x too high — e.g. 2000 sqm house is suspicious, might be 2000 sqft = 186 sqm)
   - Decimal point errors

IMPORTANT RULES:
- Only flag CLEAR issues, not maybes
- Luxury properties CAN have extreme values — be VERY generous with thresholds
- If priceOnRequest is true, skip all price checks
- Empty/null fields alone are NOT flags unless truly critical
- Title is just for context — don't analyze title text quality
- When in doubt, do NOT flag — false positives are worse than false negatives

VERDICT:
- "reject" = 2+ high-severity flags, data is clearly garbage
- "review" = at least 1 medium+ flag, worth a human look
- "ok" = no flags or only low-severity ones

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "verdict": "reject" | "review" | "ok",
  "flags": [
    {
      "code": "FLAG_CODE",
      "severity": "high" | "medium" | "low",
      "message": "Clear explanation of the issue",
      "field": "which_field",
      "expected": "what's normal",
      "actual": "what was found"
    }
  ],
  "summary": "1-2 sentence summary of overall data quality",
  "confidence": 0.0-1.0
}

If everything looks fine, return:
{
  "verdict": "ok",
  "flags": [],
  "summary": "Parameters look consistent for a [type] in [country]",
  "confidence": 0.95
}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          temperature: 0.1,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      const textBlock = data.content?.find((b: any) => b.type === "text");
      const content = textBlock?.text || "";
      tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
      modelUsed = "deterministic+claude-haiku-4-5-20251001";

      try {
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        aiResult = JSON.parse(cleaned);
      } catch {
        aiResult = {
          verdict: "ok",
          flags: [],
          summary: "Failed to parse AI response — deterministic checks still applied",
          confidence: 0,
        };
      }

      // Validate AI result
      if (!["reject", "review", "ok"].includes(aiResult.verdict)) {
        aiResult.verdict = "ok";
      }
      if (!Array.isArray(aiResult.flags)) {
        aiResult.flags = [];
      }
    } catch (e) {
      // AI failed — deterministic checks still protect us
      console.error("AI scan failed, using deterministic checks only:", e);
      aiResult = {
        verdict: "ok",
        flags: [],
        summary: "AI analysis unavailable — deterministic checks applied",
        confidence: 0,
      };
    }

    // ─── Phase 3: Merge flags (deterministic take precedence) ──
    const mergedFlags: ScanFlag[] = [...deterministicFlags];
    const detKeys = new Set(
      deterministicFlags.map((f) => `${f.code}:${f.field || ""}`)
    );
    for (const aiFlag of aiResult.flags) {
      const key = `${aiFlag.code}:${aiFlag.field || ""}`;
      if (!detKeys.has(key)) {
        mergedFlags.push({
          code: aiFlag.code || "UNKNOWN",
          severity: (aiFlag.severity as "high" | "medium" | "low") || "low",
          message: aiFlag.message || "",
          field: aiFlag.field || undefined,
          expected: aiFlag.expected || undefined,
          actual: aiFlag.actual || undefined,
        });
      }
    }

    // Final verdict: worst of deterministic and AI verdicts
    const finalVerdict = worstVerdict(detVerdict, aiResult.verdict);

    // Build summary
    const parts: string[] = [];
    if (deterministicFlags.length > 0) {
      parts.push(`${deterministicFlags.length} threshold flag(s)`);
    }
    if (aiResult.flags.length > 0) {
      parts.push(`${aiResult.flags.length} AI flag(s)`);
    }
    const finalSummary =
      mergedFlags.length > 0
        ? `Found ${mergedFlags.length} issue(s) [${parts.join(", ")}]. ${aiResult.summary}`.trim()
        : aiResult.summary || "Parameters look consistent — no issues found.";

    // Confidence: lower when flags exist
    const finalConfidence =
      mergedFlags.length > 0
        ? Math.min(aiResult.confidence || 0.5, 0.3)
        : aiResult.confidence || 0.95;

    // Save to database (upserts — deletes old scan if exists)
    const scanId = await ctx.runMutation(internal.aiParamScan.saveScan, {
      listingId,
      jeId: listing.jeId,
      verdict: finalVerdict,
      flags: mergedFlags.map((f: any) => ({
        code: f.code || "UNKNOWN",
        severity: f.severity || "low",
        message: f.message || "",
        field: f.field || undefined,
        expected: f.expected || undefined,
        actual: f.actual || undefined,
      })),
      flagCount: mergedFlags.length,
      summary: finalSummary,
      confidence: finalConfidence,
      parametersChecked: params,
      model: modelUsed,
      tokensUsed,
    });

    return {
      scanId,
      verdict: finalVerdict,
      flags: mergedFlags,
      summary: finalSummary,
      confidence: finalConfidence,
      tokensUsed,
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

export const getScanByListing = internalQuery({
  args: { listingId: v.id("listings") },
  returns: v.any(),
  handler: async (ctx, { listingId }) => {
    return await ctx.db
      .query("aiParameterScans")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .first();
  },
});

export const getScanByJeId = query({
  args: { jeId: v.string() },
  returns: v.any(),
  handler: async (ctx, { jeId }) => {
    return await ctx.db
      .query("aiParameterScans")
      .withIndex("by_jeId", (q) => q.eq("jeId", jeId))
      .first();
  },
});

export const saveScan = internalMutation({
  args: {
    listingId: v.id("listings"),
    jeId: v.string(),
    verdict: v.string(),
    flags: v.array(
      v.object({
        code: v.string(),
        severity: v.string(),
        message: v.string(),
        field: v.optional(v.string()),
        expected: v.optional(v.string()),
        actual: v.optional(v.string()),
      })
    ),
    flagCount: v.number(),
    summary: v.string(),
    confidence: v.number(),
    parametersChecked: v.any(),
    model: v.string(),
    tokensUsed: v.optional(v.number()),
  },
  returns: v.id("aiParameterScans"),
  handler: async (ctx, args) => {
    // Upsert: delete existing scan for this listing first
    const existing = await ctx.db
      .query("aiParameterScans")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return await ctx.db.insert("aiParameterScans", {
      ...args,
      scannedAt: Date.now(),
    });
  },
});

// ─── Queries for Frontend ──────────────────────────────────────────

export const getRecentScans = query({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("aiParameterScans")
      .withIndex("by_scannedAt")
      .order("desc")
      .take(limit || 100);
  },
});

export const getScansByVerdict = query({
  args: { verdict: v.string(), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { verdict, limit }) => {
    return await ctx.db
      .query("aiParameterScans")
      .withIndex("by_verdict", (q) => q.eq("verdict", verdict))
      .order("desc")
      .take(limit || 100);
  },
});

export const getFlaggedScans = query({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { limit }) => {
    // Get all scans with at least 1 flag
    const all = await ctx.db
      .query("aiParameterScans")
      .withIndex("by_scannedAt")
      .order("desc")
      .take(300);
    return all.filter((s) => s.flagCount > 0).slice(0, limit || 100);
  },
});

// ─── Batch Scan (for existing listings) ─────────────────────────

export const batchScanListings = action({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { limit }): Promise<any> => {
    const batchSize = limit || 20;
    // Get recent listings that haven't been scanned yet
    const listings = await ctx.runQuery(internal.aiParamScan.getUnscannedListings, { limit: batchSize });

    const results: Array<{ jeId: string; verdict: string; flagCount: number }> = [];
    let errors = 0;

    for (const listing of listings) {
      try {
        const result = await ctx.runAction(api.aiParamScan.scanListingParameters, { listingId: listing._id });
        results.push({
          jeId: listing.jeId,
          verdict: result.verdict,
          flagCount: result.flags?.length || 0,
        });
      } catch (e) {
        console.error(`Scan failed for ${listing.jeId}:`, e);
        errors++;
      }
    }

    return {
      scanned: results.length,
      errors,
      results,
      remaining: listings.length === batchSize ? "more available" : "all done",
    };
  },
});

export const getUnscannedListings = internalQuery({
  args: { limit: v.number() },
  returns: v.any(),
  handler: async (ctx, { limit }) => {
    const allListings = await ctx.db
      .query("listings")
      .withIndex("by_importedAt")
      .order("desc")
      .take(300);

    // Filter out already-scanned listings
    const unscanned = [];
    for (const listing of allListings) {
      const scan = await ctx.db
        .query("aiParameterScans")
        .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
        .first();
      if (!scan) {
        unscanned.push(listing);
        if (unscanned.length >= limit) break;
      }
    }
    return unscanned;
  },
});

export const getStats = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const all = await ctx.db.query("aiParameterScans").collect();
    return {
      total: all.length,
      ok: all.filter((s) => s.verdict === "ok").length,
      review: all.filter((s) => s.verdict === "review").length,
      reject: all.filter((s) => s.verdict === "reject").length,
      totalFlags: all.reduce((sum, s) => sum + s.flagCount, 0),
    };
  },
});
