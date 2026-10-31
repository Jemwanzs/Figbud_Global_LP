import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

// Admin flows against e2e/mock-api.mjs through the real same-origin proxy.
// Chromium's virtual authenticator performs genuine WebAuthn ceremonies; the
// Rust tests verify the passkey cryptography itself.

test.beforeEach(({ browserName }) => {
  test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
});

async function addPasskeyDevice(page: Page) {
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
}

test("signed-out visitors are sent to sign in, and admin is never indexed", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to FigBud Admin");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex, nofollow/);
});

test("invite → passkey → dashboard → invite a colleague → sign out → sign back in", async ({ page }) => {
  await addPasskeyDevice(page);
  const token = randomBytes(32).toString("hex");
  const email = `${token.slice(0, 10)}@figbud.test`;

  await page.goto(`/admin/invite#token=${token}`);
  await page.getByLabel("Your name").fill("Ada Lovelace");
  await page.getByRole("button", { name: "Create passkey and sign in" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Ada");
  await expect(page.getByText(`Signed in as ${email} · Owner`)).toBeVisible();

  await page.getByLabel("Work email").fill("colleague@figbud.test");
  await page.getByRole("radio", { name: /Reviewer/ }).check();
  await page.getByRole("button", { name: "Create invite" }).click();
  await expect(page.getByRole("status")).toContainText("Invite created");
  await expect(page.getByRole("status").locator("code")).toContainText("/admin/invite#token=");
  await expect(page.getByRole("region", { name: "Recent activity" })).toContainText("Created an invite");

  // The account menu holds Sign out; Escape closes it and returns focus.
  const account = page.getByRole("button", { name: /Ada/ });
  await account.click();
  await expect(account).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  // The Studio has the same one-button theme switch, and is accessible in light mode too.
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const light = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(light.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await expect(account).toHaveAttribute("aria-expanded", "false");
  await expect(account).toBeFocused();
  await account.click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/, { timeout: 10_000 });

  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Ada");
});

test("invites work once, and unknown emails get a clear message", async ({ page }) => {
  await addPasskeyDevice(page);
  const token = randomBytes(32).toString("hex");
  await page.goto(`/admin/invite#token=${token}`);
  await page.getByLabel("Your name").fill("Grace");
  await page.getByRole("button", { name: "Create passkey and sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.context().clearCookies();
  await page.goto(`/admin/invite#token=${token}`);
  await page.getByRole("button", { name: "Create passkey and sign in" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("This invite is invalid, used or expired.");

  await page.goto("/admin/login");
  await page.getByLabel("Work email").fill("nobody@figbud.test");
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("No passkey is registered for this email");
});

test("an invite link without its token explains what to do", async ({ page }) => {
  await page.goto("/admin/invite");
  await expect(page.locator("p[role=alert]")).toContainText("This invite link is incomplete");
});

test("the admin proxy forwards only admin paths and keeps CSRF protection", async ({ page, request }) => {
  await page.goto("/admin/login");
  const traversal = await request.get("/admin/api/..%2F..%2Fv1%2Farticles");
  expect(traversal.status()).toBe(404);
  // Without the browser's Origin header the API refuses state changes.
  const forged = await request.post("/admin/api/logout", { headers: { origin: "https://evil.example" } });
  expect(forged.status()).toBe(403);
});

test("sign-in and invite pages are accessible", async ({ page }) => {
  for (const path of ["/admin/login", `/admin/invite#token=${"a".repeat(64)}`]) {
    await page.goto(path);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  }
});

test("the Studio header is one compact row that stays visible, with a menu on narrow screens", async ({
  page,
}) => {
  await addPasskeyDevice(page);
  await page.goto(`/admin/invite#token=${randomBytes(32).toString("hex")}`);
  await page.getByLabel("Your name").fill("Nia Navigator");
  await page.getByRole("button", { name: "Create passkey and sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Nia" })).toBeVisible();
  const header = page.getByRole("banner");
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    // Logo, every link and the account control on one row (no wrapped second row).
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(72);
    const nav = page.getByRole("navigation", { name: "Admin" });
    await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: /Nia/ })).toBeInViewport();
  }
  // Sticky: still at the top after scrolling.
  await expect(header).toHaveCSS("position", "sticky");
  await page.mouse.wheel(0, 2000);
  await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
  // Narrow: a menu button opens the same links; Escape closes it.
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(72);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  await expect(
    page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Websites" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
});
