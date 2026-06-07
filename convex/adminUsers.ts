import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdminAction } from "./authz";
import { DEFAULT_USER_PASSWORD } from "./serverConfig";

const DEFAULT_PASSWORD = DEFAULT_USER_PASSWORD;

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
    const admin = await requireAdminAction(ctx);

    const password = args.password || DEFAULT_PASSWORD;

    const result: { success: boolean; moderatorId?: string; message: string } =
      await ctx.runAction(internal.adminAuth.createUserWithAuth, {
        name: args.name,
        email: args.email,
        role: args.role,
        password,
        invitedBy: admin.email,
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
    await requireAdminAction(ctx);

    const result: { success: boolean; message: string } =
      await ctx.runAction(internal.adminAuth.resetUserPassword, {
        email: args.email,
        newPassword: args.newPassword,
      });
    return result;
  },
});
