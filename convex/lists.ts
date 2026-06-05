import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─── Queries ─────────────────────────────────────────────────────

export const list = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await ctx.db.query("moderationLists").collect();
  },
});

export const getByName = query({
  args: { name: v.string() },
  returns: v.any(),
  handler: async (ctx, { name }) => {
    return await ctx.db
      .query("moderationLists")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
  },
});

export const getByCategory = query({
  args: { category: v.string() },
  returns: v.any(),
  handler: async (ctx, { category }) => {
    return await ctx.db
      .query("moderationLists")
      .withIndex("by_category", (q) => q.eq("category", category))
      .collect();
  },
});

export const getMultipleByNames = query({
  args: { names: v.array(v.string()) },
  returns: v.any(),
  handler: async (ctx, { names }) => {
    const results: Record<string, any> = {};
    for (const name of names) {
      const list = await ctx.db
        .query("moderationLists")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (list) {
        results[name] = list;
      }
    }
    return results;
  },
});

// ─── Mutations ───────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    source: v.optional(v.string()),
    items: v.array(
      v.object({
        value: v.string(),
        type: v.string(),
        pattern: v.optional(v.string()),
        flags: v.optional(v.string()),
      })
    ),
  },
  returns: v.id("moderationLists"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("moderationLists", {
      ...args,
      itemCount: args.items.length,
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("moderationLists"),
    displayName: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    items: v.optional(
      v.array(
        v.object({
          value: v.string(),
          type: v.string(),
          pattern: v.optional(v.string()),
          flags: v.optional(v.string()),
        })
      )
    ),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...updates }) => {
    const filtered: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) filtered[k] = val;
    }
    if (filtered.items) {
      filtered.itemCount = filtered.items.length;
    }
    filtered.updatedAt = Date.now();
    await ctx.db.patch(id, filtered);
    return null;
  },
});

export const addItem = mutation({
  args: {
    id: v.id("moderationLists"),
    item: v.object({
      value: v.string(),
      type: v.string(),
      pattern: v.optional(v.string()),
      flags: v.optional(v.string()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { id, item }) => {
    const list = await ctx.db.get(id);
    if (!list) return null;
    const newItems = [...list.items, item];
    await ctx.db.patch(id, {
      items: newItems,
      itemCount: newItems.length,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const removeItem = mutation({
  args: {
    id: v.id("moderationLists"),
    itemIndex: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { id, itemIndex }) => {
    const list = await ctx.db.get(id);
    if (!list) return null;
    const newItems = list.items.filter((_: any, i: number) => i !== itemIndex);
    await ctx.db.patch(id, {
      items: newItems,
      itemCount: newItems.length,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("moderationLists") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
    return null;
  },
});
