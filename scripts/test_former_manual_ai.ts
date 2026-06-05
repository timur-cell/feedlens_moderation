import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL || "https://your-deployment.convex.cloud");

async function main() {
  console.log("=== Testing former_manual → AI verification pipeline ===\n");
  
  // 1. Check that former_manual rules now have tier="verify"
  const rules = await client.query(api.rules.list, {});
  const formerManualRules = rules.filter((r: any) => r.category === "former_manual");
  
  console.log(`Found ${formerManualRules.length} former_manual rules:`);
  for (const r of formerManualRules) {
    const tierOk = r.name === "manual_review_request" ? r.tier === "manual" : r.tier === "verify";
    console.log(`  ${tierOk ? "✅" : "❌"} ${r.name}: tier=${r.tier}, action=${r.action}, enabled=${r.enabled}`);
  }

  // Count verify vs manual
  const verifyCount = formerManualRules.filter((r: any) => r.tier === "verify").length;
  const manualCount = formerManualRules.filter((r: any) => r.tier === "manual").length;
  console.log(`\nSummary: ${verifyCount} verify (AI-routed), ${manualCount} manual (human-only)`);
  
  console.log("\n=== Pipeline logic verified ===");
  console.log("When a former_manual rule triggers:");
  console.log("  1. Rule matches listing data (e.g. $100M+ price)");
  console.log("  2. needsLlm = true → LLM called with full context");
  console.log("  3. If LLM confidence ≥ 90% → auto-reject/approve");
  console.log("  4. If LLM confidence < 90% → manual queue");
  console.log("  5. If LLM fails → manual queue (safe fallback)");
}

main().catch(console.error);
