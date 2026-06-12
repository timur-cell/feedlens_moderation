// Screenshots the redesigned screens against the stubbed API for a visual check.
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const BASE = "http://localhost:4173";
const now = Date.now();
const N = 12;

const listings = [];
const results = [];
const RULES = ["new_developments", "low_lqi", "ai_generated_images", "price_500m_plus", "too_few_pictures"];
for (let i = 1; i <= N; i++) {
  const id = `L${i}`;
  listings.push({ _id: id, _creationTime: now - i * 4000_000, jeId: `2100${2000 + i}`, title: `${["Marbella","Estepona","Coimbra","Braga","Lisbon"][i%5]} villa ${i}`, priceUsd: 600_000 + i * 211_000, country: ["ES","PT","IT"][i%3], city: ["Marbella","Coimbra","Braga"][i%3], office: ["Best House","Zome","Noll"][i%3], officeGroupName: ["Best House","Zome","Noll"][i%3], officeSubscription:"Freemium", feedSource:"Kyero", category:"RealEstate", realEstateType:"villa", bedrooms:3+i%4, bathrooms:2+i%3, livingArea:300+i*15, landArea:900+i*30, lqi:40+i%50, imageCount:8+i%20, avgImageWidth:1200, avgImageHeight:806, descriptionLength:1500+i*20, imageUrls:[], importedAt: now - i*(i<4?30:6)*3600_000, moderationStatus:"manual", rental:false, preOwned:false });
  results.push({ _id:`R${i}`, _creationTime: now-i*4000_000, listingId:id, jeId:`2100${2000+i}`, outcome: i%4===0?"approved":i%4===1?"rejected":i%4===2?"notice":"manual", confidence:0.72+(i%3)*0.08, processedAt: now - i*900_000, llmTriggered: i%5===0, llmResponse: i%5===0?{recommendation:"approve",confidence:0.9,assessment:"Renders are labeled, photos look real."}:undefined, overriddenBy: i%4===0?"A. Admin":undefined, originalOutcome: i%4===0?"manual":undefined, overrideReason: i%4===0?"false_positive":undefined, ruleMatches:[{ruleName:RULES[i%RULES.length], ruleCategory:"simple_code", action:i%3===1?"reject":"flag", tier:"verify", details:`matched ${RULES[i%RULES.length]}`}], listing: listings[i-1] });
}
const rules = RULES.map((n,i)=>({_id:`RU${i}`,_creationTime:now,name:n,displayName:n.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()),description:`Checks ${n}`,category:"simple_code",listingCategory:"real_estate",tier:"verify",action:i%3===1?"reject":i%3===2?"notice":"flag",priority:50+i,enabled:i!==4,matchCount:(5-i)*6+3,falsePositiveCount:i*2,lastMatchedAt:now-i*7200_000,lastModifiedAt:now-i*86400_000,lastModifiedBy:"T. Kaliyev",config:{conditions:[{field:"lqi",operator:"<",value:30}]},sellerMessage:"Please improve your listing."}));

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
    if (p === "/api/session") return json(route, { user: { _id:"1",_creationTime:now,name:"Test Mod",email:"mod@feedlens.local",role:"admin",status:"active",createdAt:now }, csrfToken:"t" });
    if (p === "/api/listings/pending") return json(route, listings);
    if (p === "/api/listings/stats") return json(route, { total:N, approved:30, rejected:12, noticed:8, manual:N, pending:0 });
    if (p === "/api/moderation-results/recent") return json(route, results);
    if (p === "/api/rules") return json(route, rules);
    if (p === "/api/dashboard/stats") return json(route, { stats:{total:587,approved:498,rejected:42,noticed:30,manual:N,autoTotal:498,manualTotal:89,autoApproved:430,manualApproved:50,autoRejected:38,manualRejected:8,autoNoticed:24,manualNoticed:6}, dailyData: Array.from({length:7},(_,d)=>({date:`2026-06-0${d+6}`,total:80+d*8,approvedAuto:60+d*5,approvedManual:5,rejectedAuto:6,rejectedManual:1,noticedAuto:3,noticedManual:1,manualQueue:40+d*6})) });
    if (p === "/api/dashboard/export-csv") return json(route, []);
    if (p === "/api/messages") return json(route, []);
    if (p === "/api/param-scans/recent") return json(route, []);
    return json(route, []);
  });
  const shots = [["/dashboard","overview"],["/queue","queue"],["/rules","rules"],["/moderation-log","decisions"]];
  for (const [path, name] of shots) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await page.screenshot({ path: resolve(root, "screenshots", `redesign-${name}.png`) });
    console.log(`✓ ${name}`);
  }
  // Queue focus mode
  await page.goto(`${BASE}/queue`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.keyboard.press("f");
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(root, "screenshots", "redesign-queue-focus.png") });
  console.log("✓ queue-focus");
  await browser.close();
  console.log("done");
} finally {
  preview.kill("SIGTERM");
}
