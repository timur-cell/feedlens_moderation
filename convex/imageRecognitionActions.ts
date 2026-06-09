"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { requireModeratorAction } from "./authz";

// ─── Configuration ───────────────────────────────────────────────
// Switch VISION_PROVIDER to "claude" when ready to migrate
type VisionProvider = "openai" | "claude";
const VISION_PROVIDER: VisionProvider = "claude";

// Models per provider
const MODELS = {
  openai: "gpt-4o",        // Latest GPT-4o with strong vision
  claude: "claude-haiku-4-5-20251001",
} as const;

// The exact prompt from JE's ConditionRecognizer (app/src/je/listings/condition_recognizer.rb)
const JE_CONDITION_PROMPT = `We are a global luxury real estate portal, our goal is to improve the quality of listings on the platform by cleaning and lowering down in search inappropriate and low-quality listings.
Please rate the following attributes for the given image: [property_condition, watermark_share, watermark_size, watermark_text, image_quality, image_type, image_type_confidence, conclusion]

Here's a legend and explanation of the attributes:
property_condition:
- 6: Luxury property – this property exceeds the highest standards of comfort and elegance, featuring exceptional design, premium materials, and state-of-the-art amenities. It represents the pinnacle of luxury living, offering an unparalleled experience.
- 5: Excellent – the property is in near-perfect condition with high-quality finishes and updates. It has been meticulously maintained and shows minimal to no wear, ensuring a superior living environment.
- 4: Good – this property is well-maintained and in good condition, with some signs of normal wear. It may benefit from minor updates or cosmetic improvements but it is overall a comfortable and appealing space.
- 3: Average – the property is in average condition, showing signs of wear and use. It may require some repairs and updates to meet current standards but remains functional and habitable.
- 2: Poor – this property requires significant repairs and updates. It shows extensive wear and may have issues that need immediate attention to make it livable.
- 1: Disrepair – the property is in a state of neglect and requires extensive repairs or complete renovation. It is likely not habitable in its current condition and may represent a significant investment to restore.
- Unidentifiable: It is hard to determine the condition of the property or the property is not shown in the images.

watermark_share: (0 to 10) number of accessed watermarked images related to a specific listing ID

watermark_size:
- 1: XXL – a watermark that covers the entire image, offering the highest level of protection. Coverage: 50-100% of the image area.
- 2: XL - these watermarks are designed to be very noticeable and cover a significant portion of the image, making unauthorized use difficult. Coverage: 25-50% of the image area.
- 3: L – a watermark that balances visibility with subtlety. Coverage: 10-25% of the image area.
- 4: M – slightly more visible than the minimal coverage. Coverage: 5-10% of the image area.
- 5: S – Small watermarking that covers a very small portion. Coverage: Up to 5% of the image area.
- 6: No watermarks present

watermark_text:
- Collect all words from watermarks, separated with comma. Leave empty if no text found.

image_quality:
- poor: The image quality is poor enough to make it difficult or impossible to determine the photo's content accurately.
- low: The image has low quality, with some content being identifiable, but it suffers from significant flaws.
- moderate: The image is good enough to be used but has issues that impact how clearly its content can be seen.
- high: The image is of high quality with minor issues that do not significantly detract from its overall utility.
- professional: The image has a professional-like quality with no negative issues.
- visualization: Digitally created or rendered image of the property.

image_type:
- AI-generated: Fully synthetic visuals (diffusion models, GANs, or AI-tools). Signs: unrealistic lighting, distorted hands/objects, mismatched reflections, "too perfect" patterns, odd artifacts. Even if only partially AI-modified, treat the entire listing as AI-generated.
- Render (3D / CGI): Non-photographic computer-generated renderings, architectural visualizations, or staging done via 3D modeling software. Signs: clean sterile lines, uniform/global lighting, flat surfaces without natural imperfections.
- Real photo: Authentic photographs taken with a camera. Natural imperfections are present.

Decision Rules for image type:
- Analyze the entire batch of images per listing.
- If there is any evidence of AI-generated or AI-modified content in one or more images, classify the listing as "AI-generated".
- If the majority of images are clearly 3D renders and no AI artifacts are found, classify as "Render (3D / CGI)".
- Only classify as "Real photo" if all images appear authentic, unmodified, and free of AI/CGI characteristics.
- Output must be strict: only one category is allowed per listing.
- Be conservative — when uncertain, default toward "AI-generated" or "Render (3D / CGI)", never toward "Real photo".

image_type_confidence:
- A number from 1 to 100 expressing how confident you are in the selected image_type classification.

conclusion: Rate how good this property is for the global premium & luxury residential real estate portal from 1 to 6 (decimal). Where: 6 is the best for the premium & luxury portal, and 1 means completely unsuitable.

Respond with a valid RFC-8259 complaint JSON, compressed, without formatting and without \`\`\`json prefix:
{
  "property_condition": 1.0 to 6.0,
  "watermark_size": 1.0 to 6.0,
  "watermark_share": 0 to 10,
  "watermark_text": "Words from all watermarks separated with comma",
  "image_quality": "High" or any other mentioned in the legend,
  "image_type": "AI-generated" or any other mentioned in the legend,
  "image_type_confidence": 1 to 100,
  "conclusion": 1.0 to 6.0
}`;

// ─── Shared types ────────────────────────────────────────────────
interface VisionResult {
  property_condition: number | null;
  conclusion: number | null;
  watermark_share: number | null;
  watermark_size: number | null;
  watermark_text: string | null;
  image_quality: string | null;
  image_type: string | null;
  image_type_confidence: number | null;
  unidentifiable: boolean;
  model: string;
  llm: string;
  input_tokens: number;
  output_tokens: number;
  error?: string;
  raw?: string;
}

const EMPTY_RESULT: VisionResult = {
  property_condition: null, conclusion: null, watermark_share: null,
  watermark_size: null, watermark_text: null, image_quality: null,
  image_type: null, image_type_confidence: null, unidentifiable: false,
  model: "none", llm: "none", input_tokens: 0, output_tokens: 0,
};

// ─── Image fetching (for Claude which requires base64) ──────────

// Claude's vision API rejects anything else (e.g. image/bmp) with a 400,
// which would fail the whole multi-image request.
const CLAUDE_SUPPORTED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

async function fetchImagesAsBase64(urls: string[], maxImages = 5): Promise<Array<{ base64: string; mediaType: string }>> {
  const results: Array<{ base64: string; mediaType: string }> = [];
  for (const url of urls.slice(0, maxImages)) {
    try {
      console.log(`Fetching image: ${url}`);
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) {
        console.log(`Image fetch failed: ${resp.status} ${resp.statusText}`);
        continue;
      }
      const buffer = await resp.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      // Detect actual image type from magic bytes (don't trust content-type header —
      // JE CDN often returns image/jpeg for PNG files, causing Claude API 400 errors)
      const mediaType = detectImageType(buffer);
      if (!CLAUDE_SUPPORTED_MEDIA_TYPES.includes(mediaType)) {
        console.log(`Skipping unsupported image type ${mediaType}: ${url}`);
        continue;
      }
      console.log(`Image loaded: ${(buffer.byteLength / 1024).toFixed(0)}KB, type: ${mediaType}`);
      results.push({ base64, mediaType });
    } catch (e) {
      console.error(`Image fetch error for ${url}:`, e);
    }
  }
  return results;
}

/**
 * Detect actual image type from magic bytes.
 * JE CDN sometimes returns wrong content-type headers (jpeg for png),
 * and Claude API strictly validates media_type vs actual image data.
 */
function detectImageType(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  
  // PNG: starts with 0x89 0x50 0x4E 0x47 (‰PNG)
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return "image/png";
  }
  // JPEG: starts with 0xFF 0xD8 0xFF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return "image/jpeg";
  }
  // GIF: starts with GIF87a or GIF89a
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  // WebP: starts with RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  // BMP: starts with BM
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
    return "image/bmp";
  }
  
  // Default to JPEG if unknown
  return "image/jpeg";
}

// ─── Verify image URLs are accessible ───────────────────────────
async function verifyImageUrls(urls: string[], maxImages = 5): Promise<string[]> {
  const verified: string[] = [];
  for (const url of urls.slice(0, maxImages)) {
    try {
      const resp = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      if (resp.ok) verified.push(url);
    } catch {
      // Skip unreachable images
    }
  }
  return verified;
}

// ─── OpenAI GPT-4o Vision ───────────────────────────────────────
// Sends image URLs directly (same as JE's condition_recognizer.rb) with detail:low
// for reliability. GPT-4o fetches the images itself from the public CDN.
async function callOpenAI(imageUrls: string[]): Promise<{ rawText: string; model: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.OPENAI_API_KEY || (await import("./serverConfig")).config.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OPENAI_API_KEY configured");

  // Send URLs directly — matches JE's approach with condition_recognizer.rb
  // Using detail:"low" to avoid GPT refusal on large payloads with multiple images
  const imageMessages = imageUrls.map(url => ({
    type: "image_url" as const,
    image_url: { url, detail: "low" as const },
  }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELS.openai,
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          ...imageMessages,
          { type: "text", text: JE_CONDITION_PROMPT },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data: any = await response.json();
  const rawText = data.choices?.[0]?.message?.content || "";
  const usage = data.usage || {};

  return {
    rawText,
    model: data.model || MODELS.openai,
    inputTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
  };
}

// ─── OpenAI with base64 fallback (for standalone tool / non-CDN images) ──
async function callOpenAIBase64(images: Array<{ base64: string; mediaType: string }>): Promise<{ rawText: string; model: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.OPENAI_API_KEY || (await import("./serverConfig")).config.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OPENAI_API_KEY configured");

  const imageMessages = images.map(img => ({
    type: "image_url" as const,
    image_url: { url: `data:${img.mediaType};base64,${img.base64}`, detail: "low" as const },
  }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELS.openai,
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          ...imageMessages,
          { type: "text", text: JE_CONDITION_PROMPT },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data: any = await response.json();
  const rawText = data.choices?.[0]?.message?.content || "";
  const usage = data.usage || {};

  return {
    rawText,
    model: data.model || MODELS.openai,
    inputTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
  };
}

// ─── Claude Vision ──────────────────────────────────────────────
async function callClaude(images: Array<{ base64: string; mediaType: string }>): Promise<{ rawText: string; model: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY || (await import("./serverConfig")).config.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No ANTHROPIC_API_KEY configured — set it in Convex dashboard environment variables");
  console.log(`Calling Claude with ${images.length} images, model: ${MODELS.claude}`);

  const imageContents = images.map(img => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
  }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELS.claude,
      max_tokens: 1024,
      messages: [{ role: "user", content: [...imageContents, { type: "text" as const, text: JE_CONDITION_PROMPT }] }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data: any = await response.json();
  const textBlock = data.content?.find((b: any) => b.type === "text");
  const rawText = textBlock?.text || "";
  const usage = data.usage || {};

  return {
    rawText,
    model: data.model || MODELS.claude,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
  };
}

// ─── Parse LLM response into structured scores ─────────────────
function parseVisionResponse(rawText: string, model: string, llm: string, inputTokens: number, outputTokens: number): VisionResult {
  // Detect refusal / empty responses
  if (!rawText || rawText.toLowerCase().includes("i'm sorry") || rawText.toLowerCase().includes("i can't assist")) {
    return { ...EMPTY_RESULT, model, llm, input_tokens: inputTokens, output_tokens: outputTokens, error: `LLM refused: ${rawText.slice(0, 100)}`, raw: rawText };
  }

  const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  // Try to parse — handle both single object and array of objects
  let parsed: any = null;
  try {
    // First try direct JSON parse of the whole cleaned text
    const directParsed = JSON.parse(cleaned);
    if (Array.isArray(directParsed)) {
      // GPT sometimes returns per-image results as an array — average them
      parsed = averageArrayResults(directParsed);
    } else {
      parsed = directParsed;
    }
  } catch {
    // Fallback: extract first JSON object with regex
    const jsonMatch = cleaned.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    if (!jsonMatch) {
      // Try array match
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const arr = JSON.parse(arrayMatch[0]);
          if (Array.isArray(arr) && arr.length > 0) {
            parsed = averageArrayResults(arr);
          }
        } catch {
          // fall through
        }
      }
      if (!parsed) {
        return { ...EMPTY_RESULT, model, llm, input_tokens: inputTokens, output_tokens: outputTokens, error: "Failed to parse response", raw: rawText.slice(0, 500) };
      }
    } else {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return { ...EMPTY_RESULT, model, llm, input_tokens: inputTokens, output_tokens: outputTokens, error: "JSON parse failed", raw: rawText.slice(0, 500) };
      }
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return { ...EMPTY_RESULT, model, llm, input_tokens: inputTokens, output_tokens: outputTokens, error: "Unexpected response format", raw: rawText.slice(0, 500) };
  }

  // Detect "Unidentifiable" condition
  const condRaw = parsed.property_condition;
  const isUnidentifiable = typeof condRaw === "string" && condRaw.toLowerCase().includes("unidentif");
  const conditionNum = isUnidentifiable ? 0 : (typeof condRaw === "number" ? condRaw : parseFloat(condRaw) || null);
  const conclusionNum = typeof parsed.conclusion === "number" ? parsed.conclusion : parseFloat(parsed.conclusion) || null;

  return {
    property_condition: conditionNum,
    conclusion: conclusionNum,
    watermark_share: typeof parsed.watermark_share === "number" ? parsed.watermark_share : parseInt(parsed.watermark_share) || 0,
    watermark_size: typeof parsed.watermark_size === "number" ? parsed.watermark_size : parseFloat(parsed.watermark_size) || null,
    watermark_text: parsed.watermark_text || null,
    image_quality: parsed.image_quality || null,
    image_type: parsed.image_type || null,
    image_type_confidence: parsed.image_type_confidence || null,
    unidentifiable: isUnidentifiable,
    model,
    llm,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };
}

// Average results when GPT returns per-image array
function averageArrayResults(arr: any[]): any {
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];

  // Use the first result as base, average numeric fields
  const result = { ...arr[0] };
  const numFields = ["property_condition", "conclusion", "watermark_share", "watermark_size", "image_type_confidence"];

  for (const field of numFields) {
    const values = arr.map(r => typeof r[field] === "number" ? r[field] : parseFloat(r[field])).filter(v => !isNaN(v));
    if (values.length > 0) {
      result[field] = Math.round((values.reduce((a: number, b: number) => a + b, 0) / values.length) * 10) / 10;
    }
  }

  // For text fields, take the worst case. Unknown labels rank below every
  // known one (indexOf would give them -1 — always "worst" — letting a single
  // unexpected string dominate the aggregate).
  const rankIn = (order: string[]) => (value: string) => {
    const i = order.indexOf(value);
    return i === -1 ? order.length : i;
  };

  const qualityOrder = ["poor", "low", "moderate", "high", "professional", "visualization"];
  const qualityRank = rankIn(qualityOrder);
  const qualities = arr.map(r => r.image_quality?.toLowerCase()).filter(Boolean);
  if (qualities.length > 0) {
    result.image_quality = qualities.reduce((worst: string, q: string) =>
      qualityRank(q) < qualityRank(worst) ? q : worst
    , qualities[0]);
  }

  // For image_type, take the most cautious (AI-generated > Render > Real photo)
  const typeOrder = ["AI-generated", "Render (3D / CGI)", "Real photo"];
  const typeRank = rankIn(typeOrder);
  const types = arr.map(r => r.image_type).filter(Boolean);
  if (types.length > 0) {
    result.image_type = types.reduce((worst: string, t: string) =>
      typeRank(t) < typeRank(worst) ? t : worst
    , types[0]);
  }

  // Watermark text: combine all
  const texts = arr.map(r => r.watermark_text).filter(Boolean);
  result.watermark_text = texts.join(", ") || null;

  return result;
}

// ─── Unified vision call (picks provider based on config) ───────
// For OpenAI: sends URLs directly (matches JE's approach)
// For Claude: fetches images and sends as base64 (Claude requires base64)
async function analyzeImagesFromUrls(imageUrls: string[], provider?: VisionProvider): Promise<VisionResult> {
  const p = provider || VISION_PROVIDER;

  if (p === "openai") {
    // OpenAI: send URLs directly — same as JE's condition_recognizer.rb
    const { rawText, model, inputTokens, outputTokens } = await callOpenAI(imageUrls);
    return parseVisionResponse(rawText, model, p, inputTokens, outputTokens);
  } else {
    // Claude requires base64
    const images = await fetchImagesAsBase64(imageUrls, 10);
    if (images.length === 0) {
      return { ...EMPTY_RESULT, error: "No images could be loaded" };
    }
    const { rawText, model, inputTokens, outputTokens } = await callClaude(images);
    return parseVisionResponse(rawText, model, p, inputTokens, outputTokens);
  }
}

// Legacy base64 path (for non-URL images)
async function analyzeImagesBase64(images: Array<{ base64: string; mediaType: string }>, provider?: VisionProvider): Promise<VisionResult> {
  const p = provider || VISION_PROVIDER;
  const caller = p === "openai" ? callOpenAIBase64 : callClaude;
  const { rawText, model, inputTokens, outputTokens } = await caller(images);
  return parseVisionResponse(rawText, model, p, inputTokens, outputTokens);
}

// ═══════════════════════════════════════════════════════════════════
// Standalone Image Recognition (AI Tools page)
// ═══════════════════════════════════════════════════════════════════
export const analyzeImages_standalone = action({
  args: {
    imageUrls: v.array(v.string()),
    listingTitle: v.string(),
    listingId: v.string(),
    provider: v.optional(v.string()), // "openai" | "claude" — defaults to VISION_PROVIDER
  },
  handler: async (ctx, args) => {
    await requireModeratorAction(ctx);
    if (args.imageUrls.length === 0) {
      return { ...EMPTY_RESULT, error: "No image URLs provided" };
    }
    const provider = (args.provider === "openai" || args.provider === "claude") ? args.provider : VISION_PROVIDER;
    return await analyzeImagesFromUrls(args.imageUrls.slice(0, 5), provider);
  },
});

// Keep old name as alias for backward compatibility (frontend uses this)
export const analyzeWithClaude = action({
  args: {
    imageUrls: v.array(v.string()),
    listingTitle: v.string(),
    listingId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireModeratorAction(ctx);
    if (args.imageUrls.length === 0) {
      return { ...EMPTY_RESULT, error: "No image URLs provided" };
    }
    try {
      return await analyzeImagesFromUrls(args.imageUrls.slice(0, 5));
    } catch (e) {
      console.error("analyzeWithClaude error:", e);
      return { ...EMPTY_RESULT, error: `Vision analysis failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
});

// ═══════════════════════════════════════════════════════════════════
// Listing URL Analysis (per-image analysis for a full listing)
// ═══════════════════════════════════════════════════════════════════

interface PerImageResult {
  imageUrl: string;
  imageIndex: number;
  property_condition: number | null;
  conclusion: number | null;
  watermark_share: number | null;
  watermark_size: number | null;
  watermark_text: string | null;
  image_quality: string | null;
  image_type: string | null;
  image_type_confidence: number | null;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  error?: string;
}

interface ListingInfo {
  jeId: string;
  title: string;
  listingUrl: string;
  price?: number;
  currency?: string;
  country?: string;
  city?: string;
  state?: string;
  realEstateType?: string;
  bedrooms?: number;
  bathrooms?: number;
  livingArea?: number;
  office?: string;
  totalImages: number;
  imageUrls: string[];
}

// Parse price from JE mobile API response
function parsePrice(priceStr: string): { price: number; currency: string } | null {
  if (!priceStr) return null;
  const m = priceStr.match(/([€$£])\s*([\d,.\s]+)/) || priceStr.match(/([\d,.\s]+)\s*([€$£])/);
  if (!m) return null;
  const symbols: Record<string, string> = { '$': 'USD', '€': 'EUR', '£': 'GBP' };
  const symIdx = m[1].match(/[€$£]/) ? 1 : 2;
  const numIdx = symIdx === 1 ? 2 : 1;
  const sym = m[symIdx].trim();
  let numStr = m[numIdx].trim();
  if (numStr.includes(',') && numStr.includes('.')) {
    if (numStr.lastIndexOf(',') > numStr.lastIndexOf('.')) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    } else {
      numStr = numStr.replace(/,/g, '');
    }
  } else if (/^\d{1,3}(\.\d{3})+$/.test(numStr)) {
    // European thousands separators only: 1.200.000 → 1200000.
    // Without this, parseFloat("1.200.000") yields 1.2.
    numStr = numStr.replace(/\./g, '');
  } else {
    numStr = numStr.replace(/[,\s]/g, '');
  }
  const price = parseFloat(numStr);
  if (isNaN(price)) return null;
  return { price, currency: symbols[sym] || 'USD' };
}

function parseNumVal(str: string | null | undefined): number | null {
  if (!str) return null;
  const m = str.match(/([\d,.\s]+)/);
  if (!m) return null;
  return parseInt(m[1].replace(/[,\s]/g, ''));
}

function parseArea(str: string | null | undefined): number | null {
  if (!str) return null;
  const num = parseNumVal(str);
  if (num === null) return null;
  if (/sqft/i.test(str)) return Math.round(num * 0.0929);
  return num;
}

const TYPE_PREFIX_RE = /^(House|Apartment|Villa|Penthouse|Land|Estate|Condo|Office|Studio|Townhouse|Other|Plot|Chalet|Castle|Farm|Mansion|Duplex|Loft|Bungalow|Cottage|Ranch)\s+in\s+/i;

async function fetchListingInfo(jeId: string): Promise<ListingInfo | null> {
  // Try Mobile API first
  try {
    const resp = await fetch(`https://www.jamesedition.com/api/mobile/v1/listings/${jeId}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'FeedLens/1.0' },
    });
    if (resp.ok) {
      const data = await resp.json();
      const listing = data.listing;
      if (listing) {
        const parsed = parsePrice(listing.price || '');
        const loc = (listing.location_name || listing.humanized_location || '').replace(TYPE_PREFIX_RE, '');
        const parts = loc.split(',').map((s: string) => s.trim()).filter(Boolean);
        const allImages = [...(listing.images || []), ...(listing.floor_plan_images || [])];
        const typeMatch = (listing.humanized_location || '').match(TYPE_PREFIX_RE);

        return {
          jeId,
          title: listing.headline || `Listing ${jeId}`,
          listingUrl: listing.url || `https://www.jamesedition.com/listing/${jeId}`,
          price: parsed?.price,
          currency: parsed?.currency,
          country: parts.length >= 2 ? parts[parts.length - 1] : parts[0],
          city: parts.length >= 2 ? parts[0] : undefined,
          state: parts.length >= 3 ? parts[parts.length - 2] : undefined,
          realEstateType: typeMatch ? typeMatch[1] : listing.property_type || undefined,
          bedrooms: typeof listing.bedrooms === 'number' ? listing.bedrooms : undefined,
          bathrooms: parseNumVal(listing.bathrooms) ?? undefined,
          livingArea: parseArea(listing.living_area) ?? undefined,
          office: listing.office_name || undefined,
          totalImages: allImages.length,
          imageUrls: allImages,
        };
      }
    }
  } catch { /* fall through */ }

  // Fallback: Search API
  try {
    const resp = await fetch(`https://www.jamesedition.com/api/mobile/v1/listings?listing_id=${jeId}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'FeedLens/1.0' },
    });
    if (resp.ok) {
      const data = await resp.json();
      const listings = data.listings;
      if (Array.isArray(listings) && listings.length > 0) {
        const listing = listings[0];
        const parsed = parsePrice(listing.price || '');
        const loc = (listing.humanized_location || '').replace(TYPE_PREFIX_RE, '');
        const parts = loc.split(',').map((s: string) => s.trim()).filter(Boolean);
        const typeMatch = (listing.humanized_location || '').match(TYPE_PREFIX_RE);

        return {
          jeId,
          title: listing.headline || `Listing ${jeId}`,
          listingUrl: `https://www.jamesedition.com/listing/${jeId}`,
          price: parsed?.price,
          currency: parsed?.currency,
          country: parts.length >= 2 ? parts[parts.length - 1] : parts[0],
          city: parts.length >= 2 ? parts[0] : undefined,
          realEstateType: typeMatch ? typeMatch[1] : undefined,
          bedrooms: parseNumVal(listing.bedrooms) ?? undefined,
          bathrooms: parseNumVal(listing.bathrooms) ?? undefined,
          livingArea: parseArea(listing.living_area) ?? undefined,
          office: listing.office_name || undefined,
          totalImages: (listing.images || []).length,
          imageUrls: listing.images || [],
        };
      }
    }
  } catch { /* fall through */ }

  return null;
}

async function analyzeSingleImage(imageUrl: string, index: number): Promise<PerImageResult> {
  const base: PerImageResult = {
    imageUrl,
    imageIndex: index,
    property_condition: null,
    conclusion: null,
    watermark_share: null,
    watermark_size: null,
    watermark_text: null,
    image_quality: null,
    image_type: null,
    image_type_confidence: null,
  };

  try {
    const images = await fetchImagesAsBase64([imageUrl], 1);
    if (images.length === 0) {
      return { ...base, error: "Failed to fetch image" };
    }
    const { rawText, model, inputTokens, outputTokens } = await callClaude(images);
    const parsed = parseVisionResponse(rawText, model, "claude", inputTokens, outputTokens);

    return {
      ...base,
      property_condition: parsed.property_condition,
      conclusion: parsed.conclusion,
      watermark_share: parsed.watermark_share,
      watermark_size: parsed.watermark_size,
      watermark_text: parsed.watermark_text,
      image_quality: parsed.image_quality,
      image_type: parsed.image_type,
      image_type_confidence: parsed.image_type_confidence,
      model: parsed.model,
      input_tokens: parsed.input_tokens,
      output_tokens: parsed.output_tokens,
      error: parsed.error || undefined,
    };
  } catch (e) {
    return { ...base, error: `Analysis failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const analyzeListingByUrl = action({
  args: {
    input: v.string(), // URL or listing ID
    maxImages: v.optional(v.number()), // default 10
  },
  handler: async (ctx, args) => {
    await requireModeratorAction(ctx);
    // Clamp so a large request can't drive unbounded Claude batches past the
    // action time limit.
    const maxImages = Math.min(args.maxImages || 10, 30);

    // 1. Extract JE ID from input
    const trimmed = args.input.trim();
    let jeId: string;
    if (trimmed.startsWith('http')) {
      const idMatch = trimmed.match(/[-\/](\d{5,})(?:[?#]|$)/);
      jeId = idMatch ? idMatch[1] : '';
    } else {
      jeId = trimmed.replace(/\D/g, '');
    }

    if (!jeId || jeId.length < 5) {
      throw new Error("Invalid listing URL or ID. Please enter a valid JamesEdition listing URL or numeric ID.");
    }

    // 2. Fetch listing data from JE
    console.log(`[ListingAnalysis] Fetching listing data for ${jeId}...`);
    const listing = await fetchListingInfo(jeId);

    if (!listing) {
      throw new Error(`Could not fetch listing data for ID ${jeId}. The listing may not exist or may be unavailable.`);
    }

    if (listing.imageUrls.length === 0) {
      throw new Error(`Listing ${jeId} has no images to analyze.`);
    }

    // 3. Analyze each image individually (up to maxImages, in parallel batches of 5)
    const imagesToAnalyze = listing.imageUrls.slice(0, maxImages);
    console.log(`[ListingAnalysis] Analyzing ${imagesToAnalyze.length}/${listing.totalImages} images for listing ${jeId}...`);

    const allResults: PerImageResult[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < imagesToAnalyze.length; i += BATCH_SIZE) {
      const batch = imagesToAnalyze.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((url, batchIdx) => analyzeSingleImage(url, i + batchIdx))
      );
      allResults.push(...batchResults);
      console.log(`[ListingAnalysis] Batch ${Math.floor(i / BATCH_SIZE) + 1} complete (${allResults.length}/${imagesToAnalyze.length})`);
    }

    // 4. Calculate summary statistics
    const validResults = allResults.filter(r => !r.error && r.property_condition != null);
    const validCount = validResults.length;

    const avgCondition = validCount > 0
      ? Math.round(validResults.reduce((s, r) => s + (r.property_condition || 0), 0) / validCount * 10) / 10
      : null;
    const avgConclusion = validCount > 0
      ? Math.round(validResults.reduce((s, r) => s + (r.conclusion || 0), 0) / validCount * 10) / 10
      : null;
    const avgWatermarkShare = validCount > 0
      ? Math.round(validResults.reduce((s, r) => s + (r.watermark_share || 0), 0) / validCount * 10) / 10
      : null;
    const avgConfidence = validCount > 0
      ? Math.round(validResults.reduce((s, r) => s + (r.image_type_confidence || 0), 0) / validCount)
      : null;

    // Count image types
    const realPhotoCount = validResults.filter(r => (r.image_type || '').toLowerCase().includes('real')).length;
    const renderCount = validResults.filter(r => {
      const t = (r.image_type || '').toLowerCase();
      return t.includes('render') || t.includes('3d') || t.includes('cgi');
    }).length;
    const aiGeneratedCount = validResults.filter(r => (r.image_type || '').toLowerCase().includes('ai')).length;
    const watermarkedCount = validResults.filter(r => (r.watermark_share || 0) > 0).length;

    // Determine dominant image type
    const typeCounts = [
      { type: 'Real Photo', count: realPhotoCount },
      { type: 'Render 3D/CGI', count: renderCount },
      { type: 'AI-Generated', count: aiGeneratedCount },
    ];
    const dominantType = typeCounts.sort((a, b) => b.count - a.count)[0];

    // Count quality levels
    const qualityCounts: Record<string, number> = {};
    for (const r of validResults) {
      const q = (r.image_quality || 'Unknown').toLowerCase();
      qualityCounts[q] = (qualityCounts[q] || 0) + 1;
    }
    const dominantQuality = Object.entries(qualityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

    // Total tokens
    const totalInputTokens = allResults.reduce((s, r) => s + (r.input_tokens || 0), 0);
    const totalOutputTokens = allResults.reduce((s, r) => s + (r.output_tokens || 0), 0);

    const summary = {
      avgCondition,
      avgConclusion,
      avgWatermarkShare,
      avgConfidence,
      realPhotoCount,
      renderCount,
      aiGeneratedCount,
      watermarkedCount,
      dominantImageType: dominantType?.type || 'Unknown',
      dominantQuality,
      qualityCounts,
      totalInputTokens,
      totalOutputTokens,
      successCount: validCount,
      errorCount: allResults.length - validCount,
    };

    // 5. Save to DB
    await ctx.runMutation(api.imageRecognition.saveListingAnalysis, {
      jeId: listing.jeId,
      title: listing.title,
      listingUrl: listing.listingUrl,
      price: listing.price,
      currency: listing.currency,
      country: listing.country,
      city: listing.city,
      state: listing.state,
      realEstateType: listing.realEstateType,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      livingArea: listing.livingArea,
      office: listing.office,
      totalImages: listing.totalImages,
      analyzedImages: allResults.length,
      perImageResults: allResults,
      summary,
      analyzedAt: Date.now(),
    });

    console.log(`[ListingAnalysis] Complete! ${validCount}/${allResults.length} images analyzed successfully for listing ${jeId}`);

    // 6. Return everything
    return {
      listing: {
        jeId: listing.jeId,
        title: listing.title,
        listingUrl: listing.listingUrl,
        price: listing.price,
        currency: listing.currency,
        country: listing.country,
        city: listing.city,
        state: listing.state,
        realEstateType: listing.realEstateType,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        livingArea: listing.livingArea,
        office: listing.office,
      },
      totalImages: listing.totalImages,
      analyzedImages: allResults.length,
      perImageResults: allResults,
      summary,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// Send listing to Implio (approve/reject from Image Recognition page)
// ═══════════════════════════════════════════════════════════════════

const IMPLIO_API_URL = "https://api.implio.com/v1/ads";

export const submitListingToImplio = action({
  args: {
    analysisId: v.id("listingImageAnalyses"),
    action: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModeratorAction(ctx);
    // 1. Fetch the analysis record
    const analysis: any = await ctx.runQuery(api.imageRecognition.getListingAnalysis, { id: args.analysisId });
    if (!analysis) {
      throw new Error("Analysis not found");
    }

    // 2. Get API key
    const apiKey = process.env.IMPLIO_API_KEY || (await import("./serverConfig")).config.IMPLIO_API_KEY;
    if (!apiKey) {
      throw new Error("IMPLIO_API_KEY not configured");
    }

    // 3. Build assessment from image analysis summary
    const summary = analysis.summary || {};
    const assessmentLines = [
      `FeedLens Image Recognition: ${args.action.toUpperCase()}`,
      `Images analyzed: ${analysis.analyzedImages}/${analysis.totalImages}`,
      summary.avgCondition != null ? `Avg condition: ${summary.avgCondition}/6` : null,
      summary.avgConclusion != null ? `Avg conclusion: ${summary.avgConclusion}/6` : null,
      summary.dominantImageType ? `Dominant image type: ${summary.dominantImageType}` : null,
      summary.watermarkedCount > 0 ? `Watermarked images: ${summary.watermarkedCount}` : null,
      summary.aiGeneratedCount > 0 ? `AI-generated images: ${summary.aiGeneratedCount}` : null,
      summary.renderCount > 0 ? `3D renders: ${summary.renderCount}` : null,
      summary.avgConfidence != null ? `Avg confidence: ${summary.avgConfidence}%` : null,
      args.reason ? `Reason: ${args.reason}` : null,
    ].filter(Boolean).join("\n");

    // 4. Build customerSpecific payload
    const cs: Record<string, unknown> = {
      listing_url: analysis.listingUrl || `https://www.jamesedition.com/real_estate/-/-${analysis.jeId}`,
      price: analysis.price,
      location_city: analysis.city,
      location_country: analysis.country,
      real_estate_type: analysis.realEstateType,
      bedrooms: analysis.bedrooms,
      bathrooms: analysis.bathrooms,
      living_area: analysis.livingArea,
      number_of_pictures: analysis.totalImages,
      office_group_name: analysis.office,
      // Image analysis scores
      chat_gpt_conclusion: summary.avgConclusion,
      chat_gpt_property_condition: summary.avgCondition,
      chat_gpt_watermark_share: summary.avgWatermarkShare,
      chat_gpt_image_type: summary.dominantImageType,
      // Viktor metadata
      viktor_flagged: true,
      viktor_assessment: assessmentLines,
      viktor_confidence: summary.avgConfidence ? summary.avgConfidence / 100 : null,
      viktor_outcome: args.action === "approve" ? "approved" : "rejected",
    };

    if (args.action === "reject") {
      cs.viktor_reject = true;
      if (args.reason) cs.seller_message = args.reason;
    } else {
      cs.viktor_approve = true;
    }

    // 5. Build payload and send
    const title = analysis.title || `Listing ${analysis.jeId}`;
    const body = `FeedLens Image Recognition: ${args.action.toUpperCase()}\n\n${assessmentLines}`;

    const payload = [{
      id: String(analysis.jeId),
      content: { title, body },
      customerSpecific: cs,
    }];

    console.log(`[Implio] Submitting listing ${analysis.jeId} as ${args.action}...`);

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
      console.error(`[Implio] API error for listing ${analysis.jeId}: ${response.status} ${errText}`);
      throw new Error(`Implio API error: ${response.status}`);
    }

    console.log(`[Implio] Listing ${analysis.jeId} → ${args.action} OK`);

    // 6. Update the analysis record with the Implio submission status
    await ctx.runMutation(api.imageRecognition.updateListingAnalysisImplioStatus, {
      id: args.analysisId,
      implioStatus: args.action === "approve" ? "approved" : "rejected",
      implioSubmittedAt: Date.now(),
    });

    return { success: true, action: args.action, jeId: analysis.jeId };
  },
});

// ═══════════════════════════════════════════════════════════════════
// Pipeline Vision (called by HTTP handler before moderation)
// ═══════════════════════════════════════════════════════════════════
export const analyzeForModeration = action({
  args: {
    imageUrls: v.array(v.string()),
    listingTitle: v.string(),
    jeId: v.string(),
  },
  handler: async (ctx, args): Promise<VisionResult> => {
    await requireModeratorAction(ctx);
    if (args.imageUrls.length === 0) {
      return { ...EMPTY_RESULT, error: "No image URLs provided" };
    }

    try {
      return await analyzeImagesFromUrls(args.imageUrls.slice(0, 10));
    } catch (e) {
      return { ...EMPTY_RESULT, error: `Vision analysis failed: ${e}` };
    }
  },
});
