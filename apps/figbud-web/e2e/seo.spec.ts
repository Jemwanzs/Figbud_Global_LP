import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// Search settings per page (P7-G1) against e2e/mock-api.mjs: Ziwa's Platform
// page has its own sharing image and an old address that forwards to it.

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
  test.skip(testInfo.project.name !== "desktop", "edits shared mock data from the desktop project");
});

async function signInAsOwner(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto(`/admin/invite#token=${randomBytes(32).toString("hex")}`);
  await page.getByLabel("Your name").fill("Olu Owner");
  await page.getByRole("button", { name: "Create passkey and sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Olu");
}

test("search preview, sharing image, hiding from search engines and old addresses", async ({ page }) => {
  test.setTimeout(60_000);
  await signInAsOwner(page);
  await page.goto("/admin/sites/ziwa/pages");
  await page.locator(`a[href^="/admin/sites/ziwa/pages/"]`, { hasText: "Platform" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Platform");

  // The result preview follows the search title as it's typed.
  const preview = page.getByLabel("Search result preview");
  await expect(preview).toContainText("Ziwa LMS › platform");
  await expect(async () => {
    await page.getByLabel("Search title (optional)").fill("Ziwa lending platform");
    await expect(preview).toContainText("Ziwa lending platform", { timeout: 1_000 });
  }).toPass();

  // Its own sharing image, from the media library.
  await expect(page.getByLabel("Sharing image")).toHaveValue(/[0-9a-f-]{36}/);
  await expect(page.getByLabel("Sharing image").locator("option:checked")).toHaveText("Ziwa team");

  // Kept out of search engines (part of the draft).
  await page.getByRole("checkbox", { name: /Hide from search engines/ }).check();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible({ timeout: 10_000 });

  // Old addresses forward here until stopped.
  const oldAddress = page.getByRole("listitem").filter({ hasText: "/lending-platform" });
  await expect(oldAddress).toBeVisible();
  await page.getByRole("button", { name: "Stop forwarding /lending-platform" }).click();
  await expect(oldAddress).toHaveCount(0);

  // Moving a published page says what will happen to its old address.
  await page
    .getByRole("region", { name: "Page", exact: true })
    .getByLabel("Address")
    .fill("lending-operations");
  await expect(page.getByText("the old address /platform will forward here")).toBeVisible();
  await page.getByRole("region", { name: "Page", exact: true }).getByLabel("Address").fill("platform");
});
