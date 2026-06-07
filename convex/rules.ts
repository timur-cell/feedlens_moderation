import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { requireAdmin, requireModerator } from "./authz";

// ─── Queries ─────────────────────────────────────────────────────

export const list = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await ctx.db.query("rules").collect();
  },
});

export const getByCategory = query({
  args: { category: v.string() },
  returns: v.any(),
  handler: async (ctx, { category }) => {
    return await ctx.db
      .query("rules")
      .withIndex("by_category", (q) => q.eq("category", category))
      .collect();
  },
});

export const getEnabled = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await ctx.db
      .query("rules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
  },
});

// ─── Mutations ───────────────────────────────────────────────────

export const getByListingCategory = query({
  args: { listingCategory: v.string() },
  returns: v.any(),
  handler: async (ctx, { listingCategory }) => {
    return await ctx.db
      .query("rules")
      .withIndex("by_listingCategory", (q) => q.eq("listingCategory", listingCategory))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    listingCategory: v.optional(v.string()),
    tier: v.string(),
    enabled: v.boolean(),
    action: v.string(),
    priority: v.number(),
    config: v.any(),
    sellerMessage: v.optional(v.string()),
    modifiedBy: v.optional(v.string()),
  },
  returns: v.id("rules"),
  handler: async (ctx, { modifiedBy, ...args }) => {
    await requireAdmin(ctx);
    const now = Date.now();
    return await ctx.db.insert("rules", {
      ...args,
      matchCount: 0,
      falsePositiveCount: 0,
      createdAt: now,
      lastModifiedAt: now,
      lastModifiedBy: modifiedBy || "system",
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("rules"),
    displayName: v.optional(v.string()),
    description: v.optional(v.string()),
    listingCategory: v.optional(v.string()),
    tier: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    action: v.optional(v.string()),
    priority: v.optional(v.number()),
    config: v.optional(v.any()),
    sellerMessage: v.optional(v.string()),
    modifiedBy: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, modifiedBy, ...updates }) => {
    await requireAdmin(ctx);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    filtered.lastModifiedAt = Date.now();
    if (modifiedBy) filtered.lastModifiedBy = modifiedBy;
    await ctx.db.patch(id, filtered);
    return null;
  },
});

export const toggleEnabled = mutation({
  args: { id: v.id("rules"), modifiedBy: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, modifiedBy }) => {
    await requireAdmin(ctx);
    const rule = await ctx.db.get(id);
    if (rule) {
      await ctx.db.patch(id, {
        enabled: !rule.enabled,
        lastModifiedAt: Date.now(),
        ...(modifiedBy ? { lastModifiedBy: modifiedBy } : {}),
      });
    }
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("rules") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(id);
    return null;
  },
});

export const incrementMatch = mutation({
  args: { id: v.id("rules") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireModerator(ctx);
    const rule = await ctx.db.get(id);
    if (rule) {
      await ctx.db.patch(id, {
        matchCount: (rule.matchCount || 0) + 1,
        lastMatchedAt: Date.now(),
      });
    }
    return null;
  },
});

export const incrementFalsePositive = mutation({
  args: { id: v.id("rules") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireModerator(ctx);
    const rule = await ctx.db.get(id);
    if (rule) {
      await ctx.db.patch(id, {
        falsePositiveCount: (rule.falsePositiveCount || 0) + 1,
      });
    }
    return null;
  },
});

// Migration: set listingCategory on all existing rules based on their name
export const migrateListingCategories = mutation({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const carsRules = new Set([
      "cars_low_price", "cars_no_year", "cars_freemium_low_price",
      "cars_truck_models", "cars_non_luxury_brand", "cars_model_check",
      "cars_por_models", "cars_por_not_luxury", "cars_high_price_not_luxury",
      "cars_vintage_low_price",
    ]);
    const rules = await ctx.db.query("rules").collect();
    let updated = 0;
    for (const rule of rules) {
      let lc = "real_estate";
      if (carsRules.has(rule.name)) lc = "cars";

      if (rule.listingCategory !== lc) {
        await ctx.db.patch(rule._id, { listingCategory: lc });
        updated++;
      }
    }
    return { updated, total: rules.length };
  },
});


// Migration: set createdAt/lastModifiedAt on existing rules that lack them
export const migrateAddTimestamps = mutation({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const allRules = await ctx.db.query("rules").collect();
    let updated = 0;
    const now = Date.now();
    for (const rule of allRules) {
      const patches: Record<string, any> = {};
      if (!rule.createdAt) patches.createdAt = rule._creationTime || now;
      if (!rule.lastModifiedAt) patches.lastModifiedAt = rule._creationTime || now;
      if (!rule.lastModifiedBy) patches.lastModifiedBy = "system (migrated)";
      if (Object.keys(patches).length > 0) {
        await ctx.db.patch(rule._id, patches);
        updated++;
      }
    }
    return { updated, total: allRules.length };
  },
});

// Migration: rename GPT → AI in all rule displayNames and descriptions
export const migrateGptToAi = mutation({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const allRules = await ctx.db.query("rules").collect();
    let updated = 0;
    for (const rule of allRules) {
      const patches: Record<string, string> = {};
      if (rule.displayName && rule.displayName.includes("GPT")) {
        patches.displayName = rule.displayName.replace(/GPT/g, "AI");
      }
      if (rule.description && rule.description.includes("GPT")) {
        patches.description = rule.description.replace(/GPT/g, "AI");
      }
      if (Object.keys(patches).length > 0) {
        await ctx.db.patch(rule._id, patches);
        updated++;
      }
    }
    return { updated, total: allRules.length };
  },
});


