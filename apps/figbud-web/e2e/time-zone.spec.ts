import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// Display time zone (owner's brief, 14 Nov 2026): timestamps are stored in
// UTC and shown in East Africa Time by default, named beside them; anyone can
// choose their own zone. Only the person's own choice changes here, so other
// tests, which run alongside, keep the organisation's zone.

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
  await page.getByLabel("Your name").fill("Tia Owner");
  await page.getByRole("button", { name: "Create passkey and sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Tia" })).toBeVisible();
}

test("times show in East Africa Time by default, and in a person's own zone once chosen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  await signInAsOwner(page);
  const run = randomBytes(3).toString("hex");
  const invite = async (email: string) => {
    await page.goto("/admin");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("radio", { name: /^Editor/ }).check();
    await page.getByRole("button", { name: "Create invite" }).click();
    return page.getByRole("status").filter({ hasText: "Expires" });
  };

  // East Africa Time, named: "Expires 25 Nov 2026, 18:56 EAT."
  await expect(await invite(`zone-a-${run}@figbud.test`)).toContainText(
    /Expires \d{1,2} \w{3} \d{4}, \d{2}:\d{2} EAT\./,
  );

  // Settings → General → Time zone: the organisation's (owners may change it), and their own.
  await page.goto("/admin/settings");
  const zone = page.getByRole("region", { name: "Time zone" });
  await expect(zone.getByLabel("Organisation")).toHaveValue("Africa/Nairobi");
  await expect(zone.getByLabel("Organisation")).toBeEnabled();
  await expect(zone.getByLabel("You")).toHaveValue("");
  await expect(zone).toContainText(/Now: .* EAT/);
  await zone.getByLabel("You").selectOption("UTC");
  await zone.getByRole("button", { name: "Save for me" }).click();
  await expect(zone.getByRole("status")).toContainText("Coordinated Universal Time (UTC)");

  // Their own zone from then on; the stored time is the same moment.
  await expect(await invite(`zone-b-${run}@figbud.test`)).toContainText(
    /Expires \d{1,2} \w{3} \d{4}, \d{2}:\d{2} UTC\./,
  );

  // Back to following the organisation.
  await page.goto("/admin/settings");
  await page.getByRole("region", { name: "Time zone" }).getByLabel("You").selectOption("");
  await page.getByRole("button", { name: "Save for me" }).click();
  await expect(page.getByRole("region", { name: "Time zone" }).getByRole("status")).toContainText(
    "East Africa Time",
  );
});
