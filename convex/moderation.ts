import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireModerator, requireModeratorAction } from "./authz";

// ─── Types ───────────────────────────────────────────────────────

interface RuleMatch {
  ruleName: string;
  ruleCategory: string;
  tier: string;
  action: string;
  message?: string;
  details?: string;
}

interface ListingData {
  _id: string;
  jeId: string;
  title: string;
  price?: number;
  priceUsd?: number;
  priceOnRequest?: boolean;
  category?: string;
  realEstateType?: string;
  country?: string;
  city?: string;
  imageCount?: number;
  avgImageWidth?: number;
  avgImageHeight?: number;
  lqi?: number;
  descriptionLength?: number;
  description?: string;
  office?: string;
  officeGroupName?: string;
  officeId?: string | number;
  officeSubscription?: string;
  accountType?: string;
  officeGroupId?: string;
  feedSource?: string;
  livingArea?: number;
  landArea?: number;
  bedrooms?: number;
  bathrooms?: number;
  pricePerSqm?: number;
  rental?: boolean;
  outdated?: boolean;
  chatGptConclusion?: string;
  chatGptPropertyCondition?: number;
  chatGptWatermarkShare?: number;
  chatGptWatermarkText?: string;
  chatGptImageQuality?: string;
  chatGptImageType?: string;
  imageUrls?: string[];
  listingUrl?: string;
  [key: string]: unknown;
}

interface RuleConfig {
  field?: string;
  operator?: string;
  value?: unknown;
  conditions?: Array<{ field: string; operator: string; value: unknown }>;
  patterns?: string[];
  fields?: string[];
  textLists?: Record<string, string[]>;
  officeIds?: string[];
  officeNames?: string[];
  [key: string]: unknown;
}

interface Rule {
  _id: string;
  name: string;
  displayName: string;
  category: string;
  tier: string;
  enabled: boolean;
  action: string;
  priority: number;
  config: RuleConfig;
  sellerMessage?: string;
}

// ─── Country Name ↔ Code Normalization ──────────────────────────
// Rules use ISO codes (ES, IT, PT) but listing data often has full names (Spain, Italy, Portugal).
// This map handles bidirectional normalization so country filters always match.
// Regions that JE sometimes uses instead of country names in humanized_location
const REGION_TO_COUNTRY_CODE: Record<string, string> = {
  "algarve": "PT", "lisbon": "PT", "madeira": "PT", "azores": "PT", "porto": "PT",
  "balearic islands": "ES", "andalusia": "ES", "catalonia": "ES", "canary islands": "ES",
  "valencia": "ES", "galicia": "ES", "basque country": "ES", "castile and león": "ES",
  "tuscany": "IT", "sardinia": "IT", "sicily": "IT", "lombardy": "IT", "lazio": "IT",
  "puglia": "IT", "apulia": "IT", "liguria": "IT", "umbria": "IT", "veneto": "IT",
  "campania": "IT", "emilia-romagna": "IT", "piedmont": "IT", "calabria": "IT",
  "provence-alpes-côte d'azur": "FR", "île-de-france": "FR", "occitanie": "FR",
  "nouvelle-aquitaine": "FR", "brittany": "FR", "normandy": "FR", "corsica": "FR",
  "crete": "GR", "peloponnese": "GR", "attica": "GR", "thessaly": "GR",
  "macedonia and thrace": "GR", "cyclades": "GR", "dodecanese": "GR", "ionian islands": "GR",
  "dubai": "AE", "abu dhabi": "AE", "sharjah": "AE",
  "bavaria": "DE", "scotland": "GB", "england": "GB", "wales": "GB",
  "queensland": "AU", "new south wales": "AU", "victoria": "AU",
  "florida": "US", "california": "US", "new york": "US", "texas": "US",
};

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  // Full name → ISO code (lowercase keys for case-insensitive matching)
  "spain": "ES", "italy": "IT", "portugal": "PT", "france": "FR", "greece": "GR",
  "united states": "US", "usa": "US", "united kingdom": "UK", "uk": "UK",
  "germany": "DE", "austria": "AT", "switzerland": "CH", "netherlands": "NL",
  "belgium": "BE", "sweden": "SE", "norway": "NO", "denmark": "DK", "finland": "FI",
  "ireland": "IE", "croatia": "HR", "turkey": "TR", "cyprus": "CY", "malta": "MT",
  "monaco": "MC", "luxembourg": "LU", "andorra": "AD", "montenegro": "ME",
  "united arab emirates": "AE", "uae": "AE", "saudi arabia": "SA", "qatar": "QA",
  "bahrain": "BH", "oman": "OM", "kuwait": "KW", "thailand": "TH", "indonesia": "ID",
  "malaysia": "MY", "singapore": "SG", "philippines": "PH", "japan": "JP",
  "australia": "AU", "new zealand": "NZ", "canada": "CA", "mexico": "MX",
  "brazil": "BR", "argentina": "AR", "colombia": "CO", "chile": "CL",
  "south africa": "ZA", "morocco": "MA", "egypt": "EG", "kenya": "KE",
  "russia": "RU", "china": "CN", "india": "IN", "israel": "IL",
  "czech republic": "CZ", "czechia": "CZ", "poland": "PL", "hungary": "HU",
  "romania": "RO", "bulgaria": "BG", "slovakia": "SK", "slovenia": "SI",
  "estonia": "EE", "latvia": "LV", "lithuania": "LT",
  "st. martin": "MF", "saint martin": "MF", "sint maarten": "SX",
  "barbados": "BB", "bahamas": "BS", "jamaica": "JM", "costa rica": "CR",
  "panama": "PA", "dominican republic": "DO", "puerto rico": "PR",
  "cayman islands": "KY", "turks and caicos": "TC",
};

const COUNTRY_CODE_TO_NAME: Record<string, string> = {};
// Build reverse map (code → canonical name)
for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
  if (!COUNTRY_CODE_TO_NAME[code]) {
    COUNTRY_CODE_TO_NAME[code] = name;
  }
}

/**
 * Check if a listing's country matches a countryFilter array.
 * Handles both ISO codes (ES, PT) and full names (Spain, Portugal).
 */
function countryMatches(listingCountry: string | undefined, filterValues: string[]): boolean {
  if (!listingCountry) return false;
  const lc = listingCountry.trim();
  const lcLower = lc.toLowerCase();
  
  // Direct match (exact or case-insensitive)
  if (filterValues.some(f => f.toLowerCase() === lcLower || f === lc)) return true;
  
  // Listing has full name → normalize to code and check
  const code = COUNTRY_NAME_TO_CODE[lcLower];
  if (code && filterValues.some(f => f.toUpperCase() === code)) return true;
  
  // Listing has code → check against full names in filter
  const ucLc = lc.toUpperCase();
  if (ucLc.length <= 3) {
    const canonicalName = COUNTRY_CODE_TO_NAME[ucLc];
    if (canonicalName && filterValues.some(f => f.toLowerCase() === canonicalName)) return true;
    if (filterValues.some(f => f.toUpperCase() === ucLc)) return true;
  }
  
  // Region fallback: "Algarve" → PT, "Balearic Islands" → ES, etc.
  const regionCode = REGION_TO_COUNTRY_CODE[lcLower];
  if (regionCode && filterValues.some(f => f.toUpperCase() === regionCode)) return true;
  
  return false;
}

// ─── Core Moderation Engine ──────────────────────────────────────

function evaluateSimpleRule(listing: ListingData, config: RuleConfig): { matched: boolean; details: string } {
  // ─── Pre-flight filters: check if rule applies to this listing ───
  const filterChecks: string[] = [];

  // Country filter (handles both ISO codes and full names)
  if (config.countryFilter && Array.isArray(config.countryFilter)) {
    if (!countryMatches(listing.country, config.countryFilter)) {
      return { matched: false, details: `country ${listing.country} not in ${config.countryFilter}` };
    }
    filterChecks.push(`country=${listing.country} ✓`);
  }
  if (config.excludeCountries && Array.isArray(config.excludeCountries)) {
    if (listing.country && countryMatches(listing.country, config.excludeCountries)) {
      return { matched: false, details: `country ${listing.country} excluded` };
    }
  }

  // Category filter (real_estate, cars, etc.)
  if (config.categoryFilter && Array.isArray(config.categoryFilter)) {
    const rawCat = (listing.category || "").toLowerCase();
    // Normalize: "RealEstate" → "real_estate", "Car" → "cars", "car" → "cars"
    const cat = rawCat
      .replace("listing::", "")
      .replace("realestate", "real_estate")
      .replace(/^car$/i, "cars");
    if (!config.categoryFilter.some((f: string) => {
      const normFilter = f.toLowerCase();
      return cat.includes(normFilter) || normFilter.includes(cat);
    })) {
      return { matched: false, details: `category ${listing.category} not in ${config.categoryFilter}` };
    }
  }

  // Account type filter (uses officeSubscription field)
  if (config.accountTypeFilter && Array.isArray(config.accountTypeFilter)) {
    const acct = (listing.officeSubscription || listing.accountType || "").toLowerCase();
    if (!acct || !config.accountTypeFilter.some((f: string) => acct.includes(f.toLowerCase()))) {
      return { matched: false, details: `accountType ${acct || "unknown"} not in ${config.accountTypeFilter}` };
    }
    filterChecks.push(`accountType=${acct} ✓`);
  }
  if (config.excludeAccountTypes && Array.isArray(config.excludeAccountTypes)) {
    const acct = (listing.officeSubscription || listing.accountType || "").toLowerCase();
    if (acct && config.excludeAccountTypes.some((f: string) => acct.includes(f.toLowerCase()))) {
      return { matched: false, details: `accountType ${acct} excluded` };
    }
  }

  // Real estate type filter
  if (config.typeFilter && Array.isArray(config.typeFilter)) {
    const reType = (listing.realEstateType || "").toLowerCase();
    if (!reType || !config.typeFilter.some((f: string) => reType.toLowerCase() === f.toLowerCase())) {
      return { matched: false, details: `type ${listing.realEstateType} not in ${config.typeFilter}` };
    }
  }
  if (config.excludeTypes && Array.isArray(config.excludeTypes)) {
    const reType = (listing.realEstateType || "").toLowerCase();
    if (reType && config.excludeTypes.some((f: string) => { const nf = f.toLowerCase().replace(/ /g, "_"); return reType === nf || reType === f.toLowerCase() || reType.replace(/_/g, " ") === f.toLowerCase(); })) {
      return { matched: false, details: `type ${listing.realEstateType} excluded` };
    }
  }

  // Office filter (uses office field)
  if (config.officeFilter && Array.isArray(config.officeFilter)) {
    const officeId = listing.office ? Number(listing.office) : (listing.officeId ? Number(listing.officeId) : null);
    if (!officeId || !config.officeFilter.includes(officeId)) {
      return { matched: false, details: `office ${officeId} not in ${config.officeFilter}` };
    }
    filterChecks.push(`office=${officeId} ✓`);
  }
  if (config.excludeOffices && Array.isArray(config.excludeOffices)) {
    const officeId = listing.office ? Number(listing.office) : (listing.officeId ? Number(listing.officeId) : null);
    if (officeId && config.excludeOffices.includes(officeId)) {
      return { matched: false, details: `office ${officeId} excluded` };
    }
  }

  // Group filter (uses officeGroupName field)
  if (config.groupFilter && Array.isArray(config.groupFilter)) {
    const groupId = listing.officeGroupName || listing.officeGroupId || "";
    if (!groupId || !config.groupFilter.some((f: string) => String(groupId) === f)) {
      return { matched: false, details: `group ${groupId} not in ${config.groupFilter}` };
    }
  }

  // Outdated filter
  if (config.outdated === true) {
    if (!listing.outdated) {
      return { matched: false, details: "listing not outdated" };
    }
  }

  // Rental filter
  if (config.rentalOnly === true) {
    if (!listing.rental) {
      return { matched: false, details: "not a rental" };
    }
  }
  if (config.nonRentalOnly === true) {
    if (listing.rental === true) {
      return { matched: false, details: "is a rental (nonRentalOnly)" };
    }
  }

  // Max/min price shorthand
  if (config.maxPrice !== undefined && config.maxPrice !== null) {
    const price = listing.priceUsd || listing.price || 0;
    if (price > Number(config.maxPrice)) {
      return { matched: false, details: `price ${price} > maxPrice ${config.maxPrice}` };
    }
  }
  if (config.minPrice !== undefined && config.minPrice !== null) {
    const price = listing.priceUsd || listing.price || 0;
    if (price < Number(config.minPrice)) {
      return { matched: false, details: `price ${price} < minPrice ${config.minPrice}` };
    }
  }

  // Title exclude keywords
  if (config.excludeTitleKeywords && Array.isArray(config.excludeTitleKeywords)) {
    const title = (listing.title || "").toLowerCase();
    if (config.excludeTitleKeywords.some((kw: string) => title.includes(kw.toLowerCase()))) {
      return { matched: false, details: "title contains excluded keyword" };
    }
  }

  // ─── Evaluate conditions ───
  let conditionsMet = true;
  const condDetails: string[] = [...filterChecks];

  // AND conditions
  if (config.conditions) {
    const results = config.conditions.map((c: { field: string; operator: string; value: unknown }) => {
      const val = listing[c.field as keyof ListingData];
      return evaluateCondition(val, c.operator, c.value);
    });
    if (!results.every((r: boolean) => r)) conditionsMet = false;
    condDetails.push(
      ...config.conditions.map((c: { field: string; operator: string; value: unknown }, i: number) =>
        `${c.field} ${c.operator} ${c.value}: ${results[i] ? "✓" : "✗"}`
      )
    );
  }

  // OR conditions (at least one must match)
  if (config.orConditions && Array.isArray(config.orConditions)) {
    const results = config.orConditions.map((c: { field: string; operator: string; value: unknown }) => {
      const val = listing[c.field as keyof ListingData];
      return evaluateCondition(val, c.operator, c.value);
    });
    if (!results.some((r: boolean) => r)) conditionsMet = false;
    condDetails.push(
      "OR(" + config.orConditions.map((c: { field: string; operator: string; value: unknown }, i: number) =>
        `${c.field} ${c.operator} ${c.value}: ${results[i] ? "✓" : "✗"}`
      ).join(", ") + ")"
    );
  }

  // Single field/operator
  if (!config.conditions && !config.orConditions && config.field && config.operator) {
    const val = listing[config.field as keyof ListingData];
    conditionsMet = evaluateCondition(val, config.operator, config.value);
    condDetails.push(`${config.field}=${val} ${config.operator} ${config.value}`);
  }

  // If no conditions at all, just filters: match if passed all filters
  // BUT: skip if only filters are present without actual conditions
  // This prevents "duplicates_*" rules from matching on country alone
  // (actual duplicate detection requires cross-referencing other listings)
  if (!config.conditions && !config.orConditions && !config.field) {
    // Rules with only filters but no conditions are structural rules
    // (like duplicate checks) that need additional logic not yet implemented
    return { matched: false, details: "Filters-only rule (no conditions to evaluate)" };
  }

  return { matched: conditionsMet, details: condDetails.join(", ") };
}

function evaluateCondition(value: unknown, operator: string, target: unknown): boolean {
  if (value === undefined || value === null) {
    if (operator === "empty" || operator === "is_null") return true;
    if (operator === "not_empty" || operator === "is_not_null") return false;
    // Unknown field = skip the rule (don't match on missing data)
    return false;
  }

  switch (operator) {
    case "lt":
    case "<":
      return Number(value) < Number(target);
    case "lte":
    case "<=":
      return Number(value) <= Number(target);
    case "gt":
    case ">":
      return Number(value) > Number(target);
    case "gte":
    case ">=":
      return Number(value) >= Number(target);
    case "eq":
    case "==":
      return String(value).toLowerCase() === String(target).toLowerCase();
    case "neq":
    case "!=":
      return String(value).toLowerCase() !== String(target).toLowerCase();
    case "in":
      return Array.isArray(target) && target.map((t: unknown) => String(t).toLowerCase()).includes(String(value).toLowerCase());
    case "not_in":
      return Array.isArray(target) && !target.map((t: unknown) => String(t).toLowerCase()).includes(String(value).toLowerCase());
    case "contains":
      return String(value).toLowerCase().includes(String(target).toLowerCase());
    case "empty":
      return !value || (typeof value === "string" && value.trim() === "");
    case "not_empty":
      return !!value && (typeof value !== "string" || value.trim() !== "");
    case "is_true":
      return value === true;
    case "is_false":
      return value === false || !value;
    default:
      return false;
  }
}

function evaluateRegexRule(listing: ListingData, config: RuleConfig): { matched: boolean; details: string; matchedPatterns: string[] } {
  // Pre-flight filters (same as simple rules)
  if (config.categoryFilter && Array.isArray(config.categoryFilter)) {
    const rawCat = (listing.category || "").toLowerCase();
    const cat = rawCat.replace("listing::", "").replace("realestate", "real_estate").replace(/^car$/i, "cars");
    if (!config.categoryFilter.some((f: string) => { const nf = f.toLowerCase(); return cat.includes(nf) || nf.includes(cat); })) {
      return { matched: false, details: `category ${listing.category} not in ${config.categoryFilter}`, matchedPatterns: [] };
    }
  }
  if (config.countryFilter && Array.isArray(config.countryFilter)) {
    if (!countryMatches(listing.country, config.countryFilter)) {
      return { matched: false, details: `country ${listing.country} not in ${config.countryFilter}`, matchedPatterns: [] };
    }
  }
  if (config.excludeTypes && Array.isArray(config.excludeTypes)) {
    const reType = (listing.realEstateType || "").toLowerCase();
    if (reType && config.excludeTypes.some((f: string) => { const nf = f.toLowerCase().replace(/ /g, "_"); return reType === nf || reType === f.toLowerCase() || reType.replace(/_/g, " ") === f.toLowerCase(); })) {
      return { matched: false, details: `type ${listing.realEstateType} excluded`, matchedPatterns: [] };
    }
  }
  if (config.typeFilter && Array.isArray(config.typeFilter)) {
    const reType = (listing.realEstateType || "").toLowerCase();
    if (!reType || !config.typeFilter.some((f: string) => reType === f.toLowerCase())) {
      return { matched: false, details: `type ${listing.realEstateType} not in ${config.typeFilter}`, matchedPatterns: [] };
    }
  }
  if (config.accountTypeFilter && Array.isArray(config.accountTypeFilter)) {
    const acct = (listing.officeSubscription || listing.accountType || "").toLowerCase();
    if (!acct || !config.accountTypeFilter.some((f: string) => acct.includes(f.toLowerCase()))) {
      return { matched: false, details: `accountType not in ${config.accountTypeFilter}`, matchedPatterns: [] };
    }
  }
  if (config.maxPrice !== undefined && config.maxPrice !== null) {
    const price = listing.priceUsd || listing.price || 0;
    if (price > Number(config.maxPrice)) {
      return { matched: false, details: `price > maxPrice`, matchedPatterns: [] };
    }
  }

  const patterns = config.patterns || [];
  const fields = config.fields || ["title", "description"];
  const matchedPatterns: string[] = [];

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern, "i");
      for (const field of fields) {
        const value = listing[field as keyof ListingData];
        if (typeof value === "string" && regex.test(value)) {
          matchedPatterns.push(`"${pattern}" in ${field}`);
        }
      }
    } catch {
      // Skip invalid regex
    }
  }

  // Also check text lists
  if (config.textLists) {
    for (const [listName, words] of Object.entries(config.textLists)) {
      for (const field of fields) {
        const value = listing[field as keyof ListingData];
        if (typeof value === "string") {
          const lowerValue = value.toLowerCase();
          for (const word of words) {
            if (lowerValue.includes(word.toLowerCase())) {
              matchedPatterns.push(`"${word}" (${listName}) in ${field}`);
            }
          }
        }
      }
    }
  }

  if (matchedPatterns.length === 0) {
    return { matched: false, details: "No pattern matches", matchedPatterns: [] };
  }

  // Check exclude patterns (if ANY exclude matches, rule does NOT fire)
  if (config.excludePatterns && Array.isArray(config.excludePatterns)) {
    const excludeFields: string[] = Array.isArray(config.excludeFields) ? config.excludeFields as string[] : ["title", "description"];
    for (const pattern of config.excludePatterns as string[]) {
      try {
        const regex = new RegExp(pattern, "i");
        for (const field of excludeFields) {
          const value = listing[field as keyof ListingData];
          if (typeof value === "string" && regex.test(value)) {
            return { matched: false, details: `Excluded by "${pattern}" in ${field}`, matchedPatterns: [] };
          }
        }
      } catch { /* skip invalid */ }
    }
  }

  return {
    matched: true,
    details: `Matched: ${matchedPatterns.join("; ")}`,
    matchedPatterns,
  };
}

// ─── Hybrid Vision Rule Evaluator ───────────────────────────────
// Properly checks GPT/Claude vision scores against thresholds
function evaluateHybridVisionRule(listing: ListingData, config: RuleConfig): { matched: boolean; details: string } {
  // ─── Pre-flight filters (same as simple rules, with country normalization) ───
  if (config.countryFilter && Array.isArray(config.countryFilter)) {
    if (!countryMatches(listing.country, config.countryFilter)) {
      return { matched: false, details: `country ${listing.country} not in ${config.countryFilter}` };
    }
  }
  if (config.excludeCountries && Array.isArray(config.excludeCountries)) {
    if (listing.country && countryMatches(listing.country, config.excludeCountries)) {
      return { matched: false, details: `country ${listing.country} excluded` };
    }
  }
  if (config.categoryFilter && Array.isArray(config.categoryFilter)) {
    const rawCat = (listing.category || "").toLowerCase();
    const cat = rawCat.replace("listing::", "").replace("realestate", "real_estate").replace(/^car$/i, "cars");
    if (!config.categoryFilter.some((f: string) => { const nf = f.toLowerCase(); return cat.includes(nf) || nf.includes(cat); })) {
      return { matched: false, details: `category ${listing.category} not in ${config.categoryFilter}` };
    }
  }
  if (config.maxPrice !== undefined && config.maxPrice !== null) {
    const price = listing.priceUsd || listing.price || 0;
    if (price > Number(config.maxPrice)) {
      return { matched: false, details: `price ${price} > maxPrice ${config.maxPrice}` };
    }
  }
  if (config.minPrice !== undefined && config.minPrice !== null) {
    const price = listing.priceUsd || listing.price || 0;
    if (price < Number(config.minPrice)) {
      return { matched: false, details: `price ${price} < minPrice ${config.minPrice}` };
    }
  }
  if (config.excludeTypes && Array.isArray(config.excludeTypes)) {
    const reType = (listing.realEstateType || "").toLowerCase();
    if (reType && config.excludeTypes.some((f: string) => { const nf = f.toLowerCase().replace(/ /g, "_"); return reType === nf || reType === f.toLowerCase() || reType.replace(/_/g, " ") === f.toLowerCase(); })) {
      return { matched: false, details: `type ${listing.realEstateType} excluded` };
    }
  }
  if (config.typeFilter && Array.isArray(config.typeFilter)) {
    const reType = (listing.realEstateType || "").toLowerCase();
    if (!reType || !config.typeFilter.some((f: string) => reType === f.toLowerCase())) {
      return { matched: false, details: `type ${listing.realEstateType} not in ${config.typeFilter}` };
    }
  }
  if (config.accountTypeFilter && Array.isArray(config.accountTypeFilter)) {
    const acct = (listing.officeSubscription || listing.accountType || "").toLowerCase();
    if (!acct || !config.accountTypeFilter.some((f: string) => acct.includes(f.toLowerCase()))) {
      return { matched: false, details: `accountType not in ${config.accountTypeFilter}` };
    }
  }
  if (config.excludeOffices && Array.isArray(config.excludeOffices)) {
    const officeId = listing.office ? Number(listing.office) : (listing.officeId ? Number(listing.officeId) : null);
    if (officeId && config.excludeOffices.includes(officeId)) {
      return { matched: false, details: `office ${officeId} excluded` };
    }
  }
  if (config.excludeTitleKeywords && Array.isArray(config.excludeTitleKeywords)) {
    const title = (listing.title || "").toLowerCase();
    if (config.excludeTitleKeywords.some((kw: string) => title.includes(kw.toLowerCase()))) {
      return { matched: false, details: "title contains excluded keyword" };
    }
  }

  // ─── Vision score checks ───
  const condition = listing.chatGptPropertyCondition;
  const conclusion = listing.chatGptConclusion;
  const conclusionNum = conclusion !== undefined && conclusion !== null ? Number(conclusion) : null;
  const watermarkText = (listing.chatGptWatermarkText || "").toLowerCase();
  const watermarkShare = listing.chatGptWatermarkShare;

  // Type 1: Score thresholds (condition AND conclusion must be below thresholds)
  if (config.scoreThresholds) {
    const thresholds = config.scoreThresholds as { condition?: number; conclusion?: number };
    
    // If no vision scores available, rule cannot match (don't flag without data)
    if (condition === undefined || condition === null || conclusionNum === null) {
      return { matched: false, details: `no vision scores available (condition=${condition}, conclusion=${conclusion})` };
    }

    const conditionMatch = thresholds.condition !== undefined ? condition <= thresholds.condition : true;
    const conclusionMatch = thresholds.conclusion !== undefined ? conclusionNum <= thresholds.conclusion : true;

    if (conditionMatch && conclusionMatch) {
      return {
        matched: true,
        details: `condition=${condition}≤${thresholds.condition}, conclusion=${conclusionNum}≤${thresholds.conclusion}`,
      };
    }
    return {
      matched: false,
      details: `scores OK: condition=${condition}>${thresholds.condition || "n/a"}, conclusion=${conclusionNum}>${thresholds.conclusion || "n/a"}`,
    };
  }

  // Type 2: Watermark keyword check
  if (config.checkType === "watermark" && config.watermarkKeywords) {
    if (!watermarkText) {
      return { matched: false, details: "no watermark text detected" };
    }
    const keywords = config.watermarkKeywords as string[];
    const matchedKw = keywords.filter((kw: string) => watermarkText.includes(kw.toLowerCase()));
    if (matchedKw.length > 0) {
      return { matched: true, details: `watermark text "${watermarkText}" contains: ${matchedKw.join(", ")}` };
    }
    return { matched: false, details: `watermark text "${watermarkText}" doesn't match keywords` };
  }

  // Type 3: Unidentifiable property check
  if (config.checkType === "unidentifiable") {
    // Check if condition is 0 (mapped from "Unidentifiable" text) or null with images
    const isUnidentifiable = condition === 0 || 
      (typeof listing.chatGptConclusion === "string" && listing.chatGptConclusion.toLowerCase().includes("unidentif"));
    
    if (isUnidentifiable) {
      return { matched: true, details: `property unidentifiable (condition=${condition})` };
    }
    // Also flag very low condition with low conclusion as potentially unidentifiable
    if (condition !== null && condition !== undefined && condition <= 1.0 && conclusionNum !== null && conclusionNum <= 1.5) {
      return { matched: true, details: `near-unidentifiable: condition=${condition}, conclusion=${conclusionNum}` };
    }
    return { matched: false, details: `property identifiable (condition=${condition})` };
  }

  // Type 4: Watermark size check
  if (config.checkType === "watermark_size") {
    if (watermarkShare === undefined || watermarkShare === null || watermarkShare === 0) {
      return { matched: false, details: "no watermarks detected" };
    }
    const threshold = (config.watermarkShareThreshold as number) || 3;
    if (watermarkShare >= threshold) {
      return { matched: true, details: `watermark share ${watermarkShare} >= ${threshold}` };
    }
    return { matched: false, details: `watermark share ${watermarkShare} < ${threshold}` };
  }

  // Fallback: no recognized vision check type
  return { matched: false, details: "no vision check type matched in config" };
}

// ─── Accuracy Rule Evaluator (LAS integration) ──────────────────
// Checks listing.accuracyFlags against LAS flag requirements in rule config
function evaluateAccuracyRule(listing: ListingData, config: RuleConfig): { matched: boolean; details: string } {
  const flags: string[] = (listing as any).accuracyFlags || [];
  const score: number | undefined = (listing as any).accuracyScore;
  const acctType = (listing.officeSubscription || (listing as any).accountType || "").toLowerCase();

  // Account type filter
  if (config.accountTypeFilter && Array.isArray(config.accountTypeFilter)) {
    if (!acctType || !config.accountTypeFilter.some((f: string) => acctType.includes(f.toLowerCase()))) {
      return { matched: false, details: `accountType ${acctType || "unknown"} not in ${config.accountTypeFilter}` };
    }
  }

  // No accuracy data at all → skip
  if (flags.length === 0 && score === undefined) {
    return { matched: false, details: "no LAS accuracy data" };
  }

  // Score-based check (e.g. las_score_critical)
  if (config.maxAccuracyScore !== undefined && config.maxAccuracyScore !== null) {
    if (score !== undefined && score <= Number(config.maxAccuracyScore)) {
      return { matched: true, details: `accuracy score ${score.toFixed(2)} ≤ ${config.maxAccuracyScore}` };
    }
    if (score === undefined) {
      return { matched: false, details: "no accuracy score available" };
    }
    return { matched: false, details: `accuracy score ${score.toFixed(2)} > ${config.maxAccuracyScore}` };
  }

  // Single flag check
  if (config.accuracyFlag && typeof config.accuracyFlag === "string") {
    if (flags.includes(config.accuracyFlag)) {
      return { matched: true, details: `LAS flag: ${config.accuracyFlag} (score: ${score?.toFixed(2) ?? "n/a"})` };
    }
    return { matched: false, details: `flag ${config.accuracyFlag} not in [${flags.join(", ")}]` };
  }

  // Multi-flag check (matchAny = true → any flag matches; false → all must match)
  if (config.accuracyFlags && Array.isArray(config.accuracyFlags)) {
    const matchAny = config.matchAny !== false; // default true
    const matched = matchAny
      ? config.accuracyFlags.some((f: string) => flags.includes(f))
      : config.accuracyFlags.every((f: string) => flags.includes(f));

    if (matched) {
      const found = config.accuracyFlags.filter((f: string) => flags.includes(f));
      return { matched: true, details: `LAS flags: ${found.join(", ")} (score: ${score?.toFixed(2) ?? "n/a"})` };
    }
    return { matched: false, details: `flags ${config.accuracyFlags.join(", ")} not found in [${flags.join(", ")}]` };
  }

  return { matched: false, details: "no accuracy check matched in config" };
}

function evaluateOfficeRule(listing: ListingData, config: RuleConfig): { matched: boolean; details: string } {
  const officeNames = (config.officeNames || []).map((n: string) => n.toLowerCase());
  const officeIds = config.officeIds || [];

  const listingOffice = (listing.officeGroupName || listing.office || "").toLowerCase();

  if (officeNames.length > 0 && officeNames.some((n: string) => listingOffice.includes(n))) {
    return { matched: true, details: `Office "${listingOffice}" matches rule` };
  }
  if (officeIds.length > 0 && officeIds.includes(listing.office || "")) {
    return { matched: true, details: `Office ID "${listing.office}" matches rule` };
  }

  return { matched: false, details: `Office "${listingOffice}" not in rule` };
}

// ─── Internal functions ──────────────────────────────────────────

export const getEnabledRules = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await ctx.db
      .query("rules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
  },
});

export const getListing = internalQuery({
  args: { id: v.id("listings") },
  returns: v.any(),
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const saveResult = internalMutation({
  args: {
    listingId: v.id("listings"),
    jeId: v.string(),
    outcome: v.string(),
    ruleMatches: v.any(),
    llmTriggered: v.boolean(),
    llmResponse: v.optional(v.any()),
    sellerMessage: v.optional(v.string()),
    confidence: v.optional(v.number()),
    visionResult: v.optional(v.any()),
    visionModel: v.optional(v.string()),
  },
  returns: v.id("moderationResults"),
  handler: async (ctx, args) => {
    // Update listing status
    await ctx.db.patch(args.listingId, {
      moderationStatus: args.outcome,
    });

    // Save moderation result
    return await ctx.db.insert("moderationResults", {
      ...args,
      processedAt: Date.now(),
    });
  },
});

export const updateRuleStats = internalMutation({
  args: { ruleIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { ruleIds }) => {
    for (const idStr of ruleIds) {
      try {
        const rule = await ctx.db.get(idStr as any);
        if (rule && 'matchCount' in rule) {
          await ctx.db.patch(idStr as any, {
            matchCount: ((rule as any).matchCount || 0) + 1,
            lastMatchedAt: Date.now(),
          });
        }
      } catch {
        // Skip invalid IDs
      }
    }
    return null;
  },
});

// ─── Main Moderation Action ──────────────────────────────────────

export const moderateListing = action({
  args: { listingId: v.id("listings") },
  returns: v.any(),
  handler: async (ctx, { listingId }): Promise<any> => {
    await requireModeratorAction(ctx);

    // Admin-configurable AI settings (model, temperature, thresholds, toggle).
    const aiSettings: any = await ctx.runQuery(api.settings.getAiSettings, {});

    // 0. Run AI Parameter Scan (non-blocking — runs in background, doesn't affect moderation outcome)
    try {
      await ctx.runAction(api.aiParamScan.scanListingParameters, { listingId });
    } catch (e) {
      console.error("AI Param Scan failed (non-blocking):", e);
    }

    // 1. Get listing and rules
    const listing: ListingData = await ctx.runQuery(internal.moderation.getListing, { id: listingId }) as ListingData;
    if (!listing) throw new Error("Listing not found");

    const rules: Rule[] = (await ctx.runQuery(internal.moderation.getEnabledRules, {})) as Rule[];

    // Sort by priority
    rules.sort((a, b) => a.priority - b.priority);

    const ruleMatches: RuleMatch[] = [];
    let needsLlm = false;
    const matchedRuleIds: string[] = [];

    // Track whether AI vision has already been run for this listing
    const hasVisionData = listing.chatGptPropertyCondition != null;

    // 2. Evaluate deterministic rules: simple_code + hybrid_vision
    //    simple_code = pure field checks, office rules, duplicates ($0 cost)
    //    hybrid_vision = AI vision scores (Claude/GPT) checked against thresholds
    //    Note: hybrid_vision rules only evaluate if vision data exists (ES/IT/PT/FR/GR by default)
    const deterministicRules = rules.filter(
      // HIDDEN: accuracy category disabled per Timur (2026-03-17) — data stays in DB, rules skip evaluation
      (r) => r.category === "simple_code" || r.category === "hybrid_vision" || r.category === "internal" /* || r.category === "accuracy" */
    );
    for (const rule of deterministicRules) {
      let result: { matched: boolean; details: string };

      if (rule.category === "accuracy") {
        // LAS accuracy rules — DISABLED per Timur (2026-03-17), kept for rollback
        result = evaluateAccuracyRule(listing, rule.config);
      } else if (rule.category === "hybrid_vision") {
        if (!hasVisionData) {
          // Skip hybrid rules when no vision data — will re-evaluate if Auto AI triggers vision
          continue;
        }
        // Use dedicated vision rule evaluator for proper score/watermark/unidentifiable checks
        result = evaluateHybridVisionRule(listing, rule.config);
      } else if (rule.config.officeFilter) {
        result = evaluateOfficeRule(listing, rule.config);
      } else {
        result = evaluateSimpleRule(listing, rule.config);
      }

      if (result.matched) {
        ruleMatches.push({
          ruleName: rule.name,
          ruleCategory: rule.category,
          tier: rule.tier,
          action: rule.action,
          message: rule.sellerMessage,
          details: result.details,
        });
        matchedRuleIds.push(rule._id);
      }
    }

    // Check if any deterministic rule triggers immediate rejection (tier: auto)
    const autoRejects = ruleMatches.filter(
      (m) => m.tier === "auto" && m.action === "reject"
    );
    if (autoRejects.length > 0) {
      const sellerMsg = autoRejects[0].message || "Your listing does not meet our quality standards.";
      const resultId: any = await ctx.runMutation(internal.moderation.saveResult, {
        listingId,
        jeId: listing.jeId,
        outcome: "rejected",
        ruleMatches,
        llmTriggered: false,
        sellerMessage: sellerMsg,
        confidence: 1.0,
      });
      if (matchedRuleIds.length > 0) {
        await ctx.runMutation(internal.moderation.updateRuleStats, { ruleIds: matchedRuleIds });
      }
      await submitToImplio(listing, "rejected", ruleMatches, sellerMsg, 1.0);
      return { outcome: "rejected", resultId, ruleMatches, llmTriggered: false };
    }

    // Check for auto-approve (e.g. outdated_paid_approve). A deterministic
    // tier:auto/action:approve rule short-circuits to approval (mirroring the
    // auto-reject path above) so its seller message is preserved and the
    // listing is not sent on to the LLM/manual queue by a co-matching rule.
    const autoApproves = ruleMatches.filter(
      (m) => m.tier === "auto" && m.action === "approve"
    );
    if (autoApproves.length > 0) {
      const sellerMsg = autoApproves.map((a) => a.message).filter(Boolean).join("\n");
      const resultId: any = await ctx.runMutation(internal.moderation.saveResult, {
        listingId,
        jeId: listing.jeId,
        outcome: "approved",
        ruleMatches,
        llmTriggered: false,
        sellerMessage: sellerMsg || undefined,
        confidence: 1.0,
      });
      if (matchedRuleIds.length > 0) {
        await ctx.runMutation(internal.moderation.updateRuleStats, { ruleIds: matchedRuleIds });
      }
      await submitToImplio(listing, "approved", ruleMatches, sellerMsg || undefined, 1.0);
      return { outcome: "approved", resultId, ruleMatches, llmTriggered: false };
    }

    // Check for auto-notices from deterministic rules
    const autoNotices = ruleMatches.filter(
      (m) => m.tier === "auto" && m.action === "notice"
    );

    // 3. Evaluate AI-trigger rules: auto_ai + former_manual
    //    These use regex/code to detect signals, then LLM validates
    //    auto_ai = commercial, sold, car rules (cleaner signals)
    //    former_manual = rules that used to go to manual queue (higher FP risk)
    const aiTriggerRules = rules.filter(
      (r) => r.category === "auto_ai" || r.category === "former_manual"
    );
    for (const rule of aiTriggerRules) {
      // Use regex evaluator for rules with patterns, simple evaluator for conditions-only
      const result = rule.config.patterns
        ? evaluateRegexRule(listing, rule.config)
        : evaluateSimpleRule(listing, rule.config);
      if (result.matched) {
        ruleMatches.push({
          ruleName: rule.name,
          ruleCategory: rule.category,
          tier: rule.tier,
          action: rule.action,
          message: rule.sellerMessage,
          details: result.details,
        });
        matchedRuleIds.push(rule._id);
        needsLlm = true; // AI-trigger match → LLM verification needed
      }
    }

    // 3b. Auto AI on-demand vision: if an auto_ai rule triggered AND vision hasn't been run,
    //     run vision now, update listing, then re-evaluate hybrid_vision rules (one pass, no loop)
    if (needsLlm && !hasVisionData && listing.imageUrls && listing.imageUrls.length > 0) {
      try {
        const visionResult = await ctx.runAction(
          api.imageRecognitionActions.analyzeForModeration,
          {
            imageUrls: listing.imageUrls.slice(0, 10),
            listingTitle: listing.title || "",
            jeId: listing.jeId,
          }
        );
        if (visionResult && !visionResult.error && visionResult.property_condition !== null) {
          // Persist vision scores
          await ctx.runMutation(api.listings.patchVisionScores, {
            id: listingId,
            chatGptPropertyCondition: visionResult.property_condition,
            chatGptConclusion: visionResult.conclusion !== null ? String(visionResult.conclusion) : undefined,
            chatGptWatermarkShare: visionResult.watermark_share ?? undefined,
            chatGptWatermarkText: visionResult.watermark_text ?? undefined,
            chatGptImageQuality: visionResult.image_quality ?? undefined,
            chatGptImageType: visionResult.image_type ?? undefined,
          });

          // Re-read listing with fresh vision data
          const updatedListing: ListingData = await ctx.runQuery(internal.moderation.getListing, { id: listingId }) as ListingData;

          // Re-evaluate hybrid_vision rules now that we have vision data (single pass)
          const hybridRules = deterministicRules.filter((r) => r.category === "hybrid_vision");
          for (const rule of hybridRules) {
            const result = evaluateHybridVisionRule(updatedListing, rule.config);
            if (result.matched) {
              ruleMatches.push({
                ruleName: rule.name,
                ruleCategory: rule.category,
                tier: rule.tier,
                action: rule.action,
                message: rule.sellerMessage,
                details: `[Auto AI vision] ${result.details}`,
              });
              matchedRuleIds.push(rule._id);
            }
          }

          // Check if newly-evaluated hybrid rules trigger immediate rejection
          const newAutoRejects = ruleMatches.filter(
            (m) => m.tier === "auto" && m.action === "reject"
          );
          if (newAutoRejects.length > 0) {
            const sellerMsg = newAutoRejects[0].message || "Your listing does not meet our quality standards.";
            const resultId: any = await ctx.runMutation(internal.moderation.saveResult, {
              listingId,
              jeId: listing.jeId,
              outcome: "rejected",
              ruleMatches,
              llmTriggered: false,
              sellerMessage: sellerMsg,
              confidence: 1.0,
            });
            if (matchedRuleIds.length > 0) {
              await ctx.runMutation(internal.moderation.updateRuleStats, { ruleIds: matchedRuleIds });
            }
            await submitToImplio(updatedListing, "rejected", ruleMatches, sellerMsg, 1.0);
            return { outcome: "rejected", resultId, ruleMatches, llmTriggered: false, visionTriggeredByAutoAI: true };
          }
        }
      } catch (e) {
        console.error("Auto AI on-demand vision failed, continuing without:", e);
      }
    }

    // 4. If AI-trigger rules matched → LLM assessment
    let llmResponse = null;
    if (needsLlm) {
      const hasLlmKey = !!(process.env.ANTHROPIC_API_KEY || (await import("./serverConfig")).config.ANTHROPIC_API_KEY);

      if (hasLlmKey) {
        try {
          llmResponse = await callLlm(listing, ruleMatches, {
            model: aiSettings.paramScanModel || "claude-haiku-4-5-20251001",
            temperature: typeof aiSettings.aiTemperature === "number" ? aiSettings.aiTemperature : 0.1,
          });
        } catch (e) {
          console.error("LLM call failed, routing to manual:", e);
          llmResponse = null;
        }
      }

      if (llmResponse) {
        // Confidence routing using admin-configurable thresholds. Guard against a
        // malformed/missing confidence (e.g. the model returns a string like
        // "high" or a 0-100 integer): only a finite number in [0,1] can drive an
        // automated decision; anything else — or a disabled auto-moderation
        // toggle — routes the listing to the manual queue.
        const rawConfidence: any = llmResponse.confidence;
        const confidence =
          typeof rawConfidence === "number" && isFinite(rawConfidence) && rawConfidence >= 0 && rawConfidence <= 1
            ? rawConfidence
            : 0;
        const approveThreshold =
          typeof aiSettings.autoApproveThreshold === "number" ? aiSettings.autoApproveThreshold : 0.9;
        const rejectThreshold =
          typeof aiSettings.autoRejectThreshold === "number" ? aiSettings.autoRejectThreshold : 0.85;
        const threshold = llmResponse.recommendation === "reject" ? rejectThreshold : approveThreshold;
        const isHighConfidence =
          aiSettings.enableAutoModeration !== false && confidence >= threshold;

        ruleMatches.push({
          ruleName: "llm_assessment",
          ruleCategory: "auto_ai",
          tier: isHighConfidence ? "auto" : "manual",
          action: llmResponse.recommendation || "flag",
          message: llmResponse.notice,
          details: llmResponse.assessment || "",
        });

        if (isHighConfidence) {
          // ≥90% confidence → auto-decide
          if (llmResponse.recommendation === "reject") {
            const rejectMsg = llmResponse.notice || "Your listing does not meet our listing standards.";
            const resultId: any = await ctx.runMutation(internal.moderation.saveResult, {
              listingId,
              jeId: listing.jeId,
              outcome: "rejected",
              ruleMatches,
              llmTriggered: true,
              llmResponse,
              sellerMessage: rejectMsg,
              confidence,
            });
            if (matchedRuleIds.length > 0) {
              await ctx.runMutation(internal.moderation.updateRuleStats, { ruleIds: matchedRuleIds });
            }
            await submitToImplio(listing, "rejected", ruleMatches, rejectMsg, confidence);
            return { outcome: "rejected", resultId, ruleMatches, llmTriggered: true, llmResponse };
          }
          // High confidence approve with possible notice
          if (llmResponse.notice) {
            const resultId: any = await ctx.runMutation(internal.moderation.saveResult, {
              listingId,
              jeId: listing.jeId,
              outcome: "notice",
              ruleMatches,
              llmTriggered: true,
              llmResponse,
              sellerMessage: llmResponse.notice,
              confidence,
            });
            if (matchedRuleIds.length > 0) {
              await ctx.runMutation(internal.moderation.updateRuleStats, { ruleIds: matchedRuleIds });
            }
            await submitToImplio(listing, "notice", ruleMatches, llmResponse.notice, confidence);
            return { outcome: "notice", resultId, ruleMatches, llmTriggered: true, llmResponse };
          }

          // High confidence approve, no notice → auto-approve
          // (AI verified the flagged rules and determined listing is fine)
          const resultId: any = await ctx.runMutation(internal.moderation.saveResult, {
            listingId,
            jeId: listing.jeId,
            outcome: "approved",
            ruleMatches,
            llmTriggered: true,
            llmResponse,
            confidence,
          });
          if (matchedRuleIds.length > 0) {
            await ctx.runMutation(internal.moderation.updateRuleStats, { ruleIds: matchedRuleIds });
          }
          await submitToImplio(listing, "approved", ruleMatches, undefined, confidence);
          return { outcome: "approved", resultId, ruleMatches, llmTriggered: true, llmResponse };
        } else {
          // <90% confidence → manual queue in FeedLens
          const resultId: any = await ctx.runMutation(internal.moderation.saveResult, {
            listingId,
            jeId: listing.jeId,
            outcome: "manual",
            ruleMatches,
            llmTriggered: true,
            llmResponse,
            confidence,
          });
          if (matchedRuleIds.length > 0) {
            await ctx.runMutation(internal.moderation.updateRuleStats, { ruleIds: matchedRuleIds });
          }
          await submitToImplio(listing, "manual", ruleMatches, undefined, confidence);
          return { outcome: "manual", resultId, ruleMatches, llmTriggered: true, llmResponse };
        }
      } else {
        // No LLM available → manual queue
        const resultId: any = await ctx.runMutation(internal.moderation.saveResult, {
          listingId,
          jeId: listing.jeId,
          outcome: "manual",
          ruleMatches,
          llmTriggered: false,
          confidence: 0,
        });
        if (matchedRuleIds.length > 0) {
          await ctx.runMutation(internal.moderation.updateRuleStats, { ruleIds: matchedRuleIds });
        }
        await submitToImplio(listing, "manual", ruleMatches, undefined, 0);
        return { outcome: "manual", resultId, ruleMatches, llmTriggered: false };
      }
    }

    // 6. Check for manual-tier rule matches that still need human review
    //    (Only rules with tier="manual" reach here — "verify" rules were handled by LLM above)
    //    Note: if needsLlm was true, we already returned above. So llmResponse is always null here.
    const manualMatches = ruleMatches.filter((m) => m.tier === "manual");
    if (manualMatches.length > 0) {
      const resultId: any = await ctx.runMutation(internal.moderation.saveResult, {
        listingId,
        jeId: listing.jeId,
        outcome: "manual",
        ruleMatches,
        llmTriggered: false,
      });
      if (matchedRuleIds.length > 0) {
        await ctx.runMutation(internal.moderation.updateRuleStats, { ruleIds: matchedRuleIds });
      }
      await submitToImplio(listing, "manual", ruleMatches);
      return { outcome: "manual", resultId, ruleMatches, llmTriggered: false };
    }

    // 7. If only notices, approve with notice
    if (autoNotices.length > 0) {
      const sellerMsg = autoNotices.map((n) => n.message).filter(Boolean).join("\n");
      const resultId: any = await ctx.runMutation(internal.moderation.saveResult, {
        listingId,
        jeId: listing.jeId,
        outcome: "notice",
        ruleMatches,
        llmTriggered: false,
        sellerMessage: sellerMsg || undefined,
        confidence: 1.0,
      });
      if (matchedRuleIds.length > 0) {
        await ctx.runMutation(internal.moderation.updateRuleStats, { ruleIds: matchedRuleIds });
      }
      await submitToImplio(listing, "notice", ruleMatches, sellerMsg || undefined, 1.0);
      return { outcome: "notice", resultId, ruleMatches, llmTriggered: false };
    }

    // 8. All clear → approve
    const resultId: any = await ctx.runMutation(internal.moderation.saveResult, {
      listingId,
      jeId: listing.jeId,
      outcome: "approved",
      ruleMatches,
      llmTriggered: false,
      confidence: 1.0,
    });
    if (matchedRuleIds.length > 0) {
      await ctx.runMutation(internal.moderation.updateRuleStats, { ruleIds: matchedRuleIds });
    }
    await submitToImplio(listing, "approved", ruleMatches, undefined, 1.0);
    return { outcome: "approved", resultId, ruleMatches, llmTriggered: false };
  },
});

// ─── Implio Submission ───────────────────────────────────────────
// Bridge: send every FeedLens moderation decision to Implio so existing
// Implio rules (e.g. Viktor_autoreject) can act on it.
// For rejections: sets viktor_reject=true → Implio rule auto-refuses.
// This is an ad-hoc bridge until Implio is fully replaced.

const IMPLIO_API_URL = "https://api.implio.com/v1/ads";

async function submitToImplio(
  listing: ListingData,
  outcome: string,
  ruleMatches: RuleMatch[],
  sellerMessage?: string,
  confidence?: number,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.IMPLIO_API_KEY || (await import("./serverConfig")).config.IMPLIO_API_KEY;
  if (!apiKey) {
    console.warn("IMPLIO_API_KEY not set — skipping Implio submission");
    return { success: false, error: "No API key" };
  }

  // Build assessment text from rule matches
  const assessmentLines = ruleMatches
    .map((m) => `[${m.ruleCategory}/${m.tier}] ${m.ruleName} (${m.action}): ${m.details || ""}`)
    .filter(Boolean);
  const assessment = assessmentLines.length > 0
    ? assessmentLines.join("\n")
    : `FeedLens outcome: ${outcome}`;

  // Build customerSpecific with listing data + moderation flags
  const cs: Record<string, unknown> = {
    // Listing data fields (match Implio's expected field names)
    listing_url: `https://www.jamesedition.com/real_estate/-/-${listing.jeId}`,
    price: listing.price,
    price_usd: listing.priceUsd,
    price_on_request: listing.priceOnRequest || false,
    location_city: listing.city,
    location_country: listing.country,
    real_estate_type: listing.realEstateType,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    living_area: listing.livingArea,
    land_area: listing.landArea,
    number_of_pictures: listing.imageCount,
    description_length: listing.descriptionLength,
    listing_quality_index: listing.lqi,
    // Only the human-readable group name belongs here. listing.office holds a
    // numeric office id (set from item.office_id by the push pipeline); sending
    // that id would never match Implio's office-name rules, so omit it.
    office_group_name: listing.officeGroupName || undefined,
    office_subscription_level: listing.officeSubscription,
    listing_feed_source: listing.feedSource,
    // ChatGPT vision fields (from JE pipeline)
    chat_gpt_conclusion: listing.chatGptConclusion,
    chat_gpt_property_condition: listing.chatGptPropertyCondition,
    chat_gpt_watermark_share: listing.chatGptWatermarkShare,
    chat_gpt_watermark_text: listing.chatGptWatermarkText,
    chat_gpt_image_quality: listing.chatGptImageQuality,
    chat_gpt_image_type: listing.chatGptImageType,
    // Viktor moderation metadata
    viktor_flagged: true,
    viktor_assessment: assessment,
    viktor_confidence: confidence ?? null,
    viktor_outcome: outcome,
  };

  // Set outcome-specific flags that trigger Implio rules
  switch (outcome) {
    case "rejected":
      cs.viktor_reject = true; // → triggers "Viktor_autoreject" rule → REFUSE
      if (sellerMessage) cs.seller_message = sellerMessage;
      break;
    case "approved":
      cs.viktor_approve = true; // → triggers approval rule → APPROVE
      break;
    case "notice":
      cs.viktor_approve = true; // approved with notice
      if (sellerMessage) cs.seller_message = sellerMessage;
      break;
    case "manual":
      cs.manual_review = true; // → triggers manual review rule → MANUAL
      cs.viktor_flagged = true;
      break;
  }

  // Build Implio payload
  const title = listing.title || `Listing ${listing.jeId}`;
  const body = `FeedLens Moderation: ${outcome.toUpperCase()}\n\n${assessment}${sellerMessage ? `\n\nSeller message: ${sellerMessage}` : ""}`;

  const payload = [{
    id: String(listing.jeId),
    content: { title, body },
    customerSpecific: cs,
  }];

  try {
    const response = await fetch(IMPLIO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Implio API error for listing ${listing.jeId}: ${response.status} ${errText}`);
      return { success: false, error: `${response.status}: ${errText}` };
    }

    console.log(`Implio submission OK: listing ${listing.jeId} → ${outcome}`);
    return { success: true };
  } catch (error: any) {
    console.error(`Implio submission failed for listing ${listing.jeId}:`, error?.message || error);
    return { success: false, error: error?.message || "Unknown error" };
  }
}

// ─── LLM Call ────────────────────────────────────────────────────

async function callLlm(
  listing: ListingData,
  existingMatches: RuleMatch[],
  opts: { model: string; temperature: number }
): Promise<{
  scores: { condition?: number; watermark?: boolean; quality?: number; policyOk?: boolean };
  assessment: string;
  recommendation: string;
  confidence: number;
  notice?: string;
  model: string;
  tokensUsed?: number;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY || (await import("./serverConfig")).config.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No Anthropic API key configured");

  const triggeredRules = existingMatches
    .filter((m) => m.ruleCategory === "auto_ai" || m.ruleCategory === "former_manual")
    .map((m) => `• [${m.ruleCategory}] ${m.ruleName} (action: ${m.action}): ${m.details}`)
    .join("\n");

  const prompt = `You are a luxury real estate listing moderator for JamesEdition, the world's largest luxury marketplace.

Our automated rules have flagged this listing for verification. Your job: determine if the flagged issues are real problems or false positives. Be decisive — only send to manual review when genuinely uncertain.

LISTING DATA:
- Title: ${listing.title}
- Price: ${listing.priceUsd ? `$${listing.priceUsd.toLocaleString()}` : listing.price ? `${listing.price} ${listing.currency || ""}` : "Price on request"}
- Location: ${[listing.city, listing.state, listing.country].filter(Boolean).join(", ")}
- Type: ${listing.realEstateType || listing.category || "Unknown"}
- Images: ${listing.imageCount || 0}
- LQI: ${listing.lqi || "N/A"}
- Description length: ${listing.descriptionLength || 0} chars
${listing.description ? `- Description excerpt: ${listing.description.substring(0, 800)}` : ""}
${listing.livingArea ? `- Living area: ${listing.livingArea} sqm` : ""}
${listing.landArea ? `- Land area: ${listing.landArea} sqm` : ""}
${listing.bedrooms ? `- Bedrooms: ${listing.bedrooms}` : ""}
${listing.bathrooms ? `- Bathrooms: ${listing.bathrooms}` : ""}
${listing.office ? `- Office: ${listing.officeGroupName || listing.office}` : ""}
${listing.feedSource ? `- Feed source: ${listing.feedSource}` : ""}
${listing.chatGptConclusion ? `- Existing GPT assessment: ${listing.chatGptConclusion}` : ""}
${listing.chatGptPropertyCondition != null ? `- GPT condition score: ${listing.chatGptPropertyCondition}/5${listing.chatGptPropertyCondition === 0 ? " (unidentifiable)" : ""}` : ""}

FLAGGED RULES TO VERIFY:
${triggeredRules || "None"}

VERIFICATION GUIDANCE BY RULE TYPE:
- Price anomalies ($100M+, $50M+low quality): Could be a legitimate ultra-luxury property (castle, island, mega-yacht) or a pricing error. Consider if bedrooms/bathrooms/type justify the price.
- Data anomalies (living area >10K sqm, <10 sqm, land=living): Likely data entry errors, but castles/estates can have 10K+ sqm. Check if the type/price/location make the values plausible.
- Content issues (short description, bad condition keywords in title): Short descriptions may be acceptable for high-quality listings with many images. "Bad condition" keywords like "ruin", "renovation needed" signal non-luxury properties.
- Commercial/sold signals: Check title and description for clear commercial or sold indicators.
- Car rules: Verify if the car is genuinely luxury/exotic for JamesEdition's market.

QUALITY STANDARDS:
- Properties must be in good/acceptable condition (not ruins, derelict, or requiring total renovation)
- No watermarks covering more than 30% of images
- No "SOLD" or "UNDER OFFER" properties
- Must be legitimate luxury properties (minimum $490K USD for real estate)
- No commercial properties on residential marketplace
- Descriptions must be meaningful (not just auto-generated filler)
- Images should be real photos (not AI renders)

YOUR CONFIDENCE SCORE DETERMINES THE OUTCOME:
- confidence >= 0.90 → your recommendation executes automatically
- confidence < 0.90 → listing goes to human moderator for review
Only give high confidence when you are genuinely sure about the decision.

Respond with ONLY valid JSON (no markdown):
{
  "scores": {
    "condition": <1-5 scale, 5=excellent>,
    "watermark": <true/false>,
    "quality": <0-1 overall quality>,
    "policyOk": <true/false>
  },
  "assessment": "<2-3 sentence explanation of your reasoning for each flagged rule>",
  "recommendation": "<approve|reject|notice>",
  "confidence": <0.0-1.0>,
  "notice": "<optional seller message if minor issue, null otherwise>"
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 500,
      temperature: opts.temperature,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b: any) => b.type === "text");
  const content = textBlock?.text || "";
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      ...parsed,
      model: opts.model,
      tokensUsed,
    };
  } catch {
    return {
      scores: { condition: 3, watermark: false, quality: 0.5, policyOk: true },
      assessment: content.substring(0, 500),
      recommendation: "manual",
      confidence: 0.3,
      model: opts.model,
      tokensUsed,
    };
  }
}

// ─── Manual Override Actions ─────────────────────────────────────

export const overrideDecision = mutation({
  args: {
    resultId: v.id("moderationResults"),
    newOutcome: v.string(),
    reason: v.optional(v.string()),
    sellerMessage: v.optional(v.string()),
    overriddenBy: v.optional(v.string()),
    refuseReasonType: v.optional(v.string()), // "other", "images", "illegal", "duplicate"
  },
  returns: v.null(),
  handler: async (ctx, { resultId, newOutcome, reason, sellerMessage, overriddenBy, refuseReasonType }) => {
    await requireModerator(ctx);
    const result = await ctx.db.get(resultId);
    if (!result) throw new Error("Result not found");

    // Save original outcome before override
    const patch: Record<string, any> = {
      originalOutcome: result.outcome,
      outcome: newOutcome,
      overriddenBy: overriddenBy || "manual",
      overriddenAt: Date.now(),
      overrideReason: reason,
      sellerMessage: sellerMessage || result.sellerMessage,
    };
    if (refuseReasonType) {
      patch.refuseReasonType = refuseReasonType;
    }
    await ctx.db.patch(resultId, patch);

    // Update listing status
    await ctx.db.patch(result.listingId, {
      moderationStatus: newOutcome,
    });

    return null;
  },
});

// ─── Query Results ───────────────────────────────────────────────

export const getResultsForListing = query({
  args: { listingId: v.id("listings") },
  returns: v.any(),
  handler: async (ctx, { listingId }) => {
    return await ctx.db
      .query("moderationResults")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .order("desc")
      .collect();
  },
});

export const getRecentResults = query({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("moderationResults")
      .withIndex("by_processedAt")
      .order("desc")
      .take(limit || 50);
  },
});

export const getResultsByOutcome = query({
  args: { outcome: v.string(), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { outcome, limit }) => {
    return await ctx.db
      .query("moderationResults")
      .withIndex("by_outcome", (q) => q.eq("outcome", outcome))
      .order("desc")
      .take(limit || 50);
  },
});

// ─── Dashboard Stats: Auto vs Manual Split + Daily Chart ────────

export const getDashboardStats = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, { startDate, endDate }) => {
    let results = await ctx.db
      .query("moderationResults")
      .withIndex("by_processedAt")
      .order("desc")
      .collect();

    // Filter by date range if provided
    if (startDate) {
      results = results.filter((r) => r.processedAt >= startDate!);
    }
    if (endDate) {
      results = results.filter((r) => r.processedAt <= endDate!);
    }

    const total = results.length;

    // Determine auto vs manual: if overriddenBy exists, it's manual
    const autoResults = results.filter((r) => !r.overriddenBy);
    const manualResults = results.filter((r) => !!r.overriddenBy);

    // Overall stats
    const stats = {
      total,
      approved: results.filter((r) => r.outcome === "approved").length,
      rejected: results.filter((r) => r.outcome === "rejected").length,
      noticed: results.filter((r) => r.outcome === "notice").length,
      manual: results.filter((r) => r.outcome === "manual").length,
      // Auto vs Manual breakdown
      autoTotal: autoResults.length,
      manualTotal: manualResults.length,
      autoApproved: autoResults.filter((r) => r.outcome === "approved").length,
      manualApproved: manualResults.filter((r) => r.outcome === "approved").length,
      autoRejected: autoResults.filter((r) => r.outcome === "rejected").length,
      manualRejected: manualResults.filter((r) => r.outcome === "rejected").length,
      autoNoticed: autoResults.filter((r) => r.outcome === "notice").length,
      manualNoticed: manualResults.filter((r) => r.outcome === "notice").length,
    };

    // Daily breakdown for chart
    const dailyMap = new Map<string, {
      date: string;
      total: number;
      approvedAuto: number;
      approvedManual: number;
      rejectedAuto: number;
      rejectedManual: number;
      noticedAuto: number;
      noticedManual: number;
      manualQueue: number;
    }>();

    for (const r of results) {
      const date = new Date(r.processedAt).toISOString().split("T")[0];
      const existing = dailyMap.get(date) || {
        date,
        total: 0,
        approvedAuto: 0,
        approvedManual: 0,
        rejectedAuto: 0,
        rejectedManual: 0,
        noticedAuto: 0,
        noticedManual: 0,
        manualQueue: 0,
      };

      existing.total++;
      const isManual = !!r.overriddenBy;

      if (r.outcome === "approved") {
        if (isManual) existing.approvedManual++;
        else existing.approvedAuto++;
      } else if (r.outcome === "rejected") {
        if (isManual) existing.rejectedManual++;
        else existing.rejectedAuto++;
      } else if (r.outcome === "notice") {
        if (isManual) existing.noticedManual++;
        else existing.noticedAuto++;
      } else if (r.outcome === "manual") {
        existing.manualQueue++;
      }

      dailyMap.set(date, existing);
    }

    // Sort by date ascending
    const dailyData = Array.from(dailyMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    return { stats, dailyData };
  },
});

// ─── Results by Rule Name (for "Items matched" feature) ──────────

export const getResultsByRule = query({
  args: {
    ruleName: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, { ruleName, limit }) => {
    // Get all results and filter for ones containing this rule
    const allResults = await ctx.db
      .query("moderationResults")
      .withIndex("by_processedAt")
      .order("desc")
      .collect();

    const matched = allResults.filter((r) =>
      r.ruleMatches?.some((m: any) => m.ruleName === ruleName)
    );

    const total = matched.length;
    const items = matched.slice(0, limit || 20);

    // Fetch associated listings
    const listingIds = [...new Set(items.map((r) => r.listingId))];
    const listings: Record<string, any> = {};
    for (const id of listingIds) {
      const listing = await ctx.db.get(id);
      if (listing) listings[id as string] = listing;
    }

    return {
      total,
      totalResults: allResults.length,
      percentage: allResults.length > 0 ? ((total / allResults.length) * 100).toFixed(1) : "0",
      items: items.map((r) => ({
        ...r,
        listing: listings[r.listingId as string] || null,
      })),
    };
  },
});

// ─── Get Latest Result by JE ID ──────────────────────────────────
// Used by ModerateByIdPage to look up results after moderation

export const getLatestResultByJeId = query({
  args: { jeId: v.string() },
  returns: v.any(),
  handler: async (ctx, { jeId }) => {
    return await ctx.db
      .query("moderationResults")
      .withIndex("by_jeId", (q) => q.eq("jeId", jeId))
      .order("desc")
      .first();
  },
});

// ─── Override with Implio Submission ─────────────────────────────
// Wraps overrideDecision mutation + submits to Implio so the actual
// approve/reject takes effect on JamesEdition (not just in FeedLens DB).

export const overrideWithImplio = action({
  args: {
    resultId: v.id("moderationResults"),
    newOutcome: v.string(),
    reason: v.optional(v.string()),
    sellerMessage: v.optional(v.string()),
    overriddenBy: v.optional(v.string()),
    refuseReasonType: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireModeratorAction(ctx);
    // 1. Run the DB override mutation
    await ctx.runMutation(api.moderation.overrideDecision, {
      resultId: args.resultId,
      newOutcome: args.newOutcome,
      reason: args.reason,
      sellerMessage: args.sellerMessage,
      overriddenBy: args.overriddenBy,
      refuseReasonType: args.refuseReasonType,
    });

    // 2. Get the moderation result to find the listing
    const result = await ctx.runQuery(internal.moderation.getResultInternal, { id: args.resultId });
    if (!result) return { success: true, implioSubmitted: false, reason: "Result not found after override" };

    // 3. Get the listing data for Implio submission
    const listing: ListingData = await ctx.runQuery(internal.moderation.getListing, { id: result.listingId }) as ListingData;
    if (!listing) return { success: true, implioSubmitted: false, reason: "Listing not found" };

    // 4. Build rule matches from the original result + the override info
    const ruleMatches: RuleMatch[] = [
      ...(result.ruleMatches || []),
      {
        ruleName: "manual_override",
        ruleCategory: "manual",
        tier: "auto",
        action: args.newOutcome === "rejected" ? "reject" : args.newOutcome === "notice" ? "notice" : "approve",
        message: args.sellerMessage,
        details: `Manual override by ${args.overriddenBy || "moderator"}. ${args.reason ? `Reason: ${args.reason}` : ""}`,
      },
    ];

    // 5. Submit to Implio
    const implioResult = await submitToImplio(listing, args.newOutcome, ruleMatches, args.sellerMessage, 1.0);
    return { success: true, implioSubmitted: implioResult.success, implioError: implioResult.error };
  },
});

// Internal query to get a moderation result by ID (for overrideWithImplio action)
export const getResultInternal = internalQuery({
  args: { id: v.id("moderationResults") },
  returns: v.any(),
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

// ─── Export data as CSV ──────────────────────────────────────────

export const exportCSV = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, { startDate, endDate }) => {
    let results = await ctx.db
      .query("moderationResults")
      .withIndex("by_processedAt")
      .order("desc")
      .collect();

    if (startDate) results = results.filter((r) => r.processedAt >= startDate!);
    if (endDate) results = results.filter((r) => r.processedAt <= endDate!);

    // Fetch all listings
    const listingIds = [...new Set(results.map((r) => r.listingId))];
    const listings: Record<string, any> = {};
    for (const id of listingIds) {
      const listing = await ctx.db.get(id);
      if (listing) listings[id as string] = listing;
    }

    return results.map((r) => {
      const listing = listings[r.listingId as string];
      return {
        jeId: r.jeId,
        title: listing?.title || "",
        outcome: r.outcome,
        category: listing?.category || "",
        country: listing?.country || "",
        city: listing?.city || "",
        price: listing?.priceUsd || listing?.price || "",
        rules: r.ruleMatches?.map((m: any) => m.ruleName).join("; ") || "",
        llmTriggered: r.llmTriggered ? "Yes" : "No",
        confidence: r.confidence || "",
        processedAt: new Date(r.processedAt).toISOString(),
        overriddenBy: r.overriddenBy || "",
      };
    });
  },
});
