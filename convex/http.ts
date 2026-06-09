import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";
import { timingSafeEqual } from "./authz";

const http = httpRouter();

// Auth HTTP routes — required by @convex-dev/auth for sign-in/sign-up flow
auth.addHttpRoutes(http);

// Image proxy - fetches img.jamesedition.com images server-side
// to avoid the 500 error from their CDN when browser User-Agent is present
http.route({
  path: "/image-proxy",
  method: "GET",
  handler: httpAction(async (_, request) => {
    const url = new URL(request.url);
    const imageUrl = url.searchParams.get("url");

    // Validate the parsed hostname, not the raw string — a substring check
    // would let attacker-controlled URLs through (open proxy / SSRF), e.g.
    // http://evil.com/?jamesedition.com
    let target: URL;
    try {
      target = new URL(imageUrl ?? "");
    } catch {
      return new Response("Invalid or missing url parameter", { status: 400 });
    }
    if (
      target.protocol !== "https:" ||
      (target.hostname !== "jamesedition.com" &&
        !target.hostname.endsWith(".jamesedition.com"))
    ) {
      return new Response("Invalid or missing url parameter", { status: 400 });
    }

    try {
      const response = await fetch(imageUrl, {
        headers: {
          "Accept": "*/*",
          // No User-Agent = no CDN 500 error
        },
      });

      if (!response.ok) {
        return new Response("Image fetch failed", { status: response.status });
      }

      const imageData = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "image/jpeg";

      return new Response(imageData, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, s-maxage=604800",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch {
      return new Response("Image fetch error", { status: 502 });
    }
  }),
});

// CORS preflight for the image proxy
http.route({
  path: "/image-proxy",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

// ─── LAS Push Endpoint ───────────────────────────────────────────
// Accepts batch of LAS-flagged listings from BigQuery/Airflow pipeline.
// Deduplicates: skips listings where ai_validated_at and user_message
// haven't changed since last push.
//
// POST /api/push-flagged
// Headers: X-Api-Key (must match LAS_PUSH_API_KEY env var)
// Body: { listings: [...] }

http.route({
  path: "/api/push-flagged",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Auth check
    const apiKey = process.env.LAS_PUSH_API_KEY;
    const provided = request.headers.get("X-Api-Key") || request.headers.get("x-api-key");
    if (!apiKey || !provided || !timingSafeEqual(provided, apiKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const listings = body.listings;
    if (!Array.isArray(listings) || listings.length === 0) {
      return new Response(JSON.stringify({ error: "listings array required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const results = {
      processed: 0,
      skipped: 0,
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const item of listings) {
      try {
        // Use the first id that is actually present. NOTE: String(a || b)
        // would yield the literal "undefined" when both are missing, which is
        // truthy and silently bypasses the guard below.
        const rawId = item.listing_id != null ? item.listing_id : item.jeId;
        const jeId = rawId != null ? String(rawId).trim() : "";
        if (!jeId) {
          results.errors.push("Missing listing_id");
          continue;
        }

        // Look up existing listing in FeedLens
        const existing = await ctx.runQuery(api.listings.getByJeId, { jeId });

        // Dedup: skip if ai_validated_at and user_message haven't changed
        if (existing) {
          const incomingValidatedAt = item.ai_validated_at
            ? new Date(item.ai_validated_at).getTime()
            : null;
          const existingValidatedAt = (existing as any).accuracySourceUpdatedAt || null;
          const incomingMessage = item.user_message || null;
          const existingMessage = (existing as any).accuracyUserMessage || null;

          if (
            incomingValidatedAt &&
            existingValidatedAt &&
            incomingValidatedAt === existingValidatedAt &&
            incomingMessage === existingMessage
          ) {
            results.skipped++;
            continue;
          }
        }

        // Build accuracy data
        const accuracyData = {
          accuracyScore: item.total_score != null ? Number(item.total_score) : undefined,
          // accuracyLabel removed — debug-only per Tarik
          accuracyFlags: item.flags || item.all_flags || undefined,
          // accuracyReview removed — debug-only per Tarik
          accuracyUserMessage: item.user_message || undefined,
          accuracyAction: item.action || undefined,
          accuracyScannedAt: Date.now(),
          accuracySourceUpdatedAt: item.ai_validated_at
            ? new Date(item.ai_validated_at).getTime()
            : Date.now(),
        };

        if (existing) {
          // Update existing listing with new accuracy data
          await ctx.runMutation(api.listings.patchAccuracyData, {
            id: (existing as any)._id,
            ...accuracyData,
            systemKey: apiKey,
          });

          // LAS-flagged listings go straight to manual review queue
          await ctx.runMutation(api.listings.updateStatus, {
            id: (existing as any)._id,
            status: "manual",
            systemKey: apiKey,
          });

          results.updated++;
        } else {
          // Create new listing entry (minimal data — will be enriched on moderation)
          await ctx.runMutation(api.listings.create, {
            jeId,
            title: item.headline || item.title || `Listing ${jeId}`,
            price: item.price_cents != null ? Number(item.price_cents) / 100 : undefined,
            currency: item.currency || undefined,
            category: "real_estate",
            realEstateType: item.real_estate_type || undefined,
            country: item.country || undefined,
            city: item.city || undefined,
            livingArea: item.living_area_sqm != null ? Number(item.living_area_sqm) : undefined,
            landArea: item.land_area_sqm != null ? Number(item.land_area_sqm) : undefined,
            bedrooms: item.bedrooms != null ? Number(item.bedrooms) : undefined,
            bathrooms: item.bathrooms != null ? Number(item.bathrooms) : undefined,
            officeSubscription: item.account_type || undefined,
            office: item.office_id ? String(item.office_id) : undefined,
            systemKey: apiKey,
          });

          // Now fetch the created listing to patch accuracy data
          const created = await ctx.runQuery(api.listings.getByJeId, { jeId });
          if (created) {
            await ctx.runMutation(api.listings.patchAccuracyData, {
              id: (created as any)._id,
              ...accuracyData,
              systemKey: apiKey,
            });
          }

          // Route to manual queue for human review
          if (created) {
            await ctx.runMutation(api.listings.updateStatus, {
              id: (created as any)._id,
              status: "manual",
              systemKey: apiKey,
            });

            // Schedule async enrichment: fetch full listing data from JE API
            // to fill in price, images, country, etc. that aren't in the LAS payload
            await ctx.scheduler.runAfter(0, internal.fetchListing.enrichListing, { jeId });
          }
          results.created++;
        }

        results.processed++;
      } catch (e: any) {
        results.errors.push(`${item.listing_id || "unknown"}: ${e?.message || "Unknown error"}`);
      }
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// CORS preflight for push-flagged
http.route({
  path: "/api/push-flagged",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

export default http;
