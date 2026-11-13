import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import { themeSettled } from "./theme-settled";

// Per-website permissions (P7-F1) against e2e/mock-api.mjs: an owner invites
// an editor limited to ZiraHR, then gives them every website.

// Two tests change the shared sign-in policy, so this file's tests run one after another.
test.describe.configure({ mode: "default" });

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

  // Studio areas: limited to pricing, their sidebar shows only that (the API refuses the rest).
  await member.getByRole("button", { name: /Change access/ }).click();
  await member.getByRole("radio", { name: "Selected areas" }).check();
  await member.getByLabel("Start from").selectOption("Pricing manager");
  await expect(member.getByText("Changes to apply")).toBeVisible();
  await member.getByRole("button", { name: "Save areas for Kofi Editor" }).click();
  await expect(member.getByRole("status").filter({ hasText: "Areas saved" })).toBeVisible();
  await kofi.goto("/admin");
  const nav = kofi.getByRole("navigation", { name: "Admin" }).first();
  await expect(
    nav
      .getByRole("link", { name: "Pricing Studio" })
      .or(nav.getByRole("button", { name: /Pricing Studio/ }))
      .first(),
  ).toBeVisible();
  await expect(nav.getByRole("link", { name: "Hero management" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: /Leads & Enquiries/ })).toHaveCount(0);

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

test("Users & access: the sign-in policy, previewed and saved; ending one of someone's sessions", async ({
  page,
  browser,
  request,
}) => {
  // P13-B4 (owner's brief, 12 Nov 2026). Retry-safe: the policy starts from its defaults.
  test.setTimeout(90_000);
  expect((await request.post("http://localhost:3199/test/reset-sign-in-policy")).ok()).toBe(true);
  await accept(page, `/admin/invite#token=${randomBytes(32).toString("hex")}`, "Pia Owner");
  const run = randomBytes(2).toString("hex");
  await page.goto("/admin");
  await page.getByLabel("Work email").fill(`efe-${run}@figbud.test`);
  await page.getByRole("radio", { name: /^Editor/ }).check();
  await page.getByRole("button", { name: "Create invite" }).click();
  const link = (await page.getByRole("status").locator("code").textContent())!;
  const context = await browser.newContext();
  const efe = await context.newPage();
  await accept(efe, new URL(link).pathname + new URL(link).hash, "Efe Editor");

  await page.goto("/admin/settings/team");
  const policy = page.getByRole("region", { name: "Sign-in policy" });
  const save = policy.getByRole("button", { name: "Save sign-in policy" });
  await expect(save).toBeDisabled();

  // Turning passkeys off would strand owners who only have one: shown, and it can't be saved.
  await policy.getByRole("checkbox", { name: "Passkeys" }).uncheck();
  await expect(policy.getByTestId("policy-impact")).toContainText("Pia Owner");
  await expect(policy.getByTestId("policy-impact")).toContainText("Owners must keep a way in");
  await expect(save).toBeDisabled();
  await expect(policy).toContainText("An owner would have no way in");
  await policy.getByRole("checkbox", { name: "Password with two-factor" }).uncheck();
  await expect(policy).toContainText("Keep at least one way to sign in");
  await policy.getByRole("checkbox", { name: "Passkeys" }).check();
  await policy.getByRole("checkbox", { name: "Password with two-factor" }).check();

  // Editors must use passkeys (Efe has one), and an hour without use signs people out.
  await policy.getByRole("checkbox", { name: "Editor must use a passkey" }).check();
  await policy.getByLabel("Sign out after inactivity").selectOption("60");
  await expect(policy.getByTestId("policy-impact")).not.toContainText("Efe Editor");
  await save.click();
  await expect(policy.getByRole("status")).toContainText("Sign-in policy saved");
  await page.reload();
  await expect(policy.getByRole("checkbox", { name: "Editor must use a passkey" })).toBeChecked();
  await expect(policy.getByLabel("Sign out after inactivity")).toHaveValue("60");

  // Efe's devices: one session, ended on its own; their next click asks them to sign in.
  const member = page.getByRole("listitem", { name: "Efe Editor" });
  await member.getByRole("button", { name: "Devices and sessions for Efe Editor" }).click();
  const list = member.getByRole("list", { name: "Efe Editor's sessions" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Signed in with a passkey");
  await list.getByRole("button", { name: /^Sign out Efe Editor on / }).click();
  await expect(member.getByRole("status")).toContainText("signed out");
  await expect(list.getByRole("listitem")).toHaveText("Not signed in anywhere.");
  await efe.goto("/admin/sites");
  await expect(efe).toHaveURL(/\/admin\/login/);

  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await context.close();
  expect((await request.post("http://localhost:3199/test/reset-sign-in-policy")).ok()).toBe(true);
});

test("passwords without email: an owner adds an admin user, who joins with a password, signs in with it and changes it", async ({
  page,
  browser,
  request,
}) => {
  // Owner's brief, 13 Nov 2026 (database-driven passwords). Retry-safe: the policy starts from its defaults.
  test.setTimeout(120_000);
  expect((await request.post("http://localhost:3199/test/reset-sign-in-policy")).ok()).toBe(true);
  await accept(page, `/admin/invite#token=${randomBytes(32).toString("hex")}`, "Kai Owner");
  const run = randomBytes(3).toString("hex");
  const first = "granite river lantern";
  const second = "copper meadow compass";

  // The owner lets editors sign in with a password alone.
  await page.goto("/admin/settings/team");
  const policy = page.getByRole("region", { name: "Sign-in policy" });
  await policy.getByRole("checkbox", { name: "Editor needs two-factor" }).uncheck();
  await policy.getByRole("button", { name: "Save sign-in policy" }).click();
  await expect(policy.getByRole("status")).toContainText("Sign-in policy saved");

  // Add admin user: name, role, Studio areas; a single-use link to send privately.
  const add = page.getByRole("region", { name: "Add admin user" });
  await add.getByLabel("Full name").fill("Nia Editor");
  const email = `nia-${run}@figbud.test`;
  await add.getByLabel("Work email").fill(email);
  await add.getByRole("radio", { name: /^Editor/ }).check();
  await add.getByRole("radio", { name: "Selected areas" }).check();
  await add.getByLabel("Start from").selectOption("Pricing manager");
  await add.getByRole("button", { name: "Create invite" }).click();
  const link = (await add.getByRole("status").locator("code").textContent())!;

  // They join with a password: checked as they type, and again by the API.
  const context = await browser.newContext();
  const nia = await context.newPage();
  await nia.goto(new URL(link).pathname + new URL(link).hash);
  await nia.getByRole("button", { name: "Create a password instead" }).click();
  await nia.getByLabel("Password", { exact: true }).fill("short");
  await nia.getByLabel("Confirm password", { exact: true }).fill("shorter");
  await nia.getByRole("button", { name: "Create password and sign in" }).click();
  await expect(nia.getByText("Use at least 12 characters.").first()).toBeVisible();
  await expect(nia.getByText("The passwords don't match.")).toBeVisible();
  await nia.getByRole("button", { name: "Show password" }).click();
  await expect(nia.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await nia.getByLabel("Password", { exact: true }).fill(first);
  await nia.getByLabel("Confirm password", { exact: true }).fill(first);
  await expect(nia.getByText(/Password strength: (Good|Strong)/)).toBeVisible();
  await nia.getByRole("button", { name: "Create password and sign in" }).click();
  await expect(nia.getByRole("heading", { level: 1 })).toHaveText("Welcome, Nia");
  await context.close();

  // Another device: email and password, nothing else (the policy doesn't ask editors for two-factor).
  const other = await browser.newContext();
  const phone = await other.newPage();
  await phone.goto("/admin/login");
  await phone.getByLabel("Work email").fill(email);
  await phone.getByLabel("Password", { exact: true }).fill(first);
  await phone.getByRole("button", { name: "Continue with password" }).click();
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText("Welcome, Nia");

  // Changing it needs the current password.
  await phone.goto("/admin/settings/security");
  const form = phone.getByRole("form", { name: "Change password" });
  await form.getByLabel("New password", { exact: true }).fill(second);
  await form.getByLabel("Confirm new password", { exact: true }).fill(second);
  await form.getByRole("button", { name: "Save new password" }).click();
  await expect(form.getByText("Enter your current password")).toBeVisible();
  await form.getByLabel("Current password", { exact: true }).fill("not my password");
  await form.getByRole("button", { name: "Save new password" }).click();
  await expect(form.getByText("That isn't your current password.")).toBeVisible();
  await form.getByLabel("Current password", { exact: true }).fill(first);
  await form.getByRole("button", { name: "Save new password" }).click();
  await expect(phone.getByRole("status").filter({ hasText: "Password changed" })).toBeVisible();

  const results = await new AxeBuilder({ page: await themeSettled(phone) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await other.close();
  expect((await request.post("http://localhost:3199/test/reset-sign-in-policy")).ok()).toBe(true);
});

test("named Studio roles: saved from someone's areas, given to another, changed for both, deleted without losing areas", async ({
  page,
  browser,
}) => {
  // P13-B3: saved, reusable custom roles.
  test.setTimeout(120_000);
  await accept(page, `/admin/invite#token=${randomBytes(32).toString("hex")}`, "Ola Owner");
  const run = randomBytes(3).toString("hex");
  const join = async (name: string) => {
    await page.goto("/admin");
    await page.getByLabel("Work email").fill(`${name.split(" ")[0]!.toLowerCase()}-${run}@figbud.test`);
    await page.getByRole("radio", { name: /^Editor/ }).check();
    await page.getByRole("button", { name: "Create invite" }).click();
    const link = (await page.getByRole("status").locator("code").textContent())!;
    const context = await browser.newContext();
    await accept(await context.newPage(), new URL(link).pathname + new URL(link).hash, name);
    await context.close();
  };
  await join(`Ama ${run}`);
  await join(`Ben ${run}`);
  const roleName = `Pricing lead ${run}`;

  await page.goto("/admin/settings/team");
  const ama = page.getByRole("listitem", { name: `Ama ${run}` });
  await ama.getByRole("button", { name: /Change access/ }).click();
  await ama.getByRole("radio", { name: "Selected areas" }).check();
  await ama.getByLabel("Start from").selectOption("Pricing manager");
  await ama.getByLabel("Save these areas as a named role").fill(roleName);
  await ama.getByRole("button", { name: /^Save role/ }).click();
  await expect(ama.getByRole("status")).toContainText(`Role "${roleName}" saved`);
  await expect(ama.locator("[data-linked-role]")).toContainText(roleName);
  await ama.getByRole("button", { name: `Save areas for Ama ${run}` }).click();
  await expect(ama.getByRole("status").filter({ hasText: "Areas saved" })).toBeVisible();

  // Given to someone else from the same list.
  await page.reload();
  const ben = page.getByRole("listitem", { name: `Ben ${run}` });
  await ben.getByRole("button", { name: /Change access/ }).click();
  await ben.getByRole("radio", { name: "Selected areas" }).check();
  await ben.getByLabel("Start from").selectOption({ label: roleName });
  await expect(ben.locator("[data-linked-role]")).toContainText(roleName);
  await ben.getByRole("button", { name: `Save areas for Ben ${run}` }).click();
  await expect(ben.getByRole("status").filter({ hasText: "Areas saved" })).toBeVisible();

  // Changing the role changes both.
  await page.reload();
  const roles = page.getByRole("region", { name: "Studio roles" });
  const row = roles.getByRole("listitem", { name: roleName });
  await expect(row).toContainText("2 people");
  await row.getByRole("button", { name: `Edit the role ${roleName}` }).click();
  await row.getByRole("checkbox", { name: "SEO: View" }).check();
  await row.getByRole("button", { name: `Save role ${roleName}` }).click();
  await expect(row.getByRole("status")).toContainText("2 people have the new areas");
  await page.reload();
  await ben.getByRole("button", { name: /Change access/ }).click();
  await expect(ben.getByRole("checkbox", { name: "SEO: View" })).toBeChecked();

  // Deleting it keeps their areas, unlinked.
  page.once("dialog", (d) => d.accept());
  await roles
    .getByRole("listitem", { name: roleName })
    .getByRole("button", { name: `Delete the role ${roleName}` })
    .click();
  await expect(roles.getByRole("listitem", { name: roleName })).toHaveCount(0);
  await page.reload();
  await ben.getByRole("button", { name: /Change access/ }).click();
  await expect(ben.getByRole("checkbox", { name: "SEO: View" })).toBeChecked();
  await expect(ben.locator("[data-linked-role]")).toHaveCount(0);

  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
