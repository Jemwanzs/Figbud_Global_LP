import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

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

  // The owner sees the limit in Team & access and lifts it.
  await page.goto("/admin/settings");
  await page.getByRole("link", { name: /Team & access/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Team & access");
  const member = page.getByRole("listitem", { name: "Esi Editor" });
  await expect(member).toContainText("ZiraHR · Editor");
  await member.getByRole("button", { name: /Change access/ }).click();
  const save = member.getByRole("button", { name: "Save access" });
  await expect(save).toBeDisabled();
  await member.getByRole("radio", { name: /^All websites/ }).check();
  await save.click();
  await expect(member.getByRole("status")).toContainText("Access saved");
  await expect(member).toContainText("All websites");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await esi.goto("/admin/sites");
  await expect(esi.getByRole("main")).toContainText("Jasiri LMS");
  await context.close();
});
