import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Store recognition results
export const saveResult = mutation({
  args: {
    listingId: v.optional(v.id("listings")),
    jeId: v.string(),
    title: v.string(),
    imageUrls: v.array(v.string()),
    llm: v.string(),
    result: v.any(),
    analyzedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("imageRecognitionResults", {
      listingId: args.listingId,
      jeId: args.jeId,
      title: args.title,
      imageUrls: args.imageUrls,
      llm: args.llm,
      result: args.result,
      analyzedAt: args.analyzedAt,
    });
  },
});

// List all recognition results
export const listResults = query({
  args: {},
  handler: async (ctx) => {
    const results = await ctx.db
      .query("imageRecognitionResults")
      .order("desc")
      .take(200);
    return results;
  },
});

// Delete a result
export const deleteResult = mutation({
  args: { id: v.id("imageRecognitionResults") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Clear all results
export const clearAllResults = mutation({
  args: {},
  handler: async (ctx) => {
    const results = await ctx.db.query("imageRecognitionResults").collect();
    for (const r of results) {
      await ctx.db.delete(r._id);
    }
    return results.length;
  },
});

// ═══════════════════════════════════════════════════════════════════
// Listing Image Analyses (per-image analysis by URL)
// ═══════════════════════════════════════════════════════════════════

// Save a listing analysis
export const saveListingAnalysis = mutation({
  args: {
    jeId: v.string(),
    title: v.string(),
    listingUrl: v.optional(v.string()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    realEstateType: v.optional(v.string()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    livingArea: v.optional(v.number()),
    office: v.optional(v.string()),
    totalImages: v.number(),
    analyzedImages: v.number(),
    perImageResults: v.any(),
    summary: v.any(),
    analyzedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("listingImageAnalyses", args);
  },
});

// List all listing analyses (most recent first)
export const listListingAnalyses = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("listingImageAnalyses")
      .order("desc")
      .take(50);
  },
});

// Delete a listing analysis
export const deleteListingAnalysis = mutation({
  args: { id: v.id("listingImageAnalyses") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Clear all listing analyses
export const clearAllListingAnalyses = mutation({
  args: {},
  handler: async (ctx) => {
    const results = await ctx.db.query("listingImageAnalyses").collect();
    for (const r of results) {
      await ctx.db.delete(r._id);
    }
    return results.length;
  },
});

// Get a single listing analysis by ID (used by Implio submission action)
export const getListingAnalysis = query({
  args: { id: v.id("listingImageAnalyses") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Update Implio submission status on a listing analysis
export const updateListingAnalysisImplioStatus = mutation({
  args: {
    id: v.id("listingImageAnalyses"),
    implioStatus: v.string(),
    implioSubmittedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      implioStatus: args.implioStatus,
      implioSubmittedAt: args.implioSubmittedAt,
    });
  },
});
