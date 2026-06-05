import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,

  // ─── Listings ──────────────────────────────────────────────────
  listings: defineTable({
    jeId: v.string(), // JE listing ID
    title: v.string(),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    priceUsd: v.optional(v.number()),
    priceOnRequest: v.optional(v.boolean()),
    category: v.optional(v.string()), // real_estate, cars, etc.
    realEstateType: v.optional(v.string()), // villa, apartment, etc.
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    livingArea: v.optional(v.number()),
    landArea: v.optional(v.number()),
    imageCount: v.optional(v.number()),
    imageUrls: v.optional(v.array(v.string())),
    avgImageWidth: v.optional(v.number()),
    avgImageHeight: v.optional(v.number()),
    lqi: v.optional(v.number()), // listing quality index 0-100
    descriptionLength: v.optional(v.number()),
    description: v.optional(v.string()),
    office: v.optional(v.string()),
    officeGroupName: v.optional(v.string()),
    officeSubscription: v.optional(v.string()), // freemium, basic, premium
    feedSource: v.optional(v.string()), // Kyero, DealerCenter, etc.
    listingUrl: v.optional(v.string()),
    rental: v.optional(v.boolean()),
    preOwned: v.optional(v.boolean()),
    year: v.optional(v.number()),
    outdated: v.optional(v.boolean()),
    pricePerSqm: v.optional(v.number()),
    // GPT vision data (from existing ConditionRecognizer)
    chatGptConclusion: v.optional(v.string()),
    chatGptPropertyCondition: v.optional(v.number()),
    chatGptWatermarkShare: v.optional(v.number()),
    chatGptWatermarkText: v.optional(v.string()),
    chatGptImageQuality: v.optional(v.string()),
    chatGptImageType: v.optional(v.string()),
    // Raw data bucket for anything else
    rawData: v.optional(v.any()),
    // Listing Accuracy Score (LAS) data — from BigQuery pipeline
    accuracyScore: v.optional(v.number()), // 0-1 composite score
    // accuracyLabel + accuracyReview removed — debug fields (per Tarik)
    accuracyFlags: v.optional(v.array(v.string())), // SQL + AI flags from LAS

    accuracyUserMessage: v.optional(v.string()), // actionable message for seller
    accuracyAction: v.optional(v.string()), // "reject" or "warn" from LAS actions table
    accuracyScannedAt: v.optional(v.number()), // when LAS last evaluated this listing
    accuracySourceUpdatedAt: v.optional(v.number()), // ai_validated_at from BQ — used for dedup
    // Status
    moderationStatus: v.string(), // "pending", "approved", "rejected", "notice", "manual"
    batchId: v.optional(v.string()), // for grouping batch imports
    importedAt: v.number(),
  })
    .index("by_jeId", ["jeId"])
    .index("by_status", ["moderationStatus"])
    .index("by_batch", ["batchId"])
    .index("by_importedAt", ["importedAt"])
    .index("by_country", ["country"])
    .index("by_feedSource", ["feedSource"]),

  // ─── Moderation Results ──────────────────────────────────────
  moderationResults: defineTable({
    listingId: v.id("listings"),
    jeId: v.string(),
    outcome: v.string(), // "approved", "rejected", "notice", "manual"
    ruleMatches: v.array(
      v.object({
        ruleName: v.string(),
        ruleCategory: v.string(), // "simple", "regex", "llm", "office", "duplicate"
        tier: v.string(), // "auto", "verify", "manual"
        action: v.string(), // "reject", "notice", "flag"
        message: v.optional(v.string()),
        details: v.optional(v.string()),
      })
    ),
    // LLM assessment (if triggered)
    llmTriggered: v.boolean(),
    llmResponse: v.optional(
      v.object({
        scores: v.optional(
          v.object({
            condition: v.optional(v.number()),
            watermark: v.optional(v.boolean()),
            quality: v.optional(v.number()),
            policyOk: v.optional(v.boolean()),
          })
        ),
        assessment: v.optional(v.string()),
        recommendation: v.optional(v.string()),
        confidence: v.optional(v.number()),
        notice: v.optional(v.string()),
        model: v.optional(v.string()),
        tokensUsed: v.optional(v.number()),
      })
    ),
    sellerMessage: v.optional(v.string()),
    // Refuse reason type (mirrors Implio taxonomy)
    refuseReasonType: v.optional(v.string()), // "other", "images", "illegal", "duplicate"
    // AI Vision analysis result (from Claude/GPT image analysis)
    visionResult: v.optional(v.any()),
    visionModel: v.optional(v.string()), // "claude-sonnet-4-20250514", "gpt-4o", etc.
    // Confidence
    confidence: v.optional(v.number()),
    // Override tracking
    overriddenBy: v.optional(v.string()),
    overriddenAt: v.optional(v.number()),
    overrideReason: v.optional(v.string()),
    originalOutcome: v.optional(v.string()),
    processedAt: v.number(),
  })
    .index("by_listing", ["listingId"])
    .index("by_jeId", ["jeId"])
    .index("by_outcome", ["outcome"])
    .index("by_processedAt", ["processedAt"]),

  // ─── Rules Configuration ─────────────────────────────────────
  rules: defineTable({
    name: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
    category: v.string(), // "simple_code", "hybrid_vision", "auto_ai", "former_manual", "internal"
    listingCategory: v.optional(v.string()), // "real_estate", "cars", "all" — which listing type this rule applies to
    tier: v.string(), // "auto" (high conf), "verify" (medium), "manual" (low)
    enabled: v.boolean(),
    action: v.string(), // "reject", "notice", "flag"
    priority: v.number(), // lower = runs first
    // Rule config (varies by category)
    config: v.any(),
    // Seller message
    sellerMessage: v.optional(v.string()),
    // Stats
    matchCount: v.optional(v.number()),
    falsePositiveCount: v.optional(v.number()),
    lastMatchedAt: v.optional(v.number()),
    // Audit trail
    createdAt: v.optional(v.number()),
    lastModifiedAt: v.optional(v.number()),
    lastModifiedBy: v.optional(v.string()), // email or name of modifier
  })
    .index("by_name", ["name"])
    .index("by_category", ["category"])
    .index("by_enabled", ["enabled"])
    .index("by_listingCategory", ["listingCategory"]),

  // ─── Message Templates ───────────────────────────────────────
  messageTemplates: defineTable({
    name: v.string(),
    displayName: v.string(),
    category: v.string(), // "reject", "notice"
    subject: v.optional(v.string()),
    body: v.string(),
    isDefault: v.optional(v.boolean()),
  }).index("by_name", ["name"]),

  // ─── Moderators (user management) ─────────────────────────────
  moderators: defineTable({
    name: v.string(),
    email: v.string(),
    role: v.string(), // "admin", "moderator", "viewer"
    status: v.string(), // "active", "invited", "disabled"
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
    invitedBy: v.optional(v.string()),
    actionCount: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"])
    .index("by_role", ["role"]),

  // ─── Moderator Activity Log ──────────────────────────────────
  moderatorActivity: defineTable({
    moderatorId: v.id("moderators"),
    moderatorName: v.string(),
    action: v.string(), // "approve", "reject", "notice", "override", "login", "rule_edit"
    targetType: v.optional(v.string()), // "listing", "rule", "message"
    targetId: v.optional(v.string()),
    details: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_moderator", ["moderatorId"])
    .index("by_timestamp", ["timestamp"]),

  // ─── AI Image Recognition Results ─────────────────────────────
  imageRecognitionResults: defineTable({
    listingId: v.optional(v.id("listings")),
    jeId: v.string(),
    title: v.string(),
    imageUrls: v.array(v.string()),
    llm: v.string(), // "claude", "gpt"
    result: v.any(), // The raw LLM response with scores
    analyzedAt: v.number(),
  })
    .index("by_jeId", ["jeId"])
    .index("by_llm", ["llm"])
    .index("by_analyzedAt", ["analyzedAt"]),

  // ─── Listing Image Analyses (per-image analysis by URL) ───────
  listingImageAnalyses: defineTable({
    jeId: v.string(),
    title: v.string(),
    listingUrl: v.optional(v.string()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    realEstateType: v.optional(v.string()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    livingArea: v.optional(v.number()),
    office: v.optional(v.string()),
    totalImages: v.number(),
    analyzedImages: v.number(),
    perImageResults: v.any(), // array of per-image VisionResult objects
    summary: v.any(), // aggregated scores { avgCondition, avgConclusion, ... }
    analyzedAt: v.number(),
    implioStatus: v.optional(v.string()), // "approved" | "rejected" | undefined
    implioSubmittedAt: v.optional(v.number()),
  })
    .index("by_jeId", ["jeId"])
    .index("by_analyzedAt", ["analyzedAt"]),

  // ─── Moderation Lists ─────────────────────────────────────────
  moderationLists: defineTable({
    name: v.string(), // unique identifier e.g. "RE_Commercial_properties_2023"
    displayName: v.string(),
    description: v.optional(v.string()),
    category: v.string(), // "automotive", "exceptions", "image_quality", "location", "real_estate.availability", etc.
    source: v.optional(v.string()), // "screenshots", "implio", "manual"
    items: v.array(
      v.object({
        value: v.string(),
        type: v.string(), // "exact" or "regex"
        pattern: v.optional(v.string()), // regex pattern (without flags)
        flags: v.optional(v.string()), // regex flags e.g. "i"
      })
    ),
    itemCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_category", ["category"]),

  // ─── Moderation Notes (internal comments per listing) ─────────
  moderationNotes: defineTable({
    listingId: v.id("listings"),
    jeId: v.string(),
    authorName: v.string(),
    authorRole: v.optional(v.string()),
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_listing", ["listingId"])
    .index("by_jeId", ["jeId"])
    .index("by_createdAt", ["createdAt"]),

  // ─── AI Parameter Scans ────────────────────────────────────────
  aiParameterScans: defineTable({
    listingId: v.id("listings"),
    jeId: v.string(),
    // AI verdict: "reject", "review", "ok"
    verdict: v.string(),
    // Flags found
    flags: v.array(
      v.object({
        code: v.string(), // e.g. "PRICE_SUSPICIOUS", "AREA_MISMATCH"
        severity: v.string(), // "high", "medium", "low"
        message: v.string(), // human-readable explanation
        field: v.optional(v.string()), // which parameter triggered it
        expected: v.optional(v.string()), // what AI expected
        actual: v.optional(v.string()), // what it found
      })
    ),
    flagCount: v.number(),
    // AI reasoning
    summary: v.string(),
    confidence: v.number(),
    // Parameters that were checked (snapshot)
    parametersChecked: v.any(),
    // Meta
    model: v.string(),
    tokensUsed: v.optional(v.number()),
    scannedAt: v.number(),
  })
    .index("by_listing", ["listingId"])
    .index("by_jeId", ["jeId"])
    .index("by_verdict", ["verdict"])
    .index("by_scannedAt", ["scannedAt"])
    .index("by_flagCount", ["flagCount"]),

  // ─── App Settings (single-row config) ──────────────────────
  settings: defineTable({
    key: v.string(), // "app_settings" — single row

    // ── Alerts & Monitoring ──
    alertVolumePerHour: v.optional(v.number()),
    alertVolumePerDay: v.optional(v.number()),
    alertOnScanFailures: v.optional(v.boolean()),
    alertOnApiErrors: v.optional(v.boolean()),
    alertOnRejectionSpikes: v.optional(v.boolean()),
    rejectionSpikeThreshold: v.optional(v.number()), // percentage, e.g. 50
    notificationEmail: v.optional(v.string()),
    notificationSlackWebhook: v.optional(v.string()),

    // ── AI Configuration ──
    paramScanModel: v.optional(v.string()), // e.g. "claude-haiku-4-5-20251001"
    visionModel: v.optional(v.string()), // e.g. "claude-sonnet-4-20250514"
    visionCountries: v.optional(v.array(v.string())), // ISO codes, e.g. ["ES","IT","PT","FR","GR"]
    autoApproveThreshold: v.optional(v.number()), // 0-1 confidence
    autoRejectThreshold: v.optional(v.number()), // 0-1 confidence
    aiTemperature: v.optional(v.number()), // 0-1

    // ── General / Moderation ──
    defaultModerationAction: v.optional(v.string()), // "manual" | "auto"
    maxImagesPerVisionScan: v.optional(v.number()),
    enableAutoModeration: v.optional(v.boolean()),

    // ── Meta ──
    updatedAt: v.optional(v.number()),
    updatedBy: v.optional(v.string()),
  }).index("by_key", ["key"]),

  // ─── Moderation Stats (daily snapshots) ──────────────────────
  dailyStats: defineTable({
    date: v.string(), // "2026-03-12"
    total: v.number(),
    approved: v.number(),
    rejected: v.number(),
    noticed: v.number(),
    manual: v.number(),
    llmCalls: v.number(),
    avgConfidence: v.optional(v.number()),
  }).index("by_date", ["date"]),

  // ─── Remediation Results (Shadow Lab) ─────────────────────────
  remediationResults: defineTable({
    listingId: v.id("listings"),
    jeId: v.string(),
    // Overall assessment
    hasFixableErrors: v.boolean(),
    errorCount: v.number(),
    totalConfidence: v.number(), // avg confidence across suggestions
    // Detected errors with fix suggestions
    suggestions: v.array(
      v.object({
        errorType: v.string(), // "bedroom_anomaly", "area_conversion", "price_anomaly", "description_quality", "placeholder_text", "all_caps", "missing_details"
        severity: v.string(), // "high", "medium", "low"
        field: v.string(), // which field has the error
        currentValue: v.string(), // what's there now
        suggestedFix: v.string(), // proposed fix
        explanation: v.string(), // why this is likely wrong
        confidence: v.number(), // 0-1
      })
    ),
    // Description quality scoring
    descriptionScore: v.optional(
      v.object({
        overall: v.number(), // 0-100
        length: v.string(), // "too_short", "ok", "good"
        hasPlaceholder: v.boolean(),
        hasAllCaps: v.boolean(),
        hasAutoTranslateArtifacts: v.boolean(),
        missingKeyDetails: v.optional(v.array(v.string())),
      })
    ),
    // Source info
    feedSource: v.optional(v.string()),
    office: v.optional(v.string()),
    category: v.optional(v.string()),
    country: v.optional(v.string()),
    // Meta
    model: v.string(),
    tokensUsed: v.optional(v.number()),
    scannedAt: v.number(),
  })
    .index("by_listing", ["listingId"])
    .index("by_jeId", ["jeId"])
    .index("by_hasFixableErrors", ["hasFixableErrors"])
    .index("by_scannedAt", ["scannedAt"])
    .index("by_feedSource", ["feedSource"])
    .index("by_office", ["office"]),
});

export default schema;
