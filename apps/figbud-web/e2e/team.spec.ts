import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import { themeSettled } from "./theme-settled";

// Per-website permissions (P7-F1) against e2e/mock-api.mjs: an owner invites
// an editor limited to ZiraHR, then gives them every website.

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
  test.skip(testInfo.project.name !== "desktop", "adds people to shared mock data from the desktop project");
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

async function accept(page: Page, url: string, name: string) {
  await addPasskeyDevice(page);
  await page.goto(url);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Create passkey and sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Welcome, ${name.split(" ")[0]}`);
}

test("limit an invited editor to one website, then give them every website", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await accept(page, `/admin/invite#token=${randomBytes(32).toString("hex")}`, "Olu Owner");

  // The invite chooses the role and the websites.
  const run = randomBytes(2).toString("hex");
  await page.getByLabel("Work email").fill(`esi-${run}@figbud.test`);
  await page.getByRole("radio", { name: /^Editor/ }).check();
  await page.getByRole("radio", { name: /^Selected websites/ }).check();
  const create = page.getByRole("button", { name: "Create invite" });
  await expect(create).toBeDisabled();
  await expect(page.getByText("Choose at least one website")).toBeVisible();
  const websites = page.getByRole("list", { name: "Websites" });
  await expect(websites.getByLabel("ZiraHR").locator("option")).toHaveText(["No access", "Viewer", "Editor"]);
  await websites.getByLabel("ZiraHR").selectOption("editor");
  await create.click();
  const link = await page.getByRole("status").locator("code").textContent();
  expect(link).toContain("/admin/invite#token=");

  // The invitee only ever sees ZiraHR.
  const context = await browser.newContext();
  const esi = await context.newPage();
  await accept(esi, new URL(link!).pathname + new URL(link!).hash, "Esi Editor");
  await esi.goto("/admin/sites");
  const main = esi.getByRole("main");
  await expect(main).toContainText("ZiraHR");
  await expect(main).not.toContainText("Jasiri LMS");
  await esi.goto("/admin/sites/jasiri");
  await expect(esi.getByRole("heading", { level: 1 })).not.toHaveText("Jasiri LMS");

  // The owner sees the limit in Users & access and lifts it.
  await page.goto("/admin/settings");
  await page
    .getByRole("link", { name: /Users & access/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Users & access");
  const member = page.getByRole("listitem", { name: "Esi Editor" });
  await expect(member).toContainText("ZiraHR · Editor");
  await member.getByRole("button", { name: /Change access/ }).click();
  const save = member.getByRole("button", { name: "Save access" });
  await expect(save).toBeDisabled();
  await member.getByRole("radio", { name: /^All websites/ }).check();
  await save.click();
  await expect(member.getByRole("status")).toContainText("Access saved");
  await expect(member).toContainText("All websites");
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await esi.goto("/admin/sites");
  await expect(esi.getByRole("main")).toContainText("Jasiri LMS");
  await context.close();
});

test("Users & access: change a role, suspend and reactivate, revoke a pending invitation", async ({
  page,
  browser,
}) => {
  // Owner's brief, 12 Nov 2026.
  test.setTimeout(90_000);
  await accept(page, `/admin/invite#token=${randomBytes(32).toString("hex")}`, "Olu Owner");
  const run = randomBytes(2).toString("hex");
  const invite = async (email: string) => {
    await page.goto("/admin");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("radio", { name: /^Editor/ }).check();
    await page.getByRole("button", { name: "Create invite" }).click();
    return (await page.getByRole("status").locator("code").textContent())!;
  };

  // Someone who joins, and an invitation nobody accepts.
  const link = await invite(`kofi-${run}@figbud.test`);
  const context = await browser.newContext();
  const kofi = await context.newPage();
  await accept(kofi, new URL(link).pathname + new URL(link).hash, "Kofi Editor");
  const waiting = `ama-${run}@figbud.test`;
  await invite(waiting);

  await page.goto("/admin/settings/team");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Users & access");
  const member = page.getByRole("listitem", { name: "Kofi Editor" });

  // A new role.
  await member.getByLabel("Studio role").selectOption("reviewer");
  await member.getByRole("button", { name: "Change role for Kofi Editor" }).click();
  await expect(member.getByRole("status")).toContainText("Role changed to");

  // Suspended: their next click asks them to sign in; reactivated: back.
  page.once("dialog", (d) => d.accept());
  await member.getByRole("button", { name: /^Suspend/ }).click();
  await expect(member).toContainText("Suspended");
  await kofi.goto("/admin/sites");
  await expect(kofi).toHaveURL(/\/admin\/login/);
  await member.getByRole("button", { name: /^Reactivate/ }).click();
  await expect(member.getByRole("status")).toContainText("Reactivated");

  // Filters.
  await page.getByLabel("Status").selectOption("suspended");
  await expect(page.getByRole("listitem", { name: "Kofi Editor" })).toHaveCount(0);
  await page.getByLabel("Status").selectOption("");

  // The pending invitation, revoked.
  const pending = page.getByRole("region", { name: "Pending invitations" });
  await expect(pending).toContainText(waiting);
  page.once("dialog", (d) => d.accept());
  await pending.getByRole("button", { name: `Revoke the invitation for ${waiting}` }).click();
  await expect(pending.getByRole("status")).toContainText("revoked");
  await expect(pending).not.toContainText(`${waiting}Editor`);

  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await context.close();
});
