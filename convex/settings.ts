import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─── Default Settings ────────────────────────────────────────────

const DEFAULTS = {
  // Alerts
  alertVolumePerHour: 500,
  alertVolumePerDay: 5000,
  alertOnScanFailures: true,
  alertOnApiErrors: true,
  alertOnRejectionSpikes: true,
  rejectionSpikeThreshold: 50, // % rejection rate triggers alert
  notificationEmail: "",
  notificationSlackWebhook: "",

  // AI
  paramScanModel: "claude-haiku-4-5-20251001",
  visionModel: "claude-haiku-4-5-20251001",
  visionCountries: ["ES", "IT", "PT", "FR", "GR"],
  autoApproveThreshold: 0.9,
  autoRejectThreshold: 0.85,
  aiTemperature: 0.1,

  // General
  defaultModerationAction: "auto",
  maxImagesPerVisionScan: 10,
  enableAutoModeration: true,
} as const;

const SETTINGS_KEY = "app_settings";

// ─── Queries ─────────────────────────────────────────────────────

export const getSettings = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();

    // Merge with defaults so UI always has values
    return {
      ...DEFAULTS,
      ...(row ? stripMeta(row) : {}),
      _id: row?._id,
    };
  },
});

export const getAlertSettings = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();
    return {
      alertVolumePerHour: row?.alertVolumePerHour ?? DEFAULTS.alertVolumePerHour,
      alertVolumePerDay: row?.alertVolumePerDay ?? DEFAULTS.alertVolumePerDay,
      alertOnScanFailures: row?.alertOnScanFailures ?? DEFAULTS.alertOnScanFailures,
      alertOnApiErrors: row?.alertOnApiErrors ?? DEFAULTS.alertOnApiErrors,
      alertOnRejectionSpikes: row?.alertOnRejectionSpikes ?? DEFAULTS.alertOnRejectionSpikes,
      rejectionSpikeThreshold: row?.rejectionSpikeThreshold ?? DEFAULTS.rejectionSpikeThreshold,
      notificationEmail: row?.notificationEmail ?? DEFAULTS.notificationEmail,
      notificationSlackWebhook: row?.notificationSlackWebhook ?? DEFAULTS.notificationSlackWebhook,
    };
  },
});

export const getAiSettings = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();
    return {
      paramScanModel: row?.paramScanModel ?? DEFAULTS.paramScanModel,
      visionModel: row?.visionModel ?? DEFAULTS.visionModel,
      visionCountries: row?.visionCountries ?? [...DEFAULTS.visionCountries],
      autoApproveThreshold: row?.autoApproveThreshold ?? DEFAULTS.autoApproveThreshold,
      autoRejectThreshold: row?.autoRejectThreshold ?? DEFAULTS.autoRejectThreshold,
      aiTemperature: row?.aiTemperature ?? DEFAULTS.aiTemperature,
      maxImagesPerVisionScan: row?.maxImagesPerVisionScan ?? DEFAULTS.maxImagesPerVisionScan,
      enableAutoModeration: row?.enableAutoModeration ?? DEFAULTS.enableAutoModeration,
    };
  },
});

// ─── Mutations ───────────────────────────────────────────────────

export const updateSettings = mutation({
  args: {
    // Alerts
    alertVolumePerHour: v.optional(v.number()),
    alertVolumePerDay: v.optional(v.number()),
    alertOnScanFailures: v.optional(v.boolean()),
    alertOnApiErrors: v.optional(v.boolean()),
    alertOnRejectionSpikes: v.optional(v.boolean()),
    rejectionSpikeThreshold: v.optional(v.number()),
    notificationEmail: v.optional(v.string()),
    notificationSlackWebhook: v.optional(v.string()),
    // AI
    paramScanModel: v.optional(v.string()),
    visionModel: v.optional(v.string()),
    visionCountries: v.optional(v.array(v.string())),
    autoApproveThreshold: v.optional(v.number()),
    autoRejectThreshold: v.optional(v.number()),
    aiTemperature: v.optional(v.number()),
    // General
    defaultModerationAction: v.optional(v.string()),
    maxImagesPerVisionScan: v.optional(v.number()),
    enableAutoModeration: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();

    // Filter out undefined values
    const updates: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(args)) {
      if (val !== undefined) updates[k] = val;
    }
    updates.updatedAt = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, updates);
    } else {
      await ctx.db.insert("settings", {
        key: SETTINGS_KEY,
        ...updates,
      } as any);
    }

    return null;
  },
});

export const resetToDefaults = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();

    if (existing) {
      await ctx.db.replace(existing._id, {
        key: SETTINGS_KEY,
        ...DEFAULTS,
        visionCountries: [...DEFAULTS.visionCountries],
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

// ─── Helpers ─────────────────────────────────────────────────────

function stripMeta(row: any) {
  const { _id, _creationTime, key, ...rest } = row;
  return rest;
}
