import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, type Request, expect, test } from "@playwright/test";

// Cookie consent (P7-PC1). These visitors arrive without a choice; the mock
// API has one enabled analytics provider (Plausible) to show it loads only
// after consent.

test.use({ storageState: { cookies: [], origins: [] } });

const banner = (page: Page) => page.getByRole("region", { name: "Cookie consent" });
const plausible = (page: Page) => page.locator("script#fb-int-plausible");

async function consentCookie(page: Page) {
  const cookie = (await page.context().cookies()).find((c) => c.name === "fb_consent");
  return cookie ? decodeURIComponent(cookie.value).split("|") : null;
}

/** Captures consent records the browser sends (the API is mocked at the network layer). */
async function recordConsent(page: Page) {
  const sent: Record<string, unknown>[] = [];
  await page.route("**/v1/privacy/consent", async (route) => {
    sent.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ status: 204 });
  });
  // The provider's script never really loads in tests.
  await page.route("https://plausible.io/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: "" }),
  );
  return sent;
}

test("first visit: essentials only, a non-blocking banner, and rejecting keeps optional cookies off", async ({
  page,
}) => {
  const sent = await recordConsent(page);
  const thirdParty: string[] = [];
  page.on("request", (r: Request) => {
    if (!r.url().startsWith("http://localhost")) thirdParty.push(r.url());
  });
  await page.goto("/en");
  await expect(banner(page)).toBeVisible();
  await expect(banner(page).getByRole("heading", { name: "Your privacy matters" })).toBeVisible();
  for (const name of ["Accept all", "Reject optional", "Customize"])
    await expect(banner(page).getByRole("button", { name })).toBeVisible();
  await expect(banner(page).getByRole("link", { name: "Cookie Policy" })).toHaveAttribute(
    "href",
    "/en/legal/cookies",
  );
  // Nothing optional runs before a choice, and the page stays usable.
  await expect(plausible(page)).toHaveCount(0);
  expect(await consentCookie(page)).toBeNull();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const results = await new AxeBuilder({ page })
    .include("[data-consent-banner]")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  // The banner never makes the page scroll sideways.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);

  await banner(page).getByRole("button", { name: "Reject optional" }).click();
  await expect(banner(page)).toBeHidden();
  expect((await consentCookie(page))?.[2]).toBe("000");
  await expect.poll(() => sent.at(-1)?.action).toBe("reject_optional");
  expect(sent.at(-1)).toMatchObject({
    site: "figbud",
    analytics: false,
    preferences: false,
    marketing: false,
    policy_version: 1,
  });
  expect(Object.keys(sent.at(-1)!).sort()).toEqual([
    "action",
    "analytics",
    "consent_id",
    "marketing",
    "policy_version",
    "preferences",
    "site",
  ]);
  await page.reload();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(banner(page)).toBeHidden();
  await expect(plausible(page)).toHaveCount(0);
  expect(thirdParty).toEqual([]);
});

test("customize: optional categories start off, choices are saved, and the footer reopens them", async ({
  page,
}) => {
  const sent = await recordConsent(page);
  await page.goto("/en");
  await banner(page).getByRole("button", { name: "Customize" }).click();
  const dialog = page.getByRole("dialog", { name: "Cookie preferences" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Always on", { exact: true })).toBeVisible();
  for (const name of ["Analytics", "Preferences", "Marketing"])
    await expect(dialog.getByRole("switch", { name })).toHaveAttribute("aria-checked", "false");
  const scan = await new AxeBuilder({ page })
    .include("dialog")
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(scan.violations.map((v) => v.id)).toEqual([]);
  await dialog.getByRole("switch", { name: "Analytics" }).click();
  await dialog.getByRole("button", { name: "Save choices" }).click();
  await expect(dialog).toBeHidden();
  await expect(banner(page)).toBeHidden();
  expect((await consentCookie(page))?.[2]).toBe("100");
  await expect.poll(() => sent.at(-1)?.action).toBe("custom");
  // Analytics allowed: the analytics provider loads.
  await expect(plausible(page)).toHaveAttribute("data-domain", "figbud.test");

  // Reopen from the footer: the saved choice is shown; Escape closes.
  await page.getByRole("contentinfo").getByRole("button", { name: "Cookie settings" }).click();
  await expect(dialog.getByRole("switch", { name: "Analytics" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("withdrawing consent stops the integration and keeps the same anonymous ID", async ({ page }) => {
  const sent = await recordConsent(page);
  await page.goto("/en/products");
  await banner(page).getByRole("button", { name: "Accept all" }).click();
  await expect(plausible(page)).toHaveCount(1);
  expect((await consentCookie(page))?.[2]).toBe("111");
  const id = (await consentCookie(page))?.[1];
  await page.getByRole("contentinfo").getByRole("button", { name: "Cookie settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Cookie preferences" });
  // A script that already ran can't be unloaded, so the page reloads without it.
  await Promise.all([
    page.waitForEvent("load"),
    dialog.getByRole("button", { name: "Reject optional" }).click(),
  ]);
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(plausible(page)).toHaveCount(0);
  const cookie = await consentCookie(page);
  expect(cookie?.[2]).toBe("000");
  expect(cookie?.[1]).toBe(id);
  expect(sent.map((s) => s.action)).toEqual(["accept_all", "reject_optional"]);
});

test("asks again once the choice is older than the retention period", async ({ page, context }) => {
  const old = Math.floor(Date.now() / 1000) - 200 * 86_400;
  await context.addCookies([
    {
      name: "fb_consent",
      value: encodeURIComponent(`1|00000000-0000-4000-8000-000000000001|111|${old}`),
      domain: "localhost",
      path: "/",
    },
  ]);
  await recordConsent(page);
  await page.goto("/en");
  await expect(banner(page)).toBeVisible();
  // An expired choice no longer counts: nothing optional loads.
  await expect(plausible(page)).toHaveCount(0);
});

test("other languages show the banner in their language", async ({ page }) => {
  await recordConsent(page);
  await page.goto("/fr");
  await expect(page.getByRole("region", { name: "Consentement aux cookies" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tout accepter" })).toBeVisible();
});

// ---------------------------------------------------------------- Studio

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

test("Studio: Settings → Privacy & Cookies edits the banner and integrations", async ({ page }, testInfo) => {
  // One shared settings document: edit it from one project only.
  test.skip(testInfo.project.name !== "desktop", "Studio settings are edited from the desktop project");
  test.setTimeout(60_000);
  await signInAsOwner(page);
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: /Privacy & Cookies/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy & Cookies");
  await expect(page.getByRole("heading", { name: /Consent in the last 30 days/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();

  // Unsafe values are refused by the server.
  await expect(async () => {
    await page.getByLabel("Privacy Policy link").fill("javascript:alert(1)");
    await expect(page.getByRole("button", { name: "Save settings" })).toBeEnabled({ timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Use a path on the website such as /legal/privacy")).toBeVisible();
  await page.getByLabel("Privacy Policy link").fill("/legal/privacy");

  // Enabling a provider that wasn't on requires asking visitors again.
  await page.getByLabel("Meta Pixel ID").fill("123456789012345");
  await page.getByRole("switch", { name: "Meta Pixel" }).click();
  await expect(page.getByText("Required: a newly enabled provider")).toBeVisible();
  await page.getByRole("switch", { name: "Meta Pixel" }).click();
  await expect(page.getByText("Required: a newly enabled provider")).toBeHidden();

  await page.getByLabel("Remember a visitor's choice for (days)").fill("120");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Remember a visitor's choice for (days)")).toHaveValue("120");
  await expect(page.getByLabel("Meta Pixel ID")).toHaveValue("123456789012345");
  await expect(page.getByRole("switch", { name: "Meta Pixel" })).toHaveAttribute("aria-checked", "false");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
