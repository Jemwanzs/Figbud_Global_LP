import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// Enquiries inbox against e2e/mock-api.mjs (synthetic enquiries; signed in as an owner).

test.beforeEach(({ browserName }) => {
  test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
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

test("review an enquiry, follow it up and export the inbox", async ({ page }) => {
  await signInAsOwner(page);
  await expect(page.getByRole("link", { name: /Enquiries.*new, waiting for a reply/ })).toBeVisible();

  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Enquiries" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Enquiries");
  await page.getByLabel("Product").selectOption("zirahr");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/product=zirahr/);
  await expect(page.getByRole("link", { name: /Juma Otieno/ })).toHaveCount(0);

  await page.getByRole("link", { name: /Amina Wanjiru/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Amina Wanjiru");
  await expect(page.getByRole("link", { name: "amina@example.co.ke" })).toHaveAttribute(
    "href",
    "mailto:amina@example.co.ke",
  );
  await expect(page.getByText("We would like a payroll demo for 120 staff.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Emails" })).toContainText(
    "held until email delivery is configured",
  );

  await page.getByLabel("Follow-up status").selectOption("qualified");
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Status updated." })).toBeVisible();
  await expect(page.getByRole("region", { name: "History" })).toContainText("→ Qualified");

  await page.goto("/admin/enquiries");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe("figbud-enquiries-test.csv");
});
