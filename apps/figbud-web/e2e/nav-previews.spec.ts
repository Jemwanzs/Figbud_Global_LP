import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// Hover previews on the menu (UI-NAV2). Desktop interactions on the corporate
// site; phones get the same words inside the menu, and touch opens nothing.

const API = "http://localhost:3199";
const HOME = "Where ideas become impact.";
const ABOUT = "Built with purpose. Engineered for progress.";
const nav = (page: Page) => page.getByRole("navigation", { name: "Main" }).first();
const tooltip = (page: Page) => page.locator('[role="tooltip"]:visible');
const ready = (page: Page) =>
  page.locator('.fb-showcase[data-mode], [role="tooltip"]').first().waitFor({ state: "attached" });

test.describe.configure({ mode: "serial" });

test.describe("desktop", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "desktop menu");
    test.setTimeout(90_000);
  });

  test("hover shows a card under the link, in the opposite theme, and clicks still work at once", async ({
    page,
  }) => {
    await page.goto("/en/about");
    await ready(page);
    const home = nav(page).getByRole("link", { name: "Home" });
    await expect(async () => {
      await page.mouse.move(0, 400);
      await home.hover();
      await expect(tooltip(page)).toContainText(HOME, { timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(tooltip(page)).toContainText("Explore the technology powering smarter businesses.");

    // Beneath its link, on screen.
    const link = (await home.boundingBox())!;
    const card = (await tooltip(page).boundingBox())!;
    expect(card.y).toBeGreaterThanOrEqual(link.y + link.height - 1);
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    // The opposite theme, without touching the page's.
    const pageTheme = await page.locator("html").getAttribute("data-theme");
    const inverse = tooltip(page).locator("[data-inverse]");
    await expect(inverse).toHaveAttribute("data-theme", pageTheme === "dark" ? "light" : "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", pageTheme!);

    // Accessible while open, in this theme and the other.
    const scan = async () =>
      (
        await new AxeBuilder({ page })
          .include("header")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    await expect.poll(scan, { timeout: 15_000 }).toEqual([]);

    // Switching theme flips the card's theme with it.
    await page
      .getByRole("button", { name: /Switch to (light|dark) theme/ })
      .first()
      .click();
    const other = pageTheme === "dark" ? "light" : "dark";
    await expect(page.locator("html")).toHaveAttribute("data-theme", other);
    await home.hover();
    await expect(tooltip(page).locator("[data-inverse]")).toHaveAttribute("data-theme", pageTheme!);

    // Clicking the link navigates straight away, with the card out of the way.
    await home.click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(tooltip(page)).toHaveCount(0);
  });

  test("crossing the menu quickly opens nothing; Escape dismisses; keyboard focus shows it without trapping focus", async ({
    page,
  }) => {
    await page.goto("/en/contact");
    await ready(page);
    const about = nav(page).getByRole("link", { name: "About Us" });
    const blog = nav(page).getByRole("link", { name: "Blog" });
    await expect(about).toHaveAttribute("aria-describedby", /.+/, { timeout: 20_000 });

    // A quick pass: no card flashes.
    const box = (await about.boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.move(box.x + 5, box.y + 300);
    await page.waitForTimeout(400);
    await expect(tooltip(page)).toHaveCount(0);

    await about.hover();
    await expect(tooltip(page)).toContainText(ABOUT);
    await page.keyboard.press("Escape");
    await expect(tooltip(page)).toHaveCount(0);
    await page.mouse.move(0, 500);

    // Keyboard: shows at once, and Tab just moves on (the card has no tab stop).
    await about.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(about).toBeFocused();
    await expect(tooltip(page)).toContainText(ABOUT);
    await page.keyboard.press("Tab");
    await expect(blog).toBeFocused();
    await expect(tooltip(page)).toContainText("Fresh thinking. Smarter moves.");
    await page.keyboard.press("Escape");
    await expect(tooltip(page)).toHaveCount(0);
    await expect(blog).toBeFocused();
  });

  test("the Products dropdown is unchanged and has no preview; cards stay on screen at the narrowest desktop and right to left", async ({
    page,
  }) => {
    await page.goto("/en/contact");
    await ready(page);
    const products = nav(page).getByRole("button", { name: "Products" });
    await expect(nav(page).getByRole("link", { name: "About Us" })).toHaveAttribute(
      "aria-describedby",
      /.+/,
      {
        timeout: 20_000,
      },
    );
    await products.click();
    await expect(products).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("link", { name: /ZiraHR/ }).first()).toBeVisible();
    await expect(tooltip(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(products).toHaveAttribute("aria-expanded", "false");

    await page.setViewportSize({ width: 1024, height: 700 });
    for (const path of ["/en/contact", "/ar/contact"]) {
      await page.goto(path);
      // By structure: the menu has a translated name on other languages.
      const links = page.locator("header nav").first().getByRole("link");
      await expect(links.first()).toHaveAttribute("aria-describedby", /.+/, { timeout: 20_000 });
      const count = await links.count();
      for (let i = 0; i < count; i++) {
        await links.nth(i).hover();
        await expect(tooltip(page)).toHaveCount(1);
        // Read again if the card is being replaced as the pointer moves between links.
        await expect(async () => {
          const card = (await tooltip(page).boundingBox())!;
          expect(card.x).toBeGreaterThanOrEqual(0);
          expect(card.x + card.width).toBeLessThanOrEqual(1024);
        }).toPass({ timeout: 5_000 });
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(0);
    }
    // Arabic pages use the Arabic wording, not English.
    await expect(tooltip(page)).not.toContainText("conversation");
  });

  test("reduced motion: the card appears without animating", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en/contact");
    const about = nav(page).getByRole("link", { name: "About Us" });
    await expect(about).toHaveAttribute("aria-describedby", /.+/, { timeout: 20_000 });
    await about.hover();
    await expect(tooltip(page)).toBeVisible();
    await expect(tooltip(page)).toHaveCSS("animation-name", "none");
  });
});

test("phones: no hover behaviour; the supporting line is in the menu, and links work", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone menu");
  await page.goto("/en/contact");
  const open = page.getByRole("button", { name: /menu/i }).first();
  await expect(async () => {
    await open.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Meet the thinking behind FigBud Global.");
  await expect(page.locator('[role="tooltip"]:visible')).toHaveCount(0);
  await dialog.getByRole("link", { name: "About Us", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/about$/);
});

test("Studio: draft, preview, publish and the on/off switch", async ({ page, request }, testInfo) => {
  // Shared mock data: edit it from one project only, and leave it as it was.
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  test.setTimeout(120_000);
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

  const published = async (slug: string) =>
    (
      (await (await request.get(`${API}/v1/sites`)).json()) as {
        slug: string;
        settings: Record<string, unknown>;
      }[]
    ).find((s) => s.slug === slug)!.settings;

  // A product website edits its own previews and starts with none of FigBud's wording.
  await page.goto("/admin/sites/ziwa/website");
  await page.getByRole("link", { name: "Hover Previews" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hover Previews");
  await expect(page.locator("body")).not.toContainText(HOME);
  const productRows = page.locator("[data-preview]");
  await expect(productRows.first()).toBeVisible();
  await expect(page.getByText("Add a headline to show a preview on this link.").first()).toBeVisible();

  // Each website's page has its own defaults: FigBud Global shows its approved wording.
  await page.goto("/admin/sites/figbud/nav-previews");
  const about = page.locator('[data-preview="about"]');
  await expect(about.getByLabel("Headline for About Us")).toHaveAttribute("placeholder", ABOUT);
  await expect(about.getByText("On the light website")).toBeVisible();
  await expect(about.getByText("On the dark website")).toBeVisible();
  await expect(about.locator('[data-theme="dark"][data-inverse]')).toContainText(ABOUT);
  await expect(about.locator('[data-theme="light"][data-inverse]')).toContainText(ABOUT);

  // Previews update as you type, and limits are enforced by the fields.
  const unpublishedLine = "Unpublished draft line.";
  await about.getByLabel("Headline for About Us").fill(unpublishedLine);
  await expect(about.locator('[data-theme="dark"][data-inverse]')).toContainText(unpublishedLine);
  await about.getByLabel("Icon for About Us").selectOption("rocket");

  // A draft reaches nobody.
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  const afterDraft = await published("figbud");
  expect(JSON.stringify(afterDraft)).not.toContain(unpublishedLine);
  expect(afterDraft).not.toHaveProperty("nav_previews_draft");

  // It survives a reload, for the next person.
  await page.reload();
  await expect(about.getByLabel("Headline for About Us")).toHaveValue(unpublishedLine);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);

  // Publishing a link with its edits, switching one link off, then putting it all back.
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  expect(JSON.stringify(await published("figbud"))).toContain(unpublishedLine);

  await page.getByRole("switch", { name: "Show hover previews" }).click();
  await expect(page.getByText("No menu link shows a card.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  expect((await published("figbud")).nav_previews).toMatchObject({ enabled: false });

  await page.getByRole("switch", { name: "Show hover previews" }).click();
  await about.getByLabel("Headline for About Us").fill("");
  await about.getByLabel("Icon for About Us").selectOption("");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  expect((await published("figbud")).nav_previews).toMatchObject({ enabled: true, items: [] });
});
