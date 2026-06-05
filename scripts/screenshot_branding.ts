import { runTest } from "./auth";

runTest("Screenshot branding", async (helper) => {
  const { page } = helper;
  
  // Screenshot sidebar
  await helper.goto("/dashboard");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "screenshots/branding_sidebar.png", fullPage: false });
  
  // Screenshot login page - sign out first
  await helper.goto("/login");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screenshots/branding_login.png", fullPage: false });
}).catch(() => process.exit(1));
