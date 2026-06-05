import { createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { Scrypt } from "lucia";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const DEFAULT_PASSWORD = "je_feedlens2026_1";

/**
 * Create a user with auth account — called from admin panel.
 * Creates both a moderator record and a Convex Auth account
 * so the user can log in immediately.
 */
export const createUserWithAuth = internalAction({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.string(),
    password: v.optional(v.string()),
    invitedBy: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    moderatorId: v.optional(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const password = args.password || DEFAULT_PASSWORD;
    const email = args.email.trim().toLowerCase();

    // 1. Create auth account (Convex Auth via "test" provider)
    // Note: pass raw password — createAccount hashes via provider's hashSecret
    try {
      await createAccount(ctx, {
        provider: "test",
        account: {
          id: email,
          secret: password,
        },
        profile: {
          email,
          name: args.name,
          emailVerificationTime: Date.now(),
        },
        shouldLinkViaEmail: false,
      });
    } catch (err: any) {
      // If account already exists, that's OK for re-setting
      if (!err?.message?.includes("already exists") && !err?.message?.includes("unique")) {
        return {
          success: false,
          message: `Failed to create auth account: ${err?.message || err}`,
        };
      }
    }

    // 2. Create moderator record
    try {
      const moderatorId: string = await ctx.runMutation(
        internal.adminAuth.createModeratorRecord,
        {
          name: args.name,
          email,
          role: args.role,
          invitedBy: args.invitedBy,
        }
      );
      return {
        success: true,
        moderatorId,
        message: `User ${args.name} created with password`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Auth account created but moderator record failed: ${err?.message || err}`,
      };
    }
  },
});

/**
 * Internal mutation to create the moderator record.
 */
export const createModeratorRecord = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.string(),
    invitedBy: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    // Check for existing
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
      status: "active", // admin-created users are immediately active
      createdAt: Date.now(),
      invitedBy: args.invitedBy,
      actionCount: 0,
    });

    await ctx.db.insert("moderatorActivity", {
      moderatorId: id,
      moderatorName: args.name,
      action: "invited",
      details: `Created as ${args.role} with login credentials${args.invitedBy ? ` by ${args.invitedBy}` : ""}`,
      timestamp: Date.now(),
    });

    return id;
  },
});

/**
 * Reset a user's password — called from admin panel.
 */
export const resetUserPassword = internalAction({
  args: {
    email: v.string(),
    newPassword: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    try {
      // Try to retrieve existing account first
      try {
        // Update the authAccounts table directly (needs pre-hashed password)
        const hashedPassword = await new Scrypt().hash(args.newPassword);
        await ctx.runMutation(internal.adminAuth.updatePasswordHash, {
          email,
          hashedPassword,
        });

        return {
          success: true,
          message: `Password updated for ${email}`,
        };
      } catch {
        // Account doesn't exist — create it
        // Pass raw password — createAccount hashes via provider's hashSecret
        await createAccount(ctx, {
          provider: "test",
          account: {
            id: email,
            secret: args.newPassword,
          },
          profile: {
            email,
            name: email.split("@")[0],
            emailVerificationTime: Date.now(),
          },
          shouldLinkViaEmail: false,
        });

        return {
          success: true,
          message: `Auth account created for ${email} with new password`,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to reset password: ${err?.message || err}`,
      };
    }
  },
});

/**
 * Internal mutation to update the password hash in authAccounts.
 */
export const updatePasswordHash = internalMutation({
  args: {
    email: v.string(),
    hashedPassword: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Find the auth account for this provider + email
    const account = await ctx.db
      .query("authAccounts")
      .filter((q) =>
        q.and(
          q.eq(q.field("provider"), "test"),
          q.eq(q.field("providerAccountId"), args.email)
        )
      )
      .first();

    if (!account) {
      throw new Error(`No auth account found for ${args.email}`);
    }

    // Update the secret (hashed password)
    await ctx.db.patch(account._id, {
      secret: args.hashedPassword,
    });

    return null;
  },
});
