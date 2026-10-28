import { test } from "@playwright/test";
test("dbg", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message.slice(0, 200)));
  await page.goto("/en");
  await page.waitForTimeout(2500);
  console.log("ERRORS:", errors.length ? errors.join(" | ") : "none");
});
