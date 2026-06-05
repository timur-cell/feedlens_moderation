import { runTest } from "./auth";

runTest("Remediation Lab Page", async (helper) => {
  const { page } = helper;

  // Navigate to Lab page
  await helper.goto("/lab");
  await page.waitForTimeout(3000);

  // Check page header renders
  const heading = page.locator("h1");
  await heading.waitFor({ timeout: 5000 });
  const headingText = await heading.textContent();
  if (!headingText?.includes("Remediation Lab")) {
    throw new Error(`Expected 'Remediation Lab' heading, got: ${headingText}`);
  }
  console.log("✅ Lab page heading renders correctly");

  // Check shadow mode badge
  const shadowBadge = page.locator("text=Shadow Mode");
  if (!(await shadowBadge.isVisible())) {
    throw new Error("Expected Shadow Mode badge");
  }
  console.log("✅ Shadow Mode badge visible");

  // Check batch scan button
  const scanButton = page.locator("text=Run Batch Scan");
  if (!(await scanButton.isVisible())) {
    throw new Error("Expected batch scan button");
  }
  console.log("✅ Batch scan button visible");

  // Check tabs render
  const tabs = page.locator('[role="tab"]');
  const tabCount = await tabs.count();
  if (tabCount < 4) {
    throw new Error(`Expected at least 4 tabs, got ${tabCount}`);
  }
  console.log("✅ All 4 tabs render");

  // Check stat cards show
  const listingsScanned = page.locator("text=Listings Scanned");
  if (!(await listingsScanned.isVisible())) {
    throw new Error("Expected 'Listings Scanned' card");
  }
  console.log("✅ Stat cards visible");

  // Check sidebar nav link
  const sidebarLink = page.locator('a[href="/lab"]');
  if (await sidebarLink.count() > 0) {
    console.log("✅ Sidebar nav link present");
  }

  // Click through tabs
  for (const tabName of ["Errors Only", "By Feed", "By Seller", "Overview"]) {
    const tab = page.locator(`[role="tab"]:has-text("${tabName}")`);
    if (await tab.isVisible()) {
      await tab.click();
      await page.waitForTimeout(500);
      console.log(`✅ Tab '${tabName}' clickable`);
    }
  }

  // Take screenshot using Playwright directly
  await page.screenshot({ path: "/work/viktor-spaces/feedlens/tmp/lab-page.png", fullPage: true });
  console.log("✅ Screenshot saved");

  console.log("\n🎉 All Remediation Lab tests passed!");
}).catch(() => process.exit(1));
