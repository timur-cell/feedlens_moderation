import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireModeratorOrSystem } from "./authz";

// ─── Queries ─────────────────────────────────────────────────────

export const getById = query({
  args: { id: v.id("listings") },
  returns: v.any(),
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const getByJeId = query({
  args: { jeId: v.string() },
  returns: v.any(),
  handler: async (ctx, { jeId }) => {
    return await ctx.db
      .query("listings")
      .withIndex("by_jeId", (q) => q.eq("jeId", jeId))
      .first();
  },
});

export const listPending = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("moderationStatus", "manual"))
      .order("desc")
      .take(100);
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("listings")
      .withIndex("by_importedAt")
      .order("desc")
      .take(limit || 50);
  },
});

export const listByStatus = query({
  args: { status: v.string(), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { status, limit }) => {
    return await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("moderationStatus", status))
      .order("desc")
      .take(limit || 50);
  },
});

export const listByBatch = query({
  args: { batchId: v.string() },
  returns: v.any(),
  handler: async (ctx, { batchId }) => {
    return await ctx.db
      .query("listings")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
  },
});

// ─── Stats ───────────────────────────────────────────────────────

export const getStats = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const all = await ctx.db.query("listings").collect();
    const total = all.length;
    const approved = all.filter((l) => l.moderationStatus === "approved").length;
    const rejected = all.filter((l) => l.moderationStatus === "rejected").length;
    const noticed = all.filter((l) => l.moderationStatus === "notice").length;
    const manual = all.filter((l) => l.moderationStatus === "manual").length;
    const pending = all.filter((l) => l.moderationStatus === "pending").length;

    return { total, approved, rejected, noticed, manual, pending };
  },
});

// ─── Mutations ───────────────────────────────────────────────────

export const create = mutation({
  args: {
    jeId: v.string(),
    title: v.string(),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    priceUsd: v.optional(v.number()),
    priceOnRequest: v.optional(v.boolean()),
    category: v.optional(v.string()),
    realEstateType: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    livingArea: v.optional(v.number()),
    landArea: v.optional(v.number()),
    imageCount: v.optional(v.number()),
    imageUrls: v.optional(v.array(v.string())),
    avgImageWidth: v.optional(v.number()),
    avgImageHeight: v.optional(v.number()),
    lqi: v.optional(v.number()),
    descriptionLength: v.optional(v.number()),
    description: v.optional(v.string()),
    office: v.optional(v.string()),
    officeGroupName: v.optional(v.string()),
    officeSubscription: v.optional(v.string()),
    feedSource: v.optional(v.string()),
    listingUrl: v.optional(v.string()),
    rental: v.optional(v.boolean()),
    preOwned: v.optional(v.boolean()),
    year: v.optional(v.number()),
    outdated: v.optional(v.boolean()),
    pricePerSqm: v.optional(v.number()),
    chatGptConclusion: v.optional(v.string()),
    chatGptPropertyCondition: v.optional(v.number()),
    chatGptWatermarkShare: v.optional(v.number()),
    chatGptWatermarkText: v.optional(v.string()),
    chatGptImageQuality: v.optional(v.string()),
    chatGptImageType: v.optional(v.string()),
    rawData: v.optional(v.any()),
    batchId: v.optional(v.string()),
    // Trusted-pipeline key (HTTP push / scheduled enrichment). Never persisted.
    systemKey: v.optional(v.string()),
  },
  returns: v.id("listings"),
  handler: async (ctx, { systemKey, ...args }) => {
    await requireModeratorOrSystem(ctx, systemKey);
    // Check for existing listing with same jeId
    const existing = await ctx.db
      .query("listings")
      .withIndex("by_jeId", (q) => q.eq("jeId", args.jeId))
      .first();

    if (existing) {
      // Update existing listing and reset to pending
      await ctx.db.patch(existing._id, {
        ...args,
        moderationStatus: "pending",
        importedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("listings", {
      ...args,
      moderationStatus: "pending",
      importedAt: Date.now(),
    });
  },
});

// Patch listing with vision AI scores (from Claude/GPT analysis)
export const patchVisionScores = mutation({
  args: {
    id: v.id("listings"),
    chatGptPropertyCondition: v.optional(v.number()),
    chatGptConclusion: v.optional(v.string()),
    chatGptWatermarkShare: v.optional(v.number()),
    chatGptWatermarkText: v.optional(v.string()),
    chatGptImageQuality: v.optional(v.string()),
    chatGptImageType: v.optional(v.string()),
    systemKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, systemKey, ...scores }) => {
    await requireModeratorOrSystem(ctx, systemKey);
    // Only patch non-null values
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scores)) {
      if (value !== undefined && value !== null) {
        patch[key] = value;
      }
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(id, patch);
    }
    return null;
  },
});

// Patch listing with LAS accuracy data (from BigQuery pipeline push)
export const patchAccuracyData = mutation({
  args: {
    id: v.id("listings"),
    accuracyScore: v.optional(v.number()),
    // accuracyLabel removed — debug-only field per Tarik
    accuracyFlags: v.optional(v.array(v.string())),
    // accuracyReview removed — debug-only field per Tarik
    accuracyUserMessage: v.optional(v.string()),
    accuracyAction: v.optional(v.string()),
    accuracyScannedAt: v.optional(v.number()),
    accuracySourceUpdatedAt: v.optional(v.number()),
    systemKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, systemKey, ...data }) => {
    await requireModeratorOrSystem(ctx, systemKey);
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        patch[key] = value;
      }
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(id, patch);
    }
    return null;
  },
});

/**
 * Generic patch for enriching listing data (used by enrichListing action).
 * Only sets fields that are provided and non-null.
 */
export const patch = mutation({
  args: {
    id: v.id("listings"),
    title: v.optional(v.string()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    priceUsd: v.optional(v.number()),
    priceOnRequest: v.optional(v.boolean()),
    category: v.optional(v.string()),
    realEstateType: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    livingArea: v.optional(v.number()),
    landArea: v.optional(v.number()),
    imageCount: v.optional(v.number()),
    imageUrls: v.optional(v.array(v.string())),
    descriptionLength: v.optional(v.number()),
    description: v.optional(v.string()),
    office: v.optional(v.string()),
    officeGroupName: v.optional(v.string()),
    officeSubscription: v.optional(v.string()),
    listingUrl: v.optional(v.string()),
    pricePerSqm: v.optional(v.number()),
    systemKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, systemKey, ...data }) => {
    await requireModeratorOrSystem(ctx, systemKey);
    const patchData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        patchData[key] = value;
      }
    }
    if (Object.keys(patchData).length > 0) {
      await ctx.db.patch(id, patchData);
    }
    return null;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("listings"),
    status: v.string(),
    systemKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, status, systemKey }) => {
    await requireModeratorOrSystem(ctx, systemKey);
    await ctx.db.patch(id, { moderationStatus: status });
    return null;
  },
});
