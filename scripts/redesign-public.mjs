// Screenshots the public pages (login, landing) to verify the wordmark redesign.
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const BASE = "http://localhost:4173";
const now = Date.now();

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
    if (p === "/api/session") return json(route, { user: null, csrfToken: "t" });
    return json(route, []);
  });
  for (const [path, name] of [["/login", "login"], ["/", "landing"]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await page.screenshot({ path: resolve(root, "screenshots", `redesign-${name}.png`) });
    console.log(`✓ ${name}`);
  }
  await browser.close();
  console.log("done");
} finally {
  preview.kill("SIGTERM");
}
