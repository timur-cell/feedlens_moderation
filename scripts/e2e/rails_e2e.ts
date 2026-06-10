/**
 * End-to-end verification of the Rails-backed FeedLens stack.
 *
 * Prereqs: the docker compose stack is up (see docker-compose.yml; use the
 * docker-compose.e2e.yml overlay when www.jamesedition.com is unreachable so
 * moderate-by-id hits the mock JE API).
 *
 *   bun scripts/e2e/rails_e2e.ts [baseUrl]
 *
 * Logs in as the seeded admin, exercises every page, runs one full
 * moderate-by-id flow and one rules CRUD round-trip. Exits non-zero on the
 * first failed assertion.
 */
import { chromium, type Page } from "playwright";

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? "http://localhost:8080";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@feedlens.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "FeedLens!2026";
const MOCK_JE_ID = "14250002"; // low-quality fixture listing on the mock JE API

let passed = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function expectVisible(page: Page, name: string, selector: string, timeout = 15000) {
  try {
    await page.waitForSelector(selector, { timeout, state: "visible" });
    ok(name, true);
  } catch (e) {
    ok(name, false, `selector not visible: ${selector}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ baseURL: BASE });
  page.setDefaultTimeout(20000);

  // ── Landing + login ────────────────────────────────────────────
  console.log("Landing & login");
  await page.goto("/");
  await expectVisible(page, "landing renders", "text=FeedLens");

  await page.goto("/login");
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {});
  ok("login redirects to dashboard", page.url().includes("/dashboard"), page.url());

  // ── Dashboard ──────────────────────────────────────────────────
  console.log("Dashboard");
  await expectVisible(page, "dashboard stats header", "text=Moderation Statistics");

  // ── Queue ──────────────────────────────────────────────────────
  console.log("Queue");
  await page.goto("/queue");
  await expectVisible(page, "queue page renders", "text=/Queue|Manual Review|No listings/i");

  // ── Moderation log ─────────────────────────────────────────────
  console.log("Moderation log");
  await page.goto("/moderation-log");
  await expectVisible(page, "moderation log renders", "text=/Moderation Log|History|No results/i");

  // CSRF token for direct API requests (cookies are shared with the page)
  const session = await (await page.request.get(`${BASE}/api/session`)).json();
  const csrf: Record<string, string> = { "X-CSRF-Token": session.csrfToken };

  // ── Rules + CRUD round-trip ────────────────────────────────────
  console.log("Rules CRUD");
  await page.goto("/rules");
  await expectVisible(page, "rules list shows seeded rule", "text=Low LQI");

  const ruleName = `e2e_rule_${Date.now()}`;
  const createRule = await page.request.post(`${BASE}/api/rules`, {
    headers: csrf,
    data: {
      name: ruleName,
      displayName: "E2E Test Rule",
      category: "simple_code",
      tier: "auto",
      enabled: true,
      action: "notice",
      priority: 999,
      config: { conditions: [{ field: "lqi", operator: "<", value: 1 }] },
    },
  });
  ok("rule create API (session cookie)", createRule.ok(), String(createRule.status()));
  await page.reload();
  await expectVisible(page, "created rule visible in UI", "text=E2E Test Rule");

  const rules = await (await page.request.get(`${BASE}/api/rules`)).json();
  const created = rules.find((r: { name: string }) => r.name === ruleName);
  ok("created rule present in API list", Boolean(created));

  if (created) {
    const upd = await page.request.patch(`${BASE}/api/rules/${created._id}`, {
      headers: csrf,
      data: { displayName: "E2E Test Rule (edited)" },
    });
    ok("rule update", upd.ok(), String(upd.status()));
    const del = await page.request.delete(`${BASE}/api/rules/${created._id}`, { headers: csrf });
    ok("rule delete", del.ok(), String(del.status()));
    const after = await (await page.request.get(`${BASE}/api/rules`)).json();
    ok("rule gone after delete", !after.some((r: { name: string }) => r.name === ruleName));
  }

  // ── Lists ──────────────────────────────────────────────────────
  console.log("Lists");
  await page.goto("/lists");
  await expectVisible(page, "lists page shows seeded list", "text=/Sold|Commercial|list/i");

  // ── Messages ───────────────────────────────────────────────────
  console.log("Messages");
  await page.goto("/messages");
  await expectVisible(page, "messages page renders templates", "text=/Generic Rejection|template/i");

  // ── Image recognition ──────────────────────────────────────────
  console.log("Image recognition");
  await page.goto("/image-recognition");
  await expectVisible(page, "image recognition page renders", "text=/Image Recognition|Analyze/i");

  // ── Moderate by ID (full flow against mock JE) ────────────────
  console.log("Moderate by ID");
  await page.goto("/moderate-by-id");
  await expectVisible(page, "moderate-by-id page renders", "text=/Moderate by ID|JE ID/i");

  const modResp = await page.request.post(`${BASE}/api/moderate-by-id`, {
    headers: csrf,
    data: { inputs: [MOCK_JE_ID] },
    timeout: 60000,
  });
  ok("moderate-by-id API succeeds", modResp.ok(), String(modResp.status()));
  if (modResp.ok()) {
    const body = await modResp.json();
    ok("moderate-by-id returns a result", body.count === 1 && body.results?.length === 1);
    const r = body.results?.[0];
    ok(
      "fetched listing was moderated (outcome present)",
      Boolean(r && r.jeId === MOCK_JE_ID && r.outcome),
      JSON.stringify(r ?? {}),
    );
    const latest = await (
      await page.request.get(`${BASE}/api/moderation-results/latest-by-je-id/${MOCK_JE_ID}`)
    ).json();
    ok("moderation result persisted", Boolean(latest && latest.jeId === MOCK_JE_ID));
  }

  // ── Settings + team (users) ────────────────────────────────────
  console.log("Settings & team");
  await page.goto("/settings");
  await expectVisible(page, "settings page renders", "text=/Settings/i");
  await page.goto("/settings?tab=team");
  await expectVisible(page, "team tab lists admin user", `text=${ADMIN_EMAIL}`);

  // ── Sign out ───────────────────────────────────────────────────
  const out = await page.request.delete(`${BASE}/api/session`, { headers: csrf });
  ok("sign out", out.status() === 204 || out.ok(), String(out.status()));

  await browser.close();

  console.log(`\n${passed} assertions passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error("FAILED:", failures.join(" | "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
