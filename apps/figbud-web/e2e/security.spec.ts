import AxeBuilder from "@axe-core/playwright";
import { createHmac, randomBytes } from "node:crypto";

import { type Browser, type Page, devices, expect, test } from "@playwright/test";
import { themeSettled } from "./theme-settled";

// Password sign-in with mandatory two-factor, recovery and Security &
// Authentication (P13-A). The API's rules are tested in services/api/tests/admin_security.rs;
// these tests cover the screens. Passkey ceremonies need Chromium's virtual authenticator.

const API = "http://localhost:3199";
const PASSWORD = "granite river lantern";
const BAD_LOGIN = "That email and password didn't work.";

test.describe.configure({ mode: "serial" });

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(
    browserName !== "chromium" || testInfo.project.name !== "desktop",
    "Security flows run once, on desktop Chromium, with a phone context where they need one",
  );
  test.setTimeout(120_000);
});

function totp(secret: string, offset = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const c of secret) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 255);
      value &= (1 << bits) - 1;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  return String((digest.readUInt32BE(digest[19]! & 15) & 0x7fffffff) % 1000000).padStart(6, "0");
}

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

/** A new owner with a passkey on this page's device. */
async function join(page: Page, name = "Olu Owner") {
  await addPasskeyDevice(page);
  const token = randomBytes(32).toString("hex");
  await page.goto(`/admin/invite#token=${token}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Create passkey and sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Welcome, ${name.split(" ")[0]}`);
  return `${token.slice(0, 10)}@figbud.test`;
}

const axe = async (page: Page) => {
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};

async function phone(browser: Browser) {
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  return { context, page: await context.newPage() };
}

async function enrol(page: Page) {
  await page.goto("/admin/settings/security");
  await page.getByRole("button", { name: "Set up two-factor" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("2. Enter the 6-digit code it shows").fill(totp(secret));
  await page.getByRole("button", { name: "Turn on two-factor" }).click();
  await expect(page.getByTestId("recovery-codes")).toBeVisible();
  const codes = await page.getByTestId("recovery-codes").locator("li").allTextContents();
  await page.getByRole("button", { name: "I've saved them" }).click();
  await page.getByLabel("New password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat new password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create password" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password created." })).toBeVisible();
  return { secret, codes };
}

async function submitPassword(page: Page, email: string, password: string) {
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue with password" }).click();
}

test("enrol, then sign in from a new phone with password and two-factor; sessions can be signed out", async ({
  page,
  browser,
}) => {
  const email = await join(page);

  // Reachable from Settings and the account menu.
  await page.goto("/admin/settings");
  await page.getByRole("link", { name: /Security & Authentication/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Security & Authentication");

  // A password can't come first.
  await expect(page.getByText("Set up two-factor first")).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);

  // Two-factor: QR code, a wrong code explained, recovery codes shown once.
  await page.getByRole("button", { name: "Set up two-factor" }).click();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("2. Enter the 6-digit code it shows").fill("000000");
  await page.getByRole("button", { name: "Turn on two-factor" }).click();
  await expect(page.getByText("That code didn't work.")).toBeVisible();
  await page.getByLabel("2. Enter the 6-digit code it shows").fill(totp(secret));
  await page.getByRole("button", { name: "Turn on two-factor" }).click();
  await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(10);
  const codes = await page.getByTestId("recovery-codes").locator("li").allTextContents();
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: "I've saved them" }).click();
  await expect(page.getByTestId("recovery-codes")).toHaveCount(0);
  await expect(page.getByText("10 recovery codes left.")).toBeVisible();

  // Weak passwords are refused with a reason; show/hide works.
  const field = page.getByLabel("New password", { exact: true });
  await field.fill("short");
  await page.getByLabel("Repeat new password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create password" }).click();
  await expect(page.getByText("Use at least 12 characters.").last()).toBeVisible();
  await expect(field).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show new password" }).click();
  await expect(field).toHaveAttribute("type", "text");
  await field.fill(PASSWORD);
  await page.getByLabel("Repeat new password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create password" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password created." })).toBeVisible();

  // A new phone, with no passkey on it.
  const { context, page: mobile } = await phone(browser);
  await mobile.goto("/admin/login");
  await expect(mobile.getByRole("heading", { level: 1 })).toHaveText("Welcome back to FigBud Studio");
  await expect(mobile.getByRole("button", { name: "Continue with password" })).toBeVisible();
  await expect(mobile.getByRole("button", { name: "Use passkey instead" })).toBeVisible();
  await expect(mobile.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  expect(await axe(mobile)).toEqual([]);
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
    0,
  );
  // 16px inputs: phones don't zoom in on focus.
  await expect(mobile.getByLabel("Work email")).toHaveCSS("font-size", "16px");

  // The same message for a wrong password and an unknown account.
  await submitPassword(mobile, email, "not the right password");
  await expect(mobile.locator("p[role=alert]")).toContainText(BAD_LOGIN);
  const wrong = await mobile.locator("p[role=alert]").textContent();
  await submitPassword(mobile, `nobody-${randomBytes(4).toString("hex")}@figbud.test`, PASSWORD);
  await expect(mobile.locator("p[role=alert]")).toHaveText(wrong!);

  // The right password alone isn't enough.
  await submitPassword(mobile, email, PASSWORD);
  await expect(mobile.getByRole("heading", { name: "Two-factor verification" })).toBeVisible();
  await expect(mobile.getByLabel("6-digit code")).toBeFocused();
  await expect(mobile.getByLabel("6-digit code")).toHaveAttribute("autocomplete", "one-time-code");
  expect(await axe(mobile)).toEqual([]);
  expect((await context.cookies()).some((c) => c.name.includes("figbud_admin"))).toBe(false);
  await mobile.getByLabel("6-digit code").fill("000000");
  await mobile.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(mobile.locator("p[role=alert]")).toContainText("That code didn't work.");
  await mobile.getByLabel("6-digit code").fill(totp(secret, 1));
  await mobile.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(mobile).toHaveURL(/\/admin$/);

  // The desktop sees the phone, and signs it out.
  await page.reload();
  await expect(page.getByText("Android")).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: /^Sign out Chrome on Android/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "That device was signed out." })).toBeVisible();
  await mobile.goto("/admin");
  await expect(mobile).toHaveURL(/\/admin\/login$/);

  // A recovery code gets in once, in place of the authenticator.
  await submitPassword(mobile, email, PASSWORD);
  await mobile.getByRole("button", { name: "Use a recovery code" }).click();
  await mobile.getByLabel("Recovery code").fill(codes[0]!.toLowerCase());
  await mobile.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(mobile).toHaveURL(/\/admin$/);
  await context.close();

  await page.reload();
  await expect(page.getByText("9 recovery codes left.")).toBeVisible();
  await expect(page.getByTestId("security-activity")).toContainText("Created a password");
  await expect(page.getByTestId("security-activity")).toContainText("Failed sign-in attempt");
});

test("sign-in reads fields filled before the page was ready, as password managers do", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: true });
  const page = await context.newPage();
  // Filled by the browser before React attaches, without any change event reaching it.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const set = (id: string, value: string) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (input) input.value = value;
      };
      set("admin-email", "autofill@figbud.test");
      set("admin-password", "autofilled password");
    });
  });
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Continue with password" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(BAD_LOGIN);
  await context.close();
});

test("forgot password: the same answer for anyone, a single-use link, and two-factor still required", async ({
  page,
  request,
  browser,
}) => {
  const email = await join(page);
  const { secret } = await enrol(page);
  const { context, page: other } = await phone(browser);

  await other.goto("/admin/login");
  await other.getByRole("link", { name: "Forgot password?" }).click();
  await expect(other.getByRole("heading", { level: 1 })).toHaveText("Forgot your password?");
  expect(await axe(other)).toEqual([]);
  await other.locator("#forgot-email").fill(`nobody-${randomBytes(4).toString("hex")}@figbud.test`);
  await other.getByRole("button", { name: "Send recovery link" }).click();
  const answer = other.getByRole("status");
  await expect(answer).toContainText("If that email belongs to a Studio administrator");
  const forUnknown = await answer.textContent();

  await other.goto("/admin/forgot-password");
  await other.locator("#forgot-email").fill(email);
  await other.getByRole("button", { name: "Send recovery link" }).click();
  await expect(other.getByRole("status")).toHaveText(forUnknown!);

  const { token } = await (await request.get(`${API}/v1/__test/recovery?email=${email}`)).json();
  expect(token).toMatch(/^[0-9a-f]{64}$/);

  await other.goto("/admin/reset-password");
  await expect(other.locator("p[role=alert]")).toContainText("This recovery link is incomplete");

  await other.goto(`/admin/reset-password#token=${token}`);
  await other.getByLabel("New password", { exact: true }).fill("short");
  await other.getByLabel("Repeat new password", { exact: true }).fill("different");
  await other.getByRole("button", { name: "Save new password" }).click();
  await expect(other.locator("p[role=alert]")).toHaveText("The two passwords don't match.");
  await other.getByLabel("Repeat new password", { exact: true }).fill("short");
  await other.getByRole("button", { name: "Save new password" }).click();
  await expect(other.locator("p[role=alert]")).toContainText("Use at least 12 characters.");

  const fresh = "copper meadow compass";
  await other.getByLabel("New password", { exact: true }).fill(fresh);
  await other.getByLabel("Repeat new password", { exact: true }).fill(fresh);
  await other.getByRole("button", { name: "Save new password" }).click();
  await expect(other.getByRole("status")).toContainText("Your password has changed");
  expect(other.url()).not.toContain("token=");

  // The desktop's session ended with the old password.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);

  // The link works once.
  await other.goto("/admin/login");
  await other.goto(`/admin/reset-password#token=${token}`);
  await other.getByLabel("New password", { exact: true }).fill("another fine passphrase");
  await other.getByLabel("Repeat new password", { exact: true }).fill("another fine passphrase");
  await other.getByRole("button", { name: "Save new password" }).click();
  await expect(other.locator("p[role=alert]")).toContainText("invalid, used or expired");

  // Sign-in still needs the second factor.
  await other.goto("/admin/login");
  await submitPassword(other, email, fresh);
  await other.getByLabel("6-digit code").fill(totp(secret, 1));
  await other.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(other).toHaveURL(/\/admin$/);
  await context.close();
});

test("repeated failures pause password sign-in, but a passkey still works; passkeys are managed in settings", async ({
  page,
  request,
}) => {
  const email = await join(page);
  await enrol(page);
  await page.getByRole("button", { name: /Olu Owner/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);

  for (let i = 0; i < 5; i++) {
    await submitPassword(page, email, "not the right password");
    await expect(page.locator("p[role=alert]")).toContainText(BAD_LOGIN);
    await expect(page.getByRole("button", { name: "Continue with password" })).toBeEnabled();
  }
  // Paused: even the right password gets the same answer.
  await submitPassword(page, email, PASSWORD);
  await expect(page.locator("p[role=alert]")).toContainText(BAD_LOGIN);
  await expect(page.getByRole("heading", { name: "Two-factor verification" })).toHaveCount(0);

  // The passkey on this device isn't affected.
  await page.getByRole("button", { name: "Use passkey instead" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // Sensitive changes need a recent check; viewing and signing out devices don't.
  await request.get(`${API}/v1/__test/expire-check?email=${email}`);
  await page.goto("/admin/settings/security");
  await expect(page.getByRole("heading", { name: "Confirm it's you" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Register this device" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Change password" })).toBeDisabled();
  await page.getByRole("button", { name: "Confirm with passkey" }).click();
  await expect(page.getByRole("status").filter({ hasText: "that's confirmed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Confirm it's you" })).toHaveCount(0);

  // Register another device, then remove it.
  await page.getByLabel("Name this device").fill("Work phone");
  await page.getByRole("button", { name: "Register this device" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey added" })).toBeVisible();
  await expect(page.getByText("Work phone", { exact: true })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove passkey Work phone" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey removed." })).toBeVisible();
  await expect(page.getByText("Work phone", { exact: true })).toHaveCount(0);

  // Two-factor can't be turned off while a password depends on it.
  await expect(page.getByRole("button", { name: "Turn off" })).toHaveCount(0);
});

test("owners can create a recovery link for someone with two-factor", async ({ page, browser }) => {
  await join(page);
  const context = await browser.newContext();
  const colleague = await context.newPage();
  await join(colleague, "Temi Colleague");
  await enrol(colleague);

  await page.goto("/admin/settings/team");
  const row = page.getByRole("listitem", { name: "Temi Colleague" });
  await expect(row.getByText("Two-factor on")).toBeVisible();
  await expect(row.getByText("Password", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Create password recovery link" }).click();
  await expect(row.getByTestId("recovery-url")).toContainText("/admin/reset-password#token=");
  await context.close();
});

test("sign-in help: set up a password from a way in you already have, with nothing about any account revealed", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await expect(page.getByText("Your workspace. Your way. Sign in securely.")).toBeVisible();
  await page.getByRole("link", { name: "Set up a password" }).click();
  await expect(page).toHaveURL(/\/admin\/sign-in-help#set-up-password$/);
  await expect(page.getByRole("heading", { level: 2, name: "Set up a password" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in with your passkey" })).toHaveAttribute(
    "href",
    "/admin/login",
  );
  await expect(page.getByRole("link", { name: "Reset it by email" })).toHaveAttribute(
    "href",
    "/admin/forgot-password",
  );
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
