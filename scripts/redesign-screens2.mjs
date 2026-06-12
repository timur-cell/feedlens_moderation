// Screenshots the gap-fill screens: Team, Messages, Lists, ⌘K Inspect.
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const BASE = "http://localhost:4173";
const now = Date.now();

const users = [
  { _id: "1", _creationTime: now, name: "Tair Kaliyev", email: "tair@jamesedition.com", role: "admin", status: "active", createdAt: now - 90 * 86400000, lastLoginAt: now - 3600000, actionCount: 482 },
  { _id: "2", _creationTime: now, name: "Maria Costa", email: "maria@jamesedition.com", role: "moderator", status: "active", createdAt: now - 60 * 86400000, lastLoginAt: now - 7200000, actionCount: 317 },
  { _id: "3", _creationTime: now, name: "Alex Admin", email: "alex@jamesedition.com", role: "moderator", status: "active", createdAt: now - 40 * 86400000, lastLoginAt: now - 86400000, actionCount: 156 },
  { _id: "4", _creationTime: now, name: "Sam Viewer", email: "sam@jamesedition.com", role: "viewer", status: "invited", createdAt: now - 5 * 86400000, actionCount: 0 },
];
const rules = ["new_developments", "low_lqi", "ai_generated_images"].map((n, i) => ({
  _id: `RU${i}`, _creationTime: now, name: n, displayName: n.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  description: `Checks ${n}`, category: "simple_code", listingCategory: "real_estate", tier: "verify",
  action: "flag", priority: 50 + i, enabled: true, matchCount: 20 - i * 5, falsePositiveCount: i, lastMatchedAt: now - i * 3600000,
  lastModifiedAt: now - i * 86400000, lastModifiedBy: "T. Kaliyev", config: { listRef: i === 0 ? "trusted_developers" : undefined },
}));
const lists = [
  { _id: "L1", name: "trusted_developers", displayName: "Trusted Developers", category: "real_estate.development", source: "manual", itemCount: 4, updatedAt: now, items: [
    { value: "Taylor Wimpey", type: "exact" }, { value: "Solvilla", type: "exact" },
    { value: "/new\\s*development/i", type: "regex", pattern: "new\\s*development", flags: "i" }, { value: "Noll & Partners", type: "exact" },
  ] },
  { _id: "L2", name: "watermark_terms_es", displayName: "Watermark Terms (ES)", category: "image_quality", source: "manual", itemCount: 3, updatedAt: now, items: [
    { value: "vendido", type: "exact" }, { value: "reservado", type: "exact" }, { value: "/sold|vendu/i", type: "regex", pattern: "sold|vendu", flags: "i" },
  ] },
  { _id: "L3", name: "excluded_offices", displayName: "Excluded Offices", category: "exceptions", source: "manual", itemCount: 2, updatedAt: now, items: [
    { value: "Spam Realty", type: "exact" }, { value: "Test Office", type: "exact" },
  ] },
];
const templates = [
  { _id: "M1", _creationTime: now, name: "low_quality_photos", displayName: "Low quality photos", category: "reject", body: "Your listing {listing_title} ({je_id}) was refused due to image quality. Please upload high-resolution photos." },
  { _id: "M2", _creationTime: now, name: "price_check", displayName: "Price verification notice", category: "notice", body: "We noticed the price on {listing_title} may need review for {country}. Minimum is {min_price}." },
];

const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
async function waitForServer(url, ms){const s=Date.now();while(Date.now()-s<ms){try{const r=await fetch(url);if(r.ok)return true;}catch{}await new Promise(r=>setTimeout(r,400));}return false;}

const preview = spawn("bun", ["run", "preview"], { cwd: root, stdio: "ignore" });
try {
  if (!(await waitForServer(BASE, 30000))) throw new Error("preview not up");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (p === "/api/session") return json(route, { user: users[0], csrfToken: "t" });
    if (p === "/api/users") return json(route, users);
    if (p === "/api/users/stats") return json(route, { total: 4, active: 3, invited: 1, admins: 1 });
    if (p.includes("/activity") || p === "/api/activity") return json(route, []);
    if (p === "/api/lists") return json(route, lists);
    if (p === "/api/rules") return json(route, rules);
    if (p === "/api/messages") return json(route, templates);
    if (p === "/api/listings/stats") return json(route, { total: 12, manual: 12, approved: 0, rejected: 0, noticed: 0, pending: 0 });
    if (p === "/api/listings/pending") return json(route, []);
    if (p === "/api/moderation-results/recent") return json(route, []);
    if (p === "/api/param-scans/recent") return json(route, []);
    if (p === "/api/moderate-by-id" && method === "POST") {
      return json(route, { success: true, count: 1, successCount: 1, errorCount: 0, results: [
        { jeId: "2126098665", input: "2126098665", listingId: "L1", title: "Marbella Villa", outcome: "manual", ruleMatches: 2, dataSource: "mobile_api", locked: false,
          ruleMatchDetails: [
            { ruleName: "new_developments", ruleCategory: "simple_code", action: "flag", tier: "verify", details: "Title matched \\bNew\\s*Development" },
          ],
          aiScan: { verdict: "review", flagCount: 1, summary: "", confidence: 0.78, flags: [{ code: "PRICE_SUSPICIOUS", severity: "medium", message: "Price/m² above expected for Marbella villas" }] } },
      ] });
    }
    return json(route, []);
  });

  for (const [path, name] of [["/team", "team"], ["/messages", "messages"], ["/lists", "lists"]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.screenshot({ path: resolve(root, "screenshots", `redesign-${name}.png`) });
    console.log(`✓ ${name}`);
  }

  // ⌘K Inspect — open inline panel with a query.
  await page.goto(`${BASE}/team`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("feedlens:open-inspect", { detail: { query: "2126098665" } })));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(root, "screenshots", "redesign-inspect.png") });
  console.log("✓ inspect");

  await browser.close();
  console.log("done");
} finally {
  preview.kill("SIGTERM");
}
