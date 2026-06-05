import { internalMutation } from "./_generated/server";

// One-shot cleanup: delete any leftover legacy template test-auth
// account row (``agent@test.local``) from the ``authAccounts`` table.
// Written by ``backend/viktor/scripts/revoke_legacy_test_auth.py``.
// Safe to leave on disk after the run: ``internalMutation`` is not
// reachable from the public HTTP API, so this file cannot be invoked
// by an outside caller.
export const revoke = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "test").eq("providerAccountId", "agent@test.local"),
      )
      .collect();
    for (const r of rows) {
      await ctx.db.delete(r._id);
    }
    return { deleted: rows.length };
  },
});
