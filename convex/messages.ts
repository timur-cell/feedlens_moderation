import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await ctx.db.query("messageTemplates").collect();
  },
});

export const getByCategory = query({
  args: { category: v.string() },
  returns: v.any(),
  handler: async (ctx, { category }) => {
    return await ctx.db
      .query("messageTemplates")
      .filter((q) => q.eq(q.field("category"), category))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    displayName: v.string(),
    category: v.string(),
    subject: v.optional(v.string()),
    body: v.string(),
    isDefault: v.optional(v.boolean()),
  },
  returns: v.id("messageTemplates"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("messageTemplates", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("messageTemplates"),
    displayName: v.optional(v.string()),
    category: v.optional(v.string()),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...updates }) => {
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(id, filtered);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("messageTemplates") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
    return null;
  },
});
