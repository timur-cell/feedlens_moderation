"use node";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { requireModeratorAction } from "./authz";

// ─── Types ───────────────────────────────────────────────────────

interface FetchedListing {
  jeId: string;
  title: string;
  price?: number;
  currency?: string;
  priceUsd?: number;
  priceOnRequest?: boolean;
  category?: string;
  realEstateType?: string;
  country?: string;
  city?: string;
  state?: string;
  bedrooms?: number;
  bathrooms?: number;
  livingArea?: number;
  landArea?: number;
  imageCount?: number;
  imageUrls?: string[];
  descriptionLength?: number;
  description?: string;
  office?: string;
  officeGroupName?: string;
  officeSubscription?: string;
  listingUrl?: string;
  rawData?: Record<string, unknown>;
}

// ─── JE Mobile API ──────────────────────────────────────────────
// The JE mobile API at /api/mobile/v1/listings/:id returns full listing
// data as JSON without Cloudflare blocking. This is our primary data source.

interface MobileApiListing {
  listing_id: number;
  headline: string;
  price: string; // "$1,200,000" or "Price On Request"
  price_on_request: boolean;
  bedrooms: number | null;
  bathrooms: string | null; // "7 Baths"
  living_area: string | null; // "23240 sqft" or "2159 Sq. Mt."
  humanized_location: string; // "Villa in Apulia, Italy" (has type prefix)
  location_name?: string; // "Apulia, Italy" (clean, no type prefix)
  address: string;
  images: string[];
  description: string;
  property_type: string;
  office_name: string;
  url: string;
  is_active: boolean;
  latitude: number;
  longitude: number;
  listed_at: string;
  updated_at: string;
  views: number;
  saves: number;
  year_built: number | null;
  lot_size: { value: number; unit: string; formatted: string } | null;
  listing_reference: string | null;
  floor_plan_images: string[];
  room_type_images: Record<string, string[]>;
  has_video: boolean;
  has_virtual_tour: boolean;
  office_listings_count: number | null;
  office_address: string | null;
  [key: string]: unknown;
}

function parseMobileApiPrice(priceStr: string): { price: number; currency: string } | null {
  if (!priceStr) return null;
  // Match patterns like "$1,200,000", "€950,000", "£2,500,000", "1.200.000 €"
  const m = priceStr.match(/([€$£])\s*([\d,.\s]+)/) || priceStr.match(/([\d,.\s]+)\s*([€$£])/);
  if (!m) return null;
  const symbols: Record<string, string> = { '$': 'USD', '€': 'EUR', '£': 'GBP' };
  const symIdx = m[1].match(/[€$£]/) ? 1 : 2;
  const numIdx = symIdx === 1 ? 2 : 1;
  const sym = m[symIdx].trim();
  // Normalize number: remove spaces, handle both 1,200,000 and 1.200.000
  let numStr = m[numIdx].trim();
  // If has both . and , — detect format
  if (numStr.includes(',') && numStr.includes('.')) {
    // $1,200,000.00 or €1.200.000,00
    if (numStr.lastIndexOf(',') > numStr.lastIndexOf('.')) {
      numStr = numStr.replace(/\./g, '').replace(',', '.'); // European
    } else {
      numStr = numStr.replace(/,/g, ''); // US
    }
  } else {
    numStr = numStr.replace(/[,\s]/g, '');
  }
  const price = parseFloat(numStr);
  if (isNaN(price)) return null;
  return { price, currency: symbols[sym] || 'USD' };
}

function parseNumericValue(str: string | null | undefined): number | null {
  if (!str) return null;
  const m = str.match(/([\d,.\s]+)/);
  if (!m) return null;
  return parseInt(m[1].replace(/[,\s]/g, ''));
}

function parseLivingArea(str: string | null | undefined): number | null {
  if (!str) return null;
  const num = parseNumericValue(str);
  if (num === null) return null;
  // Convert sqft to sqm if needed
  if (/sqft/i.test(str)) {
    return Math.round(num * 0.0929);
  }
  return num;
}

// Strip property type prefixes like "House in ", "Villa in ", "Apartment in " from location strings
const PROPERTY_TYPE_PREFIX_RE = /^(House|Apartment|Villa|Penthouse|Land|Estate|Condo|Office|Studio|Townhouse|Other|Plot|Chalet|Castle|Farm|Mansion|Duplex|Loft|Bungalow|Cottage|Ranch)\s+in\s+/i;

function stripPropertyTypePrefix(loc: string): string {
  return loc.replace(PROPERTY_TYPE_PREFIX_RE, '');
}

function parseLocation(humanized: string, address: string): { country?: string; city?: string; state?: string } {
  // humanized_location may contain type prefix: "Villa in Dubai, United Arab Emirates"
  // Strip prefix before parsing to get clean location parts.
  const raw = humanized || address || '';
  const loc = stripPropertyTypePrefix(raw);
  const parts = loc.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      country: parts[parts.length - 1],
      state: parts.length >= 3 ? parts[parts.length - 2] : undefined,
      city: parts[0],
    };
  }
  if (parts.length === 1) {
    return { country: parts[0] };
  }
  return {};
}

async function fetchFromMobileApi(jeId: string): Promise<FetchedListing | null> {
  try {
    const response = await fetch(
      `https://www.jamesedition.com/api/mobile/v1/listings/${jeId}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'FeedLens/1.0',
        },
      }
    );

    if (response.status !== 200) return null;

    const data = await response.json();
    const listing: MobileApiListing = data.listing;
    if (!listing) return null;

    // Parse price
    const parsed = parseMobileApiPrice(listing.price);
    const priceOnRequest = listing.price_on_request || false;

    // Parse location — prefer location_name (clean, no type prefix) over humanized_location
    const locationSource = listing.location_name || listing.humanized_location;
    const location = parseLocation(locationSource, listing.address);

    // Parse bedrooms (can be number or null)
    const bedrooms = typeof listing.bedrooms === 'number' ? listing.bedrooms : null;

    // Parse bathrooms (string like "7 Baths")
    const bathrooms = parseNumericValue(listing.bathrooms);

    // Parse living area (string like "23240 sqft")
    const livingArea = parseLivingArea(listing.living_area);

    // Parse land area from lot_size
    const landArea = listing.lot_size?.value ? Math.round(listing.lot_size.value) : undefined;

    // Collect all image URLs (main images + floor plans)
    const allImages = [...(listing.images || [])];
    if (listing.floor_plan_images?.length) {
      allImages.push(...listing.floor_plan_images);
    }

    return {
      jeId,
      title: listing.headline || `Listing ${jeId}`,
      price: parsed?.price,
      currency: parsed?.currency,
      priceOnRequest: priceOnRequest || undefined,
      category: 'real_estate',
      realEstateType: listing.property_type || undefined,
      country: location.country,
      city: location.city,
      state: location.state,
      bedrooms: bedrooms ?? undefined,
      bathrooms: bathrooms ?? undefined,
      livingArea: livingArea ?? undefined,
      landArea: landArea && landArea > 0 ? landArea : undefined,
      imageCount: allImages.length || undefined,
      imageUrls: allImages.length > 0 ? allImages.slice(0, 30) : undefined,
      descriptionLength: listing.description?.length,
      description: listing.description?.substring(0, 5000),
      office: listing.office_name || undefined,
      listingUrl: listing.url || `https://www.jamesedition.com/real_estate/${jeId}`,
      rawData: {
        source: 'mobile_api',
        latitude: listing.latitude,
        longitude: listing.longitude,
        listedAt: listing.listed_at,
        updatedAt: listing.updated_at,
        views: listing.views,
        saves: listing.saves,
        yearBuilt: listing.year_built,
        hasVideo: listing.has_video,
        hasVirtualTour: listing.has_virtual_tour,
        officeListingsCount: listing.office_listings_count,
        listingReference: listing.listing_reference,
        isActive: listing.is_active,
      },
    };
  } catch {
    return null;
  }
}

// ─── Search API (fallback when single-listing API returns 500) ───
// The search API at /api/mobile/v1/listings?listing_id=ID returns listing
// data in search-result format. Less detailed than single-listing API but
// includes images, title, price, beds/baths, area, location, and office.

interface SearchApiListing {
  listing_id: number;
  headline: string;
  price: string;
  bedrooms: string | null; // "3 Beds"
  bathrooms: string | null; // "3 Baths"
  living_area: string | null; // "2961 sqft"
  humanized_location: string;
  images: string[];
  office_name: string;
  available: boolean;
  is_new: boolean;
  has_video: boolean;
  has_virtual_tour: boolean;
  [key: string]: unknown;
}

async function fetchFromSearchApi(jeId: string): Promise<FetchedListing | null> {
  try {
    const response = await fetch(
      `https://www.jamesedition.com/api/mobile/v1/listings?listing_id=${jeId}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'FeedLens/1.0',
        },
      }
    );

    if (response.status !== 200) return null;

    const data = await response.json();
    const listings = data.listings;
    if (!Array.isArray(listings) || listings.length === 0) return null;

    const listing: SearchApiListing = listings[0];
    if (!listing || listing.listing_id !== parseInt(jeId)) return null;

    // Parse price
    const priceOnRequest = listing.price === 'P.O.R.' || listing.price?.toLowerCase().includes('request');
    const parsed = priceOnRequest ? null : parseMobileApiPrice(listing.price);

    // Parse location — search API format: "House in ulaanbaatar, Mongolia"
    // parseLocation already strips property type prefixes via stripPropertyTypePrefix()
    const location = parseLocation(listing.humanized_location || '', '');

    // Also extract real estate type from the prefix
    const typeMatch = (listing.humanized_location || '').match(/^(\w+)\s+in\s+/i);
    const realEstateType = typeMatch ? typeMatch[1] : undefined;

    // Parse bedrooms/bathrooms (string format: "3 Beds", "3 Baths")
    const bedrooms = parseNumericValue(listing.bedrooms);
    const bathrooms = parseNumericValue(listing.bathrooms);

    // Parse living area
    const livingArea = parseLivingArea(listing.living_area);

    // Collect images
    const allImages = listing.images || [];

    return {
      jeId,
      title: listing.headline || `Listing ${jeId}`,
      price: parsed?.price,
      currency: parsed?.currency,
      priceOnRequest: priceOnRequest || undefined,
      category: 'real_estate',
      realEstateType,
      country: location.country,
      city: location.city,
      state: location.state,
      bedrooms: bedrooms ?? undefined,
      bathrooms: bathrooms ?? undefined,
      livingArea: livingArea ?? undefined,
      imageCount: allImages.length || undefined,
      imageUrls: allImages.length > 0 ? allImages.slice(0, 30) : undefined,
      office: listing.office_name || undefined,
      listingUrl: `https://www.jamesedition.com/listing/${jeId}`,
      rawData: {
        source: 'search_api',
        isNew: listing.is_new,
        hasVideo: listing.has_video,
        hasVirtualTour: listing.has_virtual_tour,
        available: listing.available,
      },
    };
  } catch {
    return null;
  }
}

// ─── HTML Parsing (fallback if mobile API fails) ─────────────────

function extractLdJson(html: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const regex = /<script\s+type\s*=\s*["']application\/ld\+json["']\s*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      results.push(JSON.parse(match[1]));
    } catch { /* skip malformed JSON */ }
  }
  return results;
}

function extractMeta(html: string, property: string): string | null {
  const r1 = new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, 'i');
  const m1 = html.match(r1);
  if (m1) return m1[1];
  const r2 = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${property}["']`, 'i');
  const m2 = html.match(r2);
  if (m2) return m2[1];
  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

async function fetchFromHtml(jeId: string, url: string): Promise<FetchedListing | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (response.status !== 200) return null;

    const html = await response.text();
    if (html.includes('Just a moment') || html.includes('cf-browser-verification')) {
      return null;
    }

    const ldJsonBlocks = extractLdJson(html);
    const product = ldJsonBlocks.find((d) => d['@type'] === 'Product') as Record<string, unknown> | undefined;
    if (!product) return null; // Not a listing page

    const ogTitle = extractMeta(html, 'og:title');
    const pageTitle = extractTitle(html);
    const title = ogTitle || (product?.name as string) || pageTitle || `Listing ${jeId}`;

    let price: number | undefined;
    let currency: string | undefined;
    let description: string | undefined;
    let imageUrls: string[] = [];

    if (product) {
      const offers = product.offers as Record<string, unknown> | undefined;
      if (offers?.price) {
        price = typeof offers.price === 'string' ? parseFloat(offers.price) : (offers.price as number);
        currency = (offers.priceCurrency as string) || 'USD';
      }
      description = product.description as string | undefined;
      if (Array.isArray(product.image)) {
        imageUrls = product.image as string[];
      }
    }

    if (!description) {
      description = extractMeta(html, 'og:description') || undefined;
    }

    // Extract img.jamesedition.com URLs from HTML
    const imgRegex = /https:\/\/img\.jamesedition\.com\/listing_images\/[^"'\s>)\\,]+/g;
    const htmlImgs = new Set<string>();
    let m;
    while ((m = imgRegex.exec(html)) !== null) htmlImgs.add(m[0].replace(/&amp;/g, '&'));
    if (htmlImgs.size > imageUrls.length) imageUrls = Array.from(htmlImgs);

    const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const bedsMatch = bodyText.match(/(\d+)\s*Beds?/i);
    const bathsMatch = bodyText.match(/(\d+)\s*Baths?/i);
    const sqmMatch = bodyText.match(/([\d,]+)\s*(?:Sq\.?\s*[Mm]|m²)/i);
    const sqftMatch = bodyText.match(/([\d,]+)\s*Sqft/i);

    let livingArea: number | undefined;
    if (sqmMatch) livingArea = parseInt(sqmMatch[1].replace(/,/g, ''));
    else if (sqftMatch) livingArea = Math.round(parseInt(sqftMatch[1].replace(/,/g, '')) * 0.0929);

    return {
      jeId,
      title: title.replace(/\s*\|\s*JamesEdition$/, '').trim(),
      price,
      currency,
      category: 'real_estate',
      bedrooms: bedsMatch ? parseInt(bedsMatch[1]) : undefined,
      bathrooms: bathsMatch ? parseInt(bathsMatch[1]) : undefined,
      livingArea,
      imageCount: imageUrls.length || undefined,
      imageUrls: imageUrls.length > 0 ? imageUrls.slice(0, 30) : undefined,
      descriptionLength: description?.length,
      description: description?.substring(0, 5000),
      listingUrl: url,
      rawData: { source: 'html_scrape', ldJson: product },
    };
  } catch {
    return null;
  }
}

// ─── Country Code Resolution ─────────────────────────────────────
// Resolve country name/region to ISO code for vision gating.
// Replicates the same mapping logic from moderation.ts.
const COUNTRY_NAME_TO_CODE_MAP: Record<string, string> = {
  "spain": "ES", "italy": "IT", "portugal": "PT", "france": "FR", "greece": "GR",
  "united states": "US", "usa": "US", "united kingdom": "UK", "uk": "UK",
  "germany": "DE", "austria": "AT", "switzerland": "CH", "netherlands": "NL",
  "belgium": "BE", "sweden": "SE", "norway": "NO", "denmark": "DK", "finland": "FI",
  "ireland": "IE", "croatia": "HR", "turkey": "TR", "cyprus": "CY", "malta": "MT",
  "monaco": "MC", "luxembourg": "LU", "montenegro": "ME",
  "united arab emirates": "AE", "uae": "AE", "thailand": "TH",
  "australia": "AU", "canada": "CA", "mexico": "MX", "brazil": "BR",
  "south africa": "ZA", "morocco": "MA", "russia": "RU", "china": "CN", "india": "IN",
};
const REGION_TO_CODE_MAP: Record<string, string> = {
  "algarve": "PT", "lisbon": "PT", "madeira": "PT", "azores": "PT", "porto": "PT",
  "balearic islands": "ES", "andalusia": "ES", "catalonia": "ES", "canary islands": "ES",
  "valencia": "ES", "galicia": "ES", "basque country": "ES",
  "tuscany": "IT", "sardinia": "IT", "sicily": "IT", "lombardy": "IT", "lazio": "IT",
  "puglia": "IT", "liguria": "IT", "umbria": "IT", "veneto": "IT", "campania": "IT",
  "provence-alpes-côte d'azur": "FR", "île-de-france": "FR", "corsica": "FR",
  "brittany": "FR", "normandy": "FR", "occitanie": "FR",
  "crete": "GR", "peloponnese": "GR", "attica": "GR", "cyclades": "GR",
  "florida": "US", "california": "US", "new york": "US", "texas": "US",
  "dubai": "AE", "abu dhabi": "AE",
};

function resolveCountryCode(country: string): string {
  if (!country) return "";
  const lower = country.toLowerCase().trim();
  // Already an ISO code (2 letters)?
  if (/^[A-Z]{2}$/i.test(country.trim())) return country.trim().toUpperCase();
  // Full country name?
  if (COUNTRY_NAME_TO_CODE_MAP[lower]) return COUNTRY_NAME_TO_CODE_MAP[lower];
  // Region name?
  if (REGION_TO_CODE_MAP[lower]) return REGION_TO_CODE_MAP[lower];
  return country.trim().toUpperCase();
}

// ─── Main Action: Fetch and Moderate by IDs ──────────────────────

export const fetchAndModerate = action({
  args: {
    inputs: v.array(v.string()), // Can be listing IDs or full URLs
  },
  returns: v.any(),
  handler: async (ctx, { inputs }) => {
    await requireModeratorAction(ctx);
    const results: Array<{
      jeId: string;
      input: string;
      listingId?: string;
      title?: string;
      outcome?: string;
      ruleMatches?: number;
      ruleMatchDetails?: Array<{
        ruleName: string;
        ruleCategory: string;
        action: string;
        tier: string;
        message?: string;
        details?: string;
      }>;
      llmTriggered?: boolean;
      visionAnalyzed?: boolean;
      error?: string;
      status: string;
      dataSource?: string;
      aiScan?: {
        verdict: string;
        flagCount: number;
        summary: string;
        confidence: number;
        flags: Array<{
          code: string;
          severity: string;
          message: string;
          field?: string;
          expected?: string;
          actual?: string;
        }>;
      };
    }> = [];

    for (const input of inputs) {
      const trimmed = input.trim();
      if (!trimmed) continue;

      try {
        // Determine if input is URL or ID
        const isUrl = trimmed.startsWith('http');
        let jeId: string;
        let url: string;

        if (isUrl) {
          // Extract ID from URL — prefer a 5+ digit number right after - or /
          const idMatch = trimmed.match(/[-\/](\d{5,})(?:[?#]|$)/);
          if (idMatch) {
            jeId = idMatch[1];
          } else {
            // Fallback: pick the longest standalone run of 5+ digits (ties → the
            // last one). Avoids concatenating unrelated digits across the whole
            // URL (e.g. a "2024" in the slug + an "?ref=12345678" tracking param),
            // which previously produced a wrong id via replace(/\D/g,'').slice(-8).
            const digitRuns = trimmed.match(/\d{5,}/g) || [];
            jeId = digitRuns.sort(
              (a, b) => a.length - b.length || trimmed.lastIndexOf(a) - trimmed.lastIndexOf(b),
            ).pop() || "";
          }
          url = trimmed;
        } else {
          jeId = trimmed.replace(/\D/g, '');
          url = `https://www.jamesedition.com/listing/${jeId}`;
        }

        if (!jeId || jeId.length < 5) {
          results.push({ jeId: trimmed, input: trimmed, error: "Invalid listing ID", status: "error" });
          continue;
        }

        // ─── Fetch listing data with cascading sources ───
        let listingData: FetchedListing | null = null;
        let dataSource = "none";

        // Source 1: JE Mobile API (best — full JSON data, no Cloudflare)
        listingData = await fetchFromMobileApi(jeId);
        if (listingData) {
          dataSource = "mobile_api";
        }

        // Source 2: JE Search API (fallback — less detail but handles 500s from single-listing API)
        if (!listingData) {
          listingData = await fetchFromSearchApi(jeId);
          if (listingData) dataSource = "search_api";
        }

        // Source 3: HTML scraping (fallback if both APIs fail)
        if (!listingData) {
          listingData = await fetchFromHtml(jeId, url);
          if (listingData) dataSource = "html_scrape";
        }

        // Source 4: Minimal record (last resort — all data sources failed)
        if (!listingData) {
          listingData = {
            jeId,
            title: `Listing ${jeId}`,
            listingUrl: isUrl ? url : undefined,
            category: 'real_estate',
            rawData: {
              source: 'minimal',
              dataFetchFailed: true,
              fetchFailedAt: new Date().toISOString(),
              fetchFailedReason: 'Both mobile API and HTML scraping failed',
            },
          };
          dataSource = "minimal";
        }

        // Compute price per sqm if both price and living area are available
        const priceForCalc = listingData.price;
        const areaForCalc = listingData.livingArea;
        const pricePerSqm = (priceForCalc && priceForCalc > 0 && areaForCalc && areaForCalc > 0)
          ? Math.round(priceForCalc / areaForCalc)
          : undefined;

        // Create listing in FeedLens
        const listingId = await ctx.runMutation(api.listings.create, {
          jeId: listingData.jeId,
          title: listingData.title,
          price: listingData.price,
          currency: listingData.currency,
          priceOnRequest: listingData.priceOnRequest,
          category: listingData.category,
          realEstateType: listingData.realEstateType,
          country: listingData.country,
          city: listingData.city,
          state: listingData.state,
          bedrooms: listingData.bedrooms,
          bathrooms: listingData.bathrooms,
          livingArea: listingData.livingArea,
          landArea: listingData.landArea,
          imageCount: listingData.imageCount,
          imageUrls: listingData.imageUrls,
          descriptionLength: listingData.descriptionLength,
          description: listingData.description,
          office: listingData.office,
          officeGroupName: listingData.officeGroupName,
          officeSubscription: listingData.officeSubscription,
          listingUrl: listingData.listingUrl,
          pricePerSqm,
          rawData: listingData.rawData,
        });

        // Run AI vision only for high-risk countries (ES, IT, PT, FR, GR) by default.
        // Other countries skip vision here — it can be triggered on-demand by Auto AI rules.
        const VISION_COUNTRIES = ["ES", "IT", "PT", "FR", "GR"];
        const listingCountryCode = resolveCountryCode(listingData.country || "");
        const shouldRunVision = VISION_COUNTRIES.includes(listingCountryCode);

        let visionAnalyzed = false;
        if (shouldRunVision && listingData.imageUrls && listingData.imageUrls.length > 0) {
          try {
            const visionResult = await ctx.runAction(
              api.imageRecognitionActions.analyzeForModeration,
              {
                imageUrls: listingData.imageUrls.slice(0, 10),
                listingTitle: listingData.title,
                jeId,
              }
            );
            if (visionResult && !visionResult.error && visionResult.property_condition !== null) {
              await ctx.runMutation(api.listings.patchVisionScores, {
                id: listingId,
                chatGptPropertyCondition: visionResult.property_condition,
                chatGptConclusion: visionResult.conclusion !== null ? String(visionResult.conclusion) : undefined,
                chatGptWatermarkShare: visionResult.watermark_share ?? undefined,
                chatGptWatermarkText: visionResult.watermark_text ?? undefined,
                chatGptImageQuality: visionResult.image_quality ?? undefined,
                chatGptImageType: visionResult.image_type ?? undefined,
              });
              visionAnalyzed = true;
            }
          } catch {
            // Continue without vision
          }
        }

        // If data fetch failed (minimal record), skip moderation and route to manual review
        if (dataSource === "minimal") {
          // Save a moderation result explaining the data fetch failure
          await ctx.runMutation(internal.moderation.saveResult, {
            listingId,
            jeId,
            outcome: "manual",
            ruleMatches: [{
              ruleName: "data_fetch_failed",
              ruleCategory: "internal",
              tier: "manual",
              action: "flag",
              message: "⚠️ Data Fetch Failed — both JE Mobile API and HTML scraping returned errors. Cannot evaluate this listing without data.",
              details: "Mobile API: HTTP 500; HTML: Cloudflare 403",
            }],
            llmTriggered: false,
            confidence: 0,
          });

          results.push({
            jeId,
            input: trimmed,
            listingId: listingId as string,
            title: listingData.title,
            outcome: "manual",
            ruleMatches: 1,
            llmTriggered: false,
            visionAnalyzed: false,
            error: "Data fetch failed — routed to manual review",
            status: "success",
            dataSource,
          });
          continue;
        }

        // Run moderation engine (only when we have actual data)
        const modResult = await ctx.runAction(api.moderation.moderateListing, { listingId });

        // Fetch AI parameter scan result (saved during moderation)
        let aiScan: any = null;
        try {
          aiScan = await ctx.runQuery(api.aiParamScan.getScanByJeId, { jeId });
        } catch { /* scan may not exist */ }

        results.push({
          jeId,
          input: trimmed,
          listingId: listingId as string,
          title: listingData.title,
          outcome: modResult.outcome,
          ruleMatches: modResult.ruleMatches?.length || 0,
          ruleMatchDetails: (modResult.ruleMatches || []).map((rm: any) => ({
            ruleName: rm.ruleName,
            ruleCategory: rm.ruleCategory,
            action: rm.action,
            tier: rm.tier,
            message: rm.message,
            details: rm.details,
          })),
          llmTriggered: modResult.llmTriggered,
          visionAnalyzed,
          status: "success",
          dataSource,
          aiScan: aiScan ? {
            verdict: aiScan.verdict,
            flagCount: aiScan.flagCount,
            summary: aiScan.summary,
            confidence: aiScan.confidence,
            flags: aiScan.flags,
          } : undefined,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ jeId: trimmed, input: trimmed, error: msg, status: "error" });
      }
    }

    return {
      success: true,
      count: results.length,
      successCount: results.filter(r => r.status === "success").length,
      errorCount: results.filter(r => r.status === "error").length,
      results,
    };
  },
});

/**
 * Internal action: enrich a listing record by fetching full data from JE.
 * Used by the push-flagged API to fill in missing fields (price, images, etc.)
 * after creating a minimal listing record from the LAS pipeline.
 */
export const enrichListing = internalAction({
  args: {
    jeId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    dataSource: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { jeId }) => {
    try {
      // Fetch from JE APIs with cascading fallback
      let listingData: FetchedListing | null = null;
      let dataSource = "none";

      listingData = await fetchFromMobileApi(jeId);
      if (listingData) dataSource = "mobile_api";

      if (!listingData) {
        listingData = await fetchFromSearchApi(jeId);
        if (listingData) dataSource = "search_api";
      }

      if (!listingData) {
        listingData = await fetchFromHtml(jeId, `https://www.jamesedition.com/listing/${jeId}`);
        if (listingData) dataSource = "html_scrape";
      }

      if (!listingData) {
        return { success: false, error: "All data sources failed" };
      }

      // Get the existing listing
      const existing = await ctx.runQuery(api.listings.getByJeId, { jeId });
      if (!existing) {
        return { success: false, error: "Listing not found in database" };
      }

      // Compute price per sqm
      const pricePerSqm =
        listingData.price && listingData.price > 0 && listingData.livingArea && listingData.livingArea > 0
          ? Math.round(listingData.price / listingData.livingArea)
          : undefined;

      // Patch the listing with full data (only fill missing fields)
      await ctx.runMutation(api.listings.patch, {
        id: (existing as any)._id,
        title: listingData.title,
        price: listingData.price,
        currency: listingData.currency,
        priceUsd: listingData.priceUsd,
        priceOnRequest: listingData.priceOnRequest,
        category: listingData.category || "real_estate",
        realEstateType: listingData.realEstateType,
        country: listingData.country,
        city: listingData.city,
        state: listingData.state,
        bedrooms: listingData.bedrooms,
        bathrooms: listingData.bathrooms,
        livingArea: listingData.livingArea,
        landArea: listingData.landArea,
        imageCount: listingData.imageCount,
        imageUrls: listingData.imageUrls,
        descriptionLength: listingData.descriptionLength,
        description: listingData.description,
        office: listingData.office,
        officeGroupName: listingData.officeGroupName,
        officeSubscription: listingData.officeSubscription,
        listingUrl: listingData.listingUrl,
        pricePerSqm,
        // Scheduled/internal context has no signed-in moderator — authorize the
        // write with the trusted-pipeline key.
        systemKey: process.env.LAS_PUSH_API_KEY,
      });

      return { success: true, dataSource };
    } catch (e: any) {
      return { success: false, error: e?.message || "Unknown error" };
    }
  },
});
