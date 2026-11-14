import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import { themeSettled } from "./theme-settled";

// The Studio tests below save the same settings documents, so they take turns
// (each save is checked against the version it read).
test.describe.configure({ mode: "serial" });

// Navigation, footer & forms per website (P7-E2). In the mock API, Jasiri LMS
// isn't taking enquiries (a fixture); the Studio test edits Ziwa LMS's menu.

test("a product closed to enquiries says so on the contact form and can't be chosen", async ({ page }) => {
  await page.goto("/en/contact?kind=demo_request&product=jasiri");
  const note = page.getByRole("note", { name: "Jasiri LMS isn't taking enquiries right now" });
  await expect(note).toBeVisible();
  await expect(note).toContainText("Jasiri LMS is taking enquiries through its partners for now.");
  // The form starts on FigBud Global instead, and Jasiri can't be picked.
  await expect(page.getByLabel("Product")).toHaveValue("figbud");
  await expect(page.locator('option[value="jasiri"]')).toBeDisabled();
  await expect(page.locator('option[value="jasiri"]')).toHaveText("Jasiri LMS (not taking enquiries)");
  // Open products are unaffected.
  await page.goto("/en/contact?kind=demo_request&product=zirahr");
  await expect(page.getByRole("note")).toHaveCount(0);
  await expect(page.getByLabel("Product")).toHaveValue("zirahr");
});

test("if a product closes while the form is open, the API's refusal is explained", async ({ page }) => {
  await page.route("**/v1/enquiries", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "enquiries_closed", message: "Closed." } }),
    }),
  );
  await page.goto("/en/contact?kind=waitlist&product=ziwa");
  await expect(async () => {
    await page.getByLabel("Full name").fill("Amina Otieno");
    await expect(page.getByLabel("Full name")).toHaveValue("Amina Otieno", { timeout: 1_000 });
  }).toPass();
  await page.getByLabel("Work email").fill("amina@example.co.ke");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByText("Ziwa LMS isn't taking enquiries right now.", { exact: false })).toBeVisible();
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

test("Studio: a website's navigation, footer and enquiry switch", async ({ page }, testInfo) => {
  // Shared mock data: edit it from one project only.
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  test.setTimeout(60_000);
  await signInAsOwner(page);
  await page.goto("/admin/sites/ziwa");
  await page.getByRole("link", { name: "Navigation & forms" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Navigation, footer & forms");
  await expect(page.getByRole("switch", { name: "Taking enquiries" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByText(/Shown now: Platform/)).toBeVisible();

  // Closing is a deliberate switch; here it's turned back before saving.
  await expect(async () => {
    await page.getByRole("switch", { name: "Taking enquiries" }).click();
    await expect(page.getByRole("switch", { name: "Not taking enquiries" })).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByRole("switch", { name: "Not taking enquiries" }).click();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();

  // A custom menu: unsafe addresses are refused, then saved and kept.
  await page.getByRole("radio", { name: /Links I choose/ }).click();
  await page.getByRole("button", { name: "Add link to menu links" }).click();
  await page.getByLabel("Menu links: link 1 label").fill("Platform");
  await page.getByLabel("Menu links: link 1 address").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Links go to a page path such as /platform")).toBeVisible();
  await page.getByLabel("Menu links: link 1 address").fill("/platform");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: /Links I choose/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Menu links: link 1 address")).toHaveValue("/platform");
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // Put the menu back for other tests; the corporate website can't close enquiries.
  await page.getByRole("radio", { name: /The website's pages/ }).click();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.goto("/admin/sites/figbud/website");
  await expect(page.getByRole("switch", { name: "Taking enquiries" })).toBeDisabled();
  await expect(page.getByText("The corporate website always takes enquiries.")).toBeVisible();

  // The home page's showcase motion has its own Studio page now (Our Platforms).
  await page.getByRole("link", { name: "Our Platforms" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Our Platforms");
});

test("Studio: the footer is drafted, checked and published (owner's brief, 7 Nov 2026)", async ({
  page,
}, testInfo) => {
  // Shared mock data: edit it from one project only. Only the contact email is
  // changed on the live footer, which no other test looks at.
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  test.setTimeout(90_000);
  await signInAsOwner(page);
  await page.goto("/admin/sites/figbud");
  await page.locator("#studio-main").getByRole("link", { name: "Footer", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Footer");
  // Empty fields show the approved wording they keep.
  await expect(page.getByPlaceholder("One Vision. Endless Solutions.")).toBeVisible();
  await expect(page.getByPlaceholder("Big ideas deserve brilliant technology.")).toBeVisible();

  // An unsafe link in a group is refused by the server.
  await page.getByRole("button", { name: "Add a group" }).click();
  await page.getByLabel("Group title").fill("Resources");
  await page.getByLabel("Label of link 1 in Resources").fill("Script");
  await page.getByLabel("Destination of link 1 in Resources").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Links go to a page path such as /platform");
  await page.getByRole("button", { name: "Remove Resources" }).click();

  // A bad email too; then a draft that visitors don't see.
  await page.getByLabel("Contact email (optional)").fill("not-an-email");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "Use an email address such as hello@example.com.",
  );
  await page.getByLabel("Contact email (optional)").fill("studio-footer@figbud.test");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Draft saved. Visitors still see the published footer.",
  );
  const site = await page.context().newPage();
  await site.goto("/en/about");
  await expect(
    site.getByRole("contentinfo").getByRole("link", { name: "studio-footer@figbud.test" }),
  ).toHaveCount(0);

  // Published: it shows at once on the corporate website.
  await page.reload();
  await expect(page.getByLabel("Contact email (optional)")).toHaveValue("studio-footer@figbud.test");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published. The footer shows this now.");
  await expect(async () => {
    await site.reload();
    await expect(
      site.getByRole("contentinfo").getByRole("link", { name: "studio-footer@figbud.test" }),
    ).toHaveAttribute("href", "mailto:studio-footer@figbud.test", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  // Scanned from the top, so nothing sits under the sticky top bar at that moment.
  await page.evaluate(() => window.scrollTo(0, 0));
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);

  // Put it back for other tests.
  await page.getByLabel("Contact email (optional)").fill("");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published.");
});

test("Studio: home page section themes, previewed in both themes, drafted and published (UI-TH6)", async ({
  page,
  request,
}, testInfo) => {
  // Shared mock data: edit it from one project only. What's published here matches the automatic
  // alternation, so other tests reading the home page never see a change.
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  test.setTimeout(90_000);
  const published = async () =>
    (
      (await (await request.get("http://localhost:3199/v1/sites")).json()) as {
        slug: string;
        settings: { section_themes?: Record<string, string> };
      }[]
    ).find((s) => s.slug === "figbud")!.settings.section_themes ?? {};
  await signInAsOwner(page);
  await page.goto("/admin/sites/figbud");
  await page.locator("#studio-main").getByRole("link", { name: "Section themes" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Section themes");
  const dark = page.locator('[data-strip="dark"] li');
  const light = page.locator('[data-strip="light"] li');
  // The hero follows each visitor's theme; Our Platforms is opposite; then they alternate.
  await expect(dark.nth(0)).toHaveAttribute("data-band-dark", "true");
  await expect(dark.nth(1)).not.toHaveAttribute("data-band-dark", "true");
  await expect(light.nth(1)).toHaveAttribute("data-band-dark", "true");

  // A draft visitors don't see: the preview follows it at once.
  await page.getByLabel(/^Our philosophy/).selectOption("inverse");
  await expect(dark.nth(2)).not.toHaveAttribute("data-band-dark", "true");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Draft saved. Visitors still see the published themes.",
  );
  expect((await published()).philosophy).toBeUndefined();

  // Publish a choice: the closing band, pinned to the tone it has now.
  await page.getByLabel(/^Our philosophy/).selectOption("auto");
  const closing = page.getByLabel(/^Closing call to action/);
  const now = (await page.locator("label", { hasText: "Closing call to action" }).textContent())!;
  const tone = now.includes("opposite") ? "inverse" : "follow";
  await closing.selectOption(tone);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published. The home page shows this now.");
  expect((await published()).closing).toBe(tone);
  const home = await page.context().newPage();
  await home.goto("/en");
  await expect(home.locator('section[aria-labelledby="final-cta-title"]')).toHaveAttribute("data-band", tone);
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // Back to automatic for other tests.
  await closing.selectOption("auto");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published.");
  expect((await published()).closing).toBeUndefined();
});

test("Studio: a product website's colours and themes are drafted, checked, previewed, published and rolled back", async ({
  page,
}, testInfo) => {
  // Brand & Theme Studio (owner's brief, 11 Nov 2026). Shared mock data: edited
  // from one project only, on Jasiri LMS, and put back at the end.
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  test.setTimeout(90_000);
  await signInAsOwner(page);
  await page.goto("/admin/sites/jasiri/theme");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Colours & themes");
  await expect(page.getByRole("link", { name: "Colours & themes" }).first()).toBeVisible();
  // Nothing changed yet: nothing to publish.
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await expect(publish).toBeDisabled();
  await expect(page.getByText("Nothing to publish")).toBeVisible();
  await expect(page.getByText("Every colour meets WCAG AA in both modes.")).toBeVisible();

  // An unreadable secondary text colour: a warning while drafting, and publishing waits.
  await page.getByRole("tab", { name: "Light mode" }).click();
  const muted = page.getByLabel("Secondary text", { exact: true });
  await muted.fill("#c0c0c0");
  const checks = page.locator("[data-theme-issues]");
  await expect(checks).toContainText(
    "Blocks publishing · Light: Secondary text on the background and surfaces",
  );
  await expect(publish).toBeDisabled();
  await expect(page.getByText("Fix the contrast checks first")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Draft saved. Visitors still see the published colours.",
  );

  // Readable again; previewed at phone width in the light mode, then published.
  await muted.fill("#334155");
  await expect(page.getByText("Every colour meets WCAG AA in both modes.")).toBeVisible();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Mobile" }).click();
  const preview = page.locator("[data-theme-preview]");
  await expect(preview).toHaveAttribute("data-theme", "light");
  // A dark section on a light page: the band takes the dark colours, as on the website.
  const band = preview.locator("[data-preview-band]");
  await expect(band).toHaveAttribute("data-theme", "dark");
  await expect(band).toContainText("Dark section on a light page");
  await expect
    .poll(() => preview.evaluate((el) => getComputedStyle(el).getPropertyValue("--text-muted").trim()))
    .toBe("#334155");
  await expect.poll(() => preview.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(400);
  await publish.click();
  await expect(page.getByRole("status")).toContainText("Published. Jasiri LMS shows these colours");

  // The version is kept, with who published it.
  await page.getByRole("tab", { name: "History" }).click();
  const latest = page.getByRole("tabpanel").getByRole("listitem").first();
  await expect(latest).toContainText("Olu Owner");
  await expect(latest).toContainText("Live now");

  await page.evaluate(() => window.scrollTo(0, 0));
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);

  // Restore defaults is a publish too, so it can be rolled back.
  await page.getByRole("button", { name: "Restore defaults" }).click();
  await publish.click();
  await expect(page.getByRole("status")).toContainText("Published.");
  await expect(page.getByRole("tabpanel").getByRole("listitem")).toHaveCount(2);
  await page.getByRole("tabpanel").getByRole("button", { name: "Load this version" }).nth(1).click();
  await page.getByRole("tab", { name: "Light mode" }).click();
  await expect(muted).toHaveValue("#334155");
  // Put it back for other tests: the built-in colours, nothing stored.
  await page.getByRole("button", { name: "Restore defaults" }).click();
  await expect(publish).toBeDisabled();
});

test("Studio: ZiraHR's section bands follow its palette, with scoped overrides, drafted and published", async ({
  page,
  request,
}, testInfo) => {
  // Owner's brief, 13 Nov 2026. Shared mock data: edited from one project only and put back.
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  test.setTimeout(120_000);
  const API = "http://localhost:3199";
  const published = async () =>
    (
      (await (await request.get(`${API}/v1/sites`)).json()) as {
        slug: string;
        settings: { theme?: Record<string, unknown> & { bands?: unknown; dark?: { surface?: string } } };
      }[]
    ).find((s) => s.slug === "zirahr")!.settings.theme ?? {};
  await signInAsOwner(page);

  // Navigation, footer & forms shows what the bands inherit, and where to change them.
  await page.goto("/admin/sites/zirahr/website");
  const summary = page.locator('[data-band="light-brand"]');
  await expect(summary).toContainText("#38302d");
  await expect(summary).toContainText("Brand default: Dark mode → Cards and panels");
  await page.getByRole("link", { name: "Colours & themes" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Colours & themes");

  // Changing the palette's colour moves every band that inherits it.
  await page.getByRole("tab", { name: "Dark mode" }).click();
  await page.getByLabel("Cards and panels", { exact: true }).fill("#3a2f2a");
  await page.getByRole("tab", { name: "Section bands" }).click();
  const lightBrand = page.locator('[data-band-field="light-brand"]');
  const darkBrand = page.locator('[data-band-field="dark-brand"]');
  await expect(lightBrand).toContainText("#3a2f2a");
  await expect(darkBrand).toContainText("#3a2f2a");

  // An override is scoped to its band and mode, and survives later palette changes.
  await lightBrand.getByRole("radio", { name: "Custom override" }).click();
  await page.getByLabel("Brand band, light mode colour", { exact: true }).fill("#4e2d17");
  await expect(lightBrand).toContainText("Custom override");
  await page.getByRole("tab", { name: "Dark mode" }).click();
  await page.getByLabel("Cards and panels", { exact: true }).fill("#3b302b");
  await page.getByRole("tab", { name: "Section bands" }).click();
  await expect(lightBrand).toContainText("#4e2d17");
  await expect(darkBrand).toContainText("#3b302b");
  // The preview shows the band as the website will.
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator('[data-theme-preview] [data-preview-section-band="brand"]')).toHaveCSS(
    "background-color",
    "rgb(78, 45, 23)",
  );

  // A draft never reaches the website.
  const before = await published();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved.");
  expect(await published()).toEqual(before);

  // Published: the override and the new palette colour, nothing else.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published.");
  let theme = await published();
  expect(theme.bands).toEqual({ light: { brand: "#4e2d17" } });
  expect(theme.dark?.surface).toBe("#3b302b");

  // Saving Navigation, footer & forms keeps the published theme as it is.
  await page.goto("/admin/sites/zirahr/website");
  await expect(page.locator('[data-band="light-brand"]')).toContainText("Custom override");
  await expect(page.locator('[data-band="dark-brand"]')).toContainText("#3b302b");
  const closed = page.getByLabel("Message while closed", { exact: true });
  await closed.fill(`Back soon (${testInfo.retry}).`);
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  expect(await published()).toEqual(theme);
  await closed.fill("");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  // Resetting the override inherits the current palette colour again.
  await page.goto("/admin/sites/zirahr/theme");
  await page.getByRole("tab", { name: "Section bands" }).click();
  await lightBrand.getByRole("button", { name: /Reset to brand default/ }).click();
  await expect(lightBrand).toContainText("Brand default: Dark mode → Cards and panels");
  await expect(lightBrand).toContainText("#3b302b");
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);

  // Put it back for other tests: the built-in colours, nothing stored.
  await page.getByRole("button", { name: "Restore defaults" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published.");
  theme = await published();
  expect(theme).toEqual({});
});

test("Studio: each website chooses its languages, drafted and published, opening only in a reviewed one", async ({
  page,
  request,
}, testInfo) => {
  // P7-L1 (owner's brief, 14 Nov 2026). Shared mock data: Jasiri LMS only, put back at the end.
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  test.setTimeout(120_000);
  const API = "http://localhost:3199";
  const languagesOf = async (slug: string) =>
    (
      (await (await request.get(`${API}/v1/sites`)).json()) as {
        slug: string;
        settings: { languages?: unknown };
      }[]
    ).find((s) => s.slug === slug)!.settings.languages ?? null;
  await signInAsOwner(page);
  await page.goto("/admin/sites/jasiri");
  await page.locator("#studio-main").getByRole("link", { name: "Languages", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Languages");
  const english = page.getByRole("checkbox", { name: /English/ });
  await expect(english).toBeChecked();
  await expect(english).toBeDisabled();
  // Product websites stay in English until their pages can be translated.
  await expect(page.locator("[data-languages-live]")).toHaveText("Now: English; opens in English.");

  // French on, as the fallback; it can't be the default before its review.
  await page.getByRole("checkbox", { name: /French/ }).check();
  const opensIn = page.getByLabel("Opens in (default)");
  // Playwright treats options as enabled; the attribute is what the browser honours.
  await expect(opensIn.locator('option[value="fr"]')).toHaveAttribute("disabled", "");
  await page.getByLabel("When a text isn't translated").selectOption("fr");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved.");
  expect(await languagesOf("jasiri")).toBeNull();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published.");
  expect(await languagesOf("jasiri")).toEqual({ enabled: ["en", "fr"], default: "en", fallback: "fr" });

  // The shared Languages page shows which websites use each language.
  await page.goto("/admin/settings/languages");
  const french = page.locator('[data-locale="fr"] [data-used-on]');
  await expect(french).toContainText("Jasiri LMS");
  await expect(french).toContainText("FigBud Global");
  await expect(page.locator('[data-locale="zh"] [data-used-on]')).not.toContainText("Jasiri LMS");

  // FigBud Global: a draft changes nothing for visitors, and is discarded.
  await page.goto("/admin/sites/figbud/languages");
  await expect(page.getByRole("checkbox", { name: /Chinese/ })).toBeChecked();
  await page.getByRole("checkbox", { name: /Chinese/ }).uncheck();
  await expect(page.locator("[data-languages-next]")).not.toContainText("Chinese");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved.");
  expect(await languagesOf("figbud")).toBeNull();
  await page.getByRole("button", { name: "Discard draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft discarded.");
  await expect(page.getByRole("checkbox", { name: /Chinese/ })).toBeChecked();
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);

  // Put Jasiri LMS back to English only.
  await page.goto("/admin/sites/jasiri/languages");
  await page.getByRole("checkbox", { name: /French/ }).uncheck();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published.");
  expect(await languagesOf("jasiri")).toEqual({ enabled: ["en"], default: "en", fallback: "en" });
});

test("Studio: the Studio's own appearance is drafted, checked, published, applied and restored", async ({
  page,
}, testInfo) => {
  // Owner's brief, 12 Nov 2026. Shared mock data: one project only, put back at the end.
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  test.setTimeout(90_000);
  await signInAsOwner(page);
  await page.goto("/admin/settings/appearance");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Appearance & themes");
  await expect(page.getByRole("link", { name: "Appearance & themes" })).toBeVisible();
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await expect(publish).toBeDisabled();
  await expect(page.getByText("Every colour stays readable in both modes.")).toBeVisible();

  // Unreadable body text: a warning while drafting, and publishing waits.
  await page.getByRole("tab", { name: "Dark mode" }).click();
  const body = page.getByLabel("Body text", { exact: true });
  await body.fill("#3a2a20");
  await expect(page.locator("[data-appearance-issues]")).toContainText("Blocks publishing · Dark: Body text");
  await expect(publish).toBeDisabled();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved.");

  // A readable sidebar colour: previewed, published, and applied to the Studio at once.
  await body.fill("#e3d4c3");
  await page.getByLabel("Sidebar and navigation", { exact: true }).fill("#1f140d");
  await expect
    .poll(() =>
      page
        .locator('[data-appearance-preview][data-theme="dark"]')
        .evaluate((el) => getComputedStyle(el).getPropertyValue("--bg-elevated").trim()),
    )
    .toBe("#1f140d");
  await publish.click();
  await expect(page.getByRole("status")).toContainText("Published.");
  await page.reload();
  await expect(page.locator("style[data-studio-appearance]")).toHaveCount(1);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--bg-elevated").trim(),
      ),
    )
    .toBe("#1f140d");
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("tabpanel").getByRole("listitem").first()).toContainText("Olu Owner");

  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);

  // Back to the built-in palette, for other tests.
  await page.getByRole("button", { name: "Restore defaults" }).click();
  await publish.click();
  await expect(page.getByRole("status")).toContainText("Published.");
  await page.reload();
  await expect(page.locator("style[data-studio-appearance]")).toHaveCount(0);
});

test("Studio: a language is published only with a recorded review, and can go back to draft (P7-G2)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  test.setTimeout(60_000);
  await signInAsOwner(page);
  await page.goto("/admin/settings/languages");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Languages");
  const fr = page.locator('[data-locale="fr"]');
  await expect(fr).toContainText("Draft · not indexed");
  await expect(fr).toContainText(/\d+ of \d+ texts translated/);
  // Its acknowledgement emails are there to review too (P5-12).
  await fr.getByText(/Acknowledgement emails to review/).click();
  await expect(fr.getByText("Votre demande de démonstration de ZiraHR")).toBeVisible();
  // No review recorded: Publish waits.
  await expect(fr.getByRole("button", { name: "Publish" })).toBeDisabled();
  await fr.getByLabel("Reviewed by").fill("Native reviewer (test)");
  await fr.getByLabel("Review date").fill("2026-11-10");
  await fr.getByLabel("Where the review is kept").fill("Signed review sheet (test)");
  await fr.getByRole("button", { name: "Publish" }).click();
  await expect(fr.getByRole("status")).toContainText("is published");
  await expect(fr).toContainText("Published · indexed");
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
  // Back to draft, for other tests.
  page.once("dialog", (d) => d.accept());
  await fr.getByRole("button", { name: "Back to draft" }).click();
  await expect(fr).toContainText("Draft · not indexed");
});
