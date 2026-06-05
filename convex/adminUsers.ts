import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const DEFAULT_PASSWORD = "je_feedlens2026_1";

const resultValidator = v.object({
  success: v.boolean(),
  moderatorId: v.optional(v.string()),
  message: v.string(),
  password: v.string(),
});

/**
 * Public action to create a user with login credentials.
 * Called from the admin panel's Add User dialog.
 */
export const createUserWithLogin = action({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.string(),
    password: v.optional(v.string()),
  },
  returns: resultValidator,
  handler: async (ctx, args): Promise<{
    success: boolean;
    moderatorId?: string;
    message: string;
    password: string;
  }> => {
    const password = args.password || DEFAULT_PASSWORD;

    const result: { success: boolean; moderatorId?: string; message: string } =
      await ctx.runAction(internal.adminAuth.createUserWithAuth, {
        name: args.name,
        email: args.email,
        role: args.role,
        password,
      });

    return {
      ...result,
      password,
    };
  },
});

const passwordResultValidator = v.object({
  success: v.boolean(),
  message: v.string(),
});

/**
 * Public action to reset/set a user's password.
 * Called from the admin panel's user management.
 */
export const setUserPassword = action({
  args: {
    email: v.string(),
    newPassword: v.string(),
  },
  returns: passwordResultValidator,
  handler: async (ctx, args): Promise<{ success: boolean; message: string }> => {
    const result: { success: boolean; message: string } =
      await ctx.runAction(internal.adminAuth.resetUserPassword, {
        email: args.email,
        newPassword: args.newPassword,
      });
    return result;
  },
});
