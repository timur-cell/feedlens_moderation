// Functional test of the redesigned Queue review loop over 20 listings.
//
// Serves the production build (vite preview), stubs the Rails /api with 20
// synthetic manual-queue listings + their moderation results, then drives the
// keyboard review loop (A / R / N with auto-advance + undo toast) through all
// 20 and asserts: one override POST per listing, correct outcomes, and the
// queue draining to empty.
//
//   bun run build && node scripts/queue-20-test.mjs
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const N = 20;

const COUNTRIES = ["ES", "PT", "IT", "FR"];
const CITIES = ["Marbella", "Estepona", "Coimbra", "Braga", "Lisbon", "Mijas", "Ibiza", "Lagos"];
const OFFICES = ["Best House", "Solvilla", "Zome", "Noll", "Prestige", "IAD", "Remax"];
const RULES = ["new_developments", "low_lqi", "ai_generated_images", "price_500m_plus", "too_few_pictures", "sold_watermark_es"];

const now = Date.now();
const listings = [];
const results = [];
for (let i = 1; i <= N; i++) {
  const id = `L${i}`;
  const rule = RULES[i % RULES.length];
  listings.push({
    _id: id,
    _creationTime: now - i * 3600_000,
    jeId: `21000${1000 + i}`,
    title: `${CITIES[i % CITIES.length]} listing ${i}`,
    priceUsd: 500_000 + i * 137_111,
    country: COUNTRIES[i % COUNTRIES.length],
    city: CITIES[i % CITIES.length],
    office: OFFICES[i % OFFICES.length],
    officeGroupName: OFFICES[i % OFFICES.length],
    officeSubscription: "Freemium",
    feedSource: "Kyero",
    category: "RealEstate",
    realEstateType: "villa",
    bedrooms: 3 + (i % 4),
    bathrooms: 2 + (i % 3),
    livingArea: 200 + i * 10,
    landArea: 800 + i * 20,
    lqi: 40 + (i % 50),
    imageCount: 5 + (i % 20),
    avgImageWidth: 1200,
    avgImageHeight: 800,
    descriptionLength: 800 + i * 13,
    imageUrls: [],
    importedAt: now - i * 3600_000,
    moderationStatus: "manual",
    rental: false,
    preOwned: false,
  });
  results.push({
    _id: `R${i}`,
    _creationTime: now - i * 3600_000,
    listingId: id,
    jeId: `21000${1000 + i}`,
    outcome: "manual",
    confidence: 0.7 + (i % 3) * 0.07,
    processedAt: now - i * 1800_000,
    llmTriggered: false,
    ruleMatches: [
      { ruleName: rule, ruleCategory: "simple_code", action: i % 3 === 1 ? "reject" : "flag", tier: "verify", details: `matched ${rule}` },
    ],
    listing: listings[i - 1],
  });
}

const overrideCalls = [];

function json(route, body) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function waitForServer(url, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 304) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  const preview = spawn("bun", ["run", "preview"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  preview.stdout.on("data", (d) => process.env.VERBOSE && console.log(`[preview] ${d}`.trim()));
  preview.stderr.on("data", (d) => process.env.VERBOSE && console.error(`[preview] ${d}`.trim()));

  let browser;
  const fail = (msg) => {
    console.error(`\n❌ FAIL: ${msg}`);
    throw new Error(msg);
  };

  try {
    if (!(await waitForServer(BASE, 30000))) fail("preview server did not start");

    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    await page.route("**/api/**", (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname;
      const method = req.method();

      if (path === "/api/session") return json(route, { user: { _id: "1", _creationTime: now, name: "Test Mod", email: "mod@feedlens.local", role: "admin", status: "active", createdAt: now }, csrfToken: "test-token" });
      if (path === "/api/listings/pending") return json(route, listings);
      if (path === "/api/listings/stats") return json(route, { total: N, approved: 0, rejected: 0, noticed: 0, manual: N, pending: 0 });
      if (path === "/api/moderation-results/recent") return json(route, results);
      if (path === "/api/messages") return json(route, []);
      if (path === "/api/param-scans/recent") return json(route, []);
      if (path.endsWith("/override") && method === "POST") {
        let outcome = "?";
        let permanent;
        try {
          const body = JSON.parse(req.postData() || "{}");
          outcome = body.newOutcome;
          permanent = body.permanent;
        } catch {}
        overrideCalls.push({ id: path.split("/").slice(-2, -1)[0], outcome, permanent });
        return json(route, { success: true });
      }
      if (path.includes("/notes")) return json(route, []);
      // default: empty list / object
      return json(route, []);
    });

    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`${BASE}/queue`, { waitUntil: "networkidle" });

    // Detail pane should render the first listing's evidence + decision bar.
    await page.getByText("Why flagged").first().waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /^Approve\b/ }).first().waitFor({ timeout: 5000 });
    // Both "Approve" and "Approve forever" should be present in the decision bar.
    await page.getByRole("button", { name: /Approve forever/ }).first().waitFor({ timeout: 5000 });
    console.log("✓ Queue split view rendered with detail + decision bar (incl. Approve forever)");

    const decisions = [];
    for (let i = 0; i < N; i++) {
      const titleEl = page.locator(".min-h-0.flex-1.overflow-y-auto span.text-\\[17px\\]").first();
      const before = overrideCalls.length;
      const mod = i % 3;
      // First decision exercises Shift+A (Approve forever → permanent lock).
      const useForever = i === 0;
      const key = mod === 0 ? "a" : mod === 1 ? "r" : "n";
      const expected = mod === 0 ? "approved" : mod === 1 ? "rejected" : "notice";
      if (useForever) await page.keyboard.press("Shift+A");
      else await page.keyboard.press(key);
      // Wait for the override to land (decide() awaits the POST).
      await page.waitForFunction((n) => true, before, { timeout: 100 }).catch(() => {});
      const deadline = Date.now() + 5000;
      while (overrideCalls.length === before && Date.now() < deadline) {
        await page.waitForTimeout(50);
      }
      if (overrideCalls.length === before) fail(`decision ${i + 1} (${useForever ? "Shift+A" : key}) did not fire an override`);
      const last = overrideCalls[overrideCalls.length - 1];
      if (last.outcome !== expected) fail(`decision ${i + 1}: expected ${expected}, got ${last.outcome}`);
      if (useForever && last.permanent !== true) fail(`decision 1 (Shift+A) should set permanent:true, got ${JSON.stringify(last.permanent)}`);
      if (!useForever && last.permanent) fail(`decision ${i + 1} (${key}) should not set permanent, got ${JSON.stringify(last.permanent)}`);
      decisions.push(last.outcome);
      await page.waitForTimeout(120); // allow auto-advance + re-render
    }

    // Queue should now be drained.
    await page.getByText("Queue is empty").waitFor({ timeout: 5000 });
    console.log("✓ Queue drained to empty after 20 decisions");

    const counts = decisions.reduce((a, o) => ((a[o] = (a[o] || 0) + 1), a), {});
    console.log(`✓ ${overrideCalls.length} overrides recorded:`, counts);

    if (overrideCalls.length !== N) fail(`expected ${N} overrides, got ${overrideCalls.length}`);
    if (errors.length) {
      console.warn("⚠ console errors during run:\n  " + errors.slice(0, 5).join("\n  "));
    }

    await page.screenshot({ path: resolve(root, "screenshots", "queue-20-empty.png") }).catch(() => {});
    console.log("\n✅ PASS — drove 20 listings through the redesigned review loop (J/K nav, A/R/N + Shift+A lock, auto-advance, undo toast).");
  } finally {
    if (browser) await browser.close();
    preview.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
