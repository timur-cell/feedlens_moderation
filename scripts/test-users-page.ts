import { runTest } from "./auth";

runTest("Users Page Screenshot", async (helper) => {
  const { page } = helper;
  
  // Navigate to Users page
  await helper.goto("/users");
  await page.waitForTimeout(2000);
  
  // Take screenshot of users page
  await page.screenshot({ path: "tmp/users-page.png", fullPage: true });
  console.log("📸 Users page screenshot saved");
  
  // Click Add User button
  const addBtn = page.locator("button", { hasText: "Add User" });
  if (await addBtn.isVisible()) {
    await addBtn.click();
    await page.waitForTimeout(1000);
    
    // Take screenshot of the dialog
    await page.screenshot({ path: "tmp/add-user-dialog.png", fullPage: true });
    console.log("📸 Add User dialog screenshot saved");
    
    // Check password field is present
    const passwordInput = page.locator('input[placeholder="Enter password"]');
    const hasPassword = await passwordInput.isVisible();
    console.log(`✓ Password field visible: ${hasPassword}`);
    
    // Check default password value
    const value = await passwordInput.inputValue();
    console.log(`✓ Default password value: ${value}`);
    
    if (!hasPassword) {
      throw new Error("Password field not found in Add User dialog");
    }
  } else {
    throw new Error("Add User button not found");
  }
  
  console.log("✅ Users page test passed");
}).catch(() => process.exit(1));
