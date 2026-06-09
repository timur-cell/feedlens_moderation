import { getAuthUserId } from "@convex-dev/auth/server";
import { api } from "./_generated/api";

/**
 * Shared authorization helpers.
 *
 * Roles (moderators.role): "admin" | "moderator" | "viewer"
 * Status (moderators.status): "active" | "invited" | "disabled"
 *
 * Policy:
 *  - Management operations (user/settings/rule/list CRUD) require an active "admin".
 *  - Moderation operations (scan/moderate/override) require any active moderator.
 *
 * Two variants are provided because Convex query/mutation contexts expose
 * `ctx.db` directly, while action contexts must reach the database through
 * `ctx.runQuery`. Both resolve the calling Convex Auth user to a row in the
 * `moderators` table by email.
 */

declare const process: { env: Record<string, string | undefined> };

type Moderator = {
  _id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

// ─── Query / mutation contexts (have ctx.db) ─────────────────────────

async function getModeratorFromDb(ctx: any): Promise<Moderator | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const authUser: any = await ctx.db.get(userId);
  const email: string | undefined = authUser?.email?.toLowerCase?.();
  if (!email) return null;
  return await ctx.db
    .query("moderators")
    .withIndex("by_email", (q: any) => q.eq("email", email))
    .first();
}

export async function requireModerator(ctx: any): Promise<Moderator> {
  const mod = await getModeratorFromDb(ctx);
  if (!mod || mod.status !== "active") {
    throw new Error("Unauthorized: an active moderator account is required.");
  }
  return mod;
}

export async function requireAdmin(ctx: any): Promise<Moderator> {
  const mod = await requireModerator(ctx);
  if (mod.role !== "admin") {
    throw new Error("Forbidden: admin role required.");
  }
  return mod;
}

// ─── Action contexts (no ctx.db — go through runQuery) ───────────────

async function getModeratorFromAction(ctx: any): Promise<Moderator | null> {
  const authUser: any = await ctx.runQuery(api.auth.currentUser, {});
  const email: string | undefined = authUser?.email?.toLowerCase?.();
  if (!email) return null;
  return await ctx.runQuery(api.users.getUserByEmail, { email });
}

export async function requireModeratorAction(ctx: any): Promise<Moderator> {
  const mod = await getModeratorFromAction(ctx);
  if (!mod || mod.status !== "active") {
    throw new Error("Unauthorized: an active moderator account is required.");
  }
  return mod;
}

export async function requireAdminAction(ctx: any): Promise<Moderator> {
  const mod = await requireModeratorAction(ctx);
  if (mod.role !== "admin") {
    throw new Error("Forbidden: admin role required.");
  }
  return mod;
}

// ─── System-or-moderator guard for trusted-pipeline write mutations ──
//
// A handful of listing-write mutations are invoked from two trusted callers:
//   1. The /api/push-flagged HTTP action, which authenticates with the
//      LAS_PUSH_API_KEY header (no Convex Auth user identity in that context).
//   2. Moderation actions triggered by a signed-in moderator (the user's
//      identity propagates through ctx.runMutation).
// They must stay rejecting anonymous public callers. This guard accepts the
// call when a valid system key is supplied OR when an active moderator made it.

export async function requireModeratorOrSystem(
  ctx: any,
  systemKey: string | undefined,
): Promise<void> {
  const expected = process.env.LAS_PUSH_API_KEY;
  if (systemKey && expected && timingSafeEqual(systemKey, expected)) return;
  await requireModerator(ctx);
}

// Constant-time string comparison for API keys. Inspects every character
// regardless of where the first mismatch occurs, so the comparison time
// doesn't leak how much of the key an attacker guessed correctly.
export function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
