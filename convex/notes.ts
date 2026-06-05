import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─── List notes for a listing ──────────────────────────────────

export const listByListing = query({
  args: { listingId: v.id("listings") },
  returns: v.any(),
  handler: async (ctx, { listingId }) => {
    return await ctx.db
      .query("moderationNotes")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .order("desc")
      .collect();
  },
});

// ─── Add a note ─────────────────────────────────────────────────

export const add = mutation({
  args: {
    listingId: v.id("listings"),
    jeId: v.string(),
    authorName: v.string(),
    authorRole: v.optional(v.string()),
    content: v.string(),
  },
  returns: v.id("moderationNotes"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("moderationNotes", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ─── Delete a note ──────────────────────────────────────────────

export const remove = mutation({
  args: { id: v.id("moderationNotes") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
    return null;
  },
});

// ─── Count notes for a listing ──────────────────────────────────

export const countByListing = query({
  args: { listingId: v.id("listings") },
  returns: v.any(),
  handler: async (ctx, { listingId }) => {
    const notes = await ctx.db
      .query("moderationNotes")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .collect();
    return notes.length;
  },
});
