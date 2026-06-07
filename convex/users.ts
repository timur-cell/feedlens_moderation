import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireModerator } from "./authz";

// ─── Queries ─────────────────────────────────────────────────────

export const listUsers = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireModerator(ctx);
    return await ctx.db.query("moderators").collect();
  },
});

export const getUserById = query({
  args: { id: v.id("moderators") },
  returns: v.any(),
  handler: async (ctx, { id }) => {
    await requireModerator(ctx);
    return await ctx.db.get(id);
  },
});

// NOTE: intentionally NOT gated — this is an auth primitive used by
// authz.requireModeratorAction() to resolve the calling user to a moderator
// row from action contexts. It only returns a single row matched by email.
export const getUserByEmail = query({
  args: { email: v.string() },
  returns: v.any(),
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("moderators")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
  },
});

export const getUserActivity = query({
  args: { moderatorId: v.id("moderators"), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { moderatorId, limit }) => {
    await requireModerator(ctx);
    return await ctx.db
      .query("moderatorActivity")
      .withIndex("by_moderator", (q) => q.eq("moderatorId", moderatorId))
      .order("desc")
      .take(limit || 20);
  },
});

export const getRecentActivity = query({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { limit }) => {
    await requireModerator(ctx);
    return await ctx.db
      .query("moderatorActivity")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit || 50);
  },
});

export const getStats = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireModerator(ctx);
    const all = await ctx.db.query("moderators").collect();
    return {
      total: all.length,
      active: all.filter((u) => u.status === "active").length,
      invited: all.filter((u) => u.status === "invited").length,
      disabled: all.filter((u) => u.status === "disabled").length,
      admins: all.filter((u) => u.role === "admin").length,
      moderators: all.filter((u) => u.role === "moderator").length,
      viewers: all.filter((u) => u.role === "viewer").length,
    };
  },
});

// ─── Mutations ───────────────────────────────────────────────────

export const createUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.string(),
    invitedBy: v.optional(v.string()),
  },
  returns: v.id("moderators"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    // Check for existing user with same email
    const existing = await ctx.db
      .query("moderators")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      throw new Error(`User with email ${args.email} already exists`);
    }

    const id = await ctx.db.insert("moderators", {
      name: args.name,
      email: args.email,
      role: args.role,
      status: "invited",
      createdAt: Date.now(),
      invitedBy: args.invitedBy,
      actionCount: 0,
    });

    // Log the activity
    await ctx.db.insert("moderatorActivity", {
      moderatorId: id,
      moderatorName: args.name,
      action: "invited",
      details: `Invited as ${args.role}${args.invitedBy ? ` by ${args.invitedBy}` : ""}`,
      timestamp: Date.now(),
    });

    return id;
  },
});

export const updateUser = mutation({
  args: {
    id: v.id("moderators"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...updates }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(id);
    if (!user) throw new Error("User not found");

    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );

    await ctx.db.patch(id, filtered);

    // Log changes
    const changes = Object.entries(filtered)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    await ctx.db.insert("moderatorActivity", {
      moderatorId: id,
      moderatorName: user.name,
      action: "profile_updated",
      details: `Updated: ${changes}`,
      timestamp: Date.now(),
    });

    return null;
  },
});

export const deleteUser = mutation({
  args: { id: v.id("moderators") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(id);
    if (!user) throw new Error("User not found");

    // Soft-delete: set status to disabled
    await ctx.db.patch(id, { status: "disabled" });

    await ctx.db.insert("moderatorActivity", {
      moderatorId: id,
      moderatorName: user.name,
      action: "disabled",
      details: "Account disabled",
      timestamp: Date.now(),
    });

    return null;
  },
});

export const reactivateUser = mutation({
  args: { id: v.id("moderators") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(id);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(id, { status: "active" });

    await ctx.db.insert("moderatorActivity", {
      moderatorId: id,
      moderatorName: user.name,
      action: "reactivated",
      details: "Account reactivated",
      timestamp: Date.now(),
    });

    return null;
  },
});

export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireModerator(ctx);
    // This is a placeholder — actual auth deletion would need @convex-dev/auth
    // For now, just return null to satisfy the SettingsPage reference
    return null;
  },
});

export const logActivity = mutation({
  args: {
    moderatorId: v.id("moderators"),
    action: v.string(),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    details: v.optional(v.string()),
  },
  returns: v.id("moderatorActivity"),
  handler: async (ctx, args) => {
    await requireModerator(ctx);
    const user = await ctx.db.get(args.moderatorId);
    if (!user) throw new Error("User not found");

    // Increment action count
    await ctx.db.patch(args.moderatorId, {
      actionCount: (user.actionCount || 0) + 1,
    });

    return await ctx.db.insert("moderatorActivity", {
      ...args,
      moderatorName: user.name,
      timestamp: Date.now(),
    });
  },
});
