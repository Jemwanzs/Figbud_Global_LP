import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import { scrolledToTop, themeSettled } from "./theme-settled";
import { answer } from "./confirm-dialog";

// Hero Design Studio: FigBud Global's platform heroes (P12-H7). Kept apart
// from hero.studio.spec.ts so a retry here never re-runs its publishing flow.
// Nothing is published: the corporate home page other tests use stays as it is.

const API = "http://localhost:3199";

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
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Olu" })).toBeVisible();
}

// From the top of the page: a field part-hidden under the sticky Studio header at
// whatever scroll position a step left behind isn't an undersized target.
const axe = async (page: Page) =>
  new AxeBuilder({ page: await themeSettled(await scrolledToTop(page)) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
// Rule ids with the elements at fault, so a failure says where to look.
const violations = (results: Awaited<ReturnType<typeof axe>>, prefix = "") =>
  results.violations.map((v) => `${prefix}${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

test.describe.configure({ mode: "serial" });

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(
    browserName !== "chromium" || testInfo.project.name !== "desktop",
    "Studio flows run once, on desktop Chromium",
  );
});

// FigBud Global's platform heroes (owner's brief, 13 Nov 2026): five designs
// beside the live one, each with its own look, real products and statuses.
const PLATFORM: [string, string, "light" | "dark"][] = [
  ["v5", "emerald", "dark"],
  ["v6", "digital", "dark"],
  ["v7", "ecosystem_light", "light"],
  ["v8", "orbit", "light"],
  ["v9", "dark_enterprise", "dark"],
];

test("platform heroes: their own look, real products, hover descriptions, paused motion and phones", async ({
  page,
}) => {
  // Ten accessibility scans.
  test.setTimeout(240_000);
  await signInAsOwner(page);
  for (const [id, design, scheme] of PLATFORM) {
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/admin/hero-preview/figbud/${id}?theme=${theme}`);
      const hero = page.locator(`[data-hero-design="${design}"]`);
      // "Keep the design's own look": its intended theme whatever the visitor chose.
      await expect(hero).toHaveAttribute("data-theme", scheme);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Built for complexity.");
      expect(violations(await axe(page), `figbud/${id}/${theme}: `)).toEqual([]);
    }
  }
  // Every product card is a link; the ones leaving the site open a new tab safely.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/admin/hero-preview/figbud/v5?theme=dark");
  const cards = page.locator('[data-hero-design="emerald"] a[aria-describedby]').filter({ visible: true });
  await expect(cards.first()).toBeVisible();
  for (const card of await cards.all()) {
    if ((await card.getAttribute("target")) === "_blank")
      await expect(card).toHaveAttribute("rel", /noopener/);
  }
  // A short description appears on keyboard focus and on hover (where the floating card holds still).
  const first = cards.first();
  const tip = page.locator(`#${await first.getAttribute("aria-describedby")}`);
  const shown = () => tip.evaluate((el) => getComputedStyle(el).opacity);
  await first.focus();
  await expect.poll(shown).toBe("1");
  await first.blur();
  await expect.poll(shown).toBe("0");
  // Floating cards never pass Playwright's "stable" check: the pointer goes straight to it.
  await first.hover({ force: true });
  await expect.poll(shown).toBe("1");
  await expect.poll(() => first.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("paused");
  await expect(page.locator('[data-hero-design="emerald"]')).toHaveAttribute("data-motion", "on");
  // The Studio's "Pause motion" holds the frame still; so does the visitor's reduced-motion setting.
  await page.goto("/admin/hero-preview/figbud/v5?theme=dark&motion=off");
  await expect(page.locator('[data-hero-design="emerald"]')).toHaveAttribute("data-motion", "off");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/admin/hero-preview/figbud/v8?theme=light");
  await expect(page.locator('[data-hero-design="orbit"]')).toHaveAttribute("data-motion", "off");
  // Phones: no sideways scrolling.
  await page.setViewportSize({ width: 360, height: 780 });
  for (const [id] of PLATFORM) {
    await page.goto(`/admin/hero-preview/figbud/${id}?theme=dark`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      id,
    ).toBeLessThanOrEqual(0);
  }
});

test("platform heroes: customise colours, badges, products and theme; reset, discard and save", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const liveBefore = (await (await request.get(`${API}/v1/sites/figbud/hero`)).json()).hero;
  await signInAsOwner(page);
  await page.goto("/admin/sites/figbud");
  await page.getByRole("link", { name: "Hero Design Studio" }).click();
  // The website's own hero, its four designs and the five platform heroes.
  await expect(page.locator("[data-variant]")).toHaveCount(10);
  const card = page.locator('[data-variant="v9"]');
  await expect(card).toContainText("Dark Enterprise");

  // Pause motion changes the preview frames only.
  await page.getByRole("button", { name: "Pause motion" }).click();
  await expect(card.locator("iframe")).toHaveAttribute("src", /motion=off/);
  await page.getByRole("button", { name: "Play motion" }).click();

  await card.getByRole("button", { name: "Edit" }).click();
  const editor = page.getByRole("region", { name: /^Edit / });
  await editor.getByLabel("Light and dark mode").selectOption("site");
  await editor.getByLabel("Badge 1").fill("Built for growing teams");
  await editor.getByRole("checkbox", { name: "Jasiri LMS" }).check();
  await editor.getByRole("checkbox", { name: "ZiraHR" }).check();
  await editor.getByRole("button", { name: "Move ZiraHR up" }).click();
  await editor.getByLabel("Headline accent").fill("#0f766e");
  await expect(editor.getByRole("button", { name: "Reset Headline accent" })).toBeVisible();
  await editor.getByLabel("Main button", { exact: true }).fill("#1d4ed8");
  await editor.getByRole("button", { name: "Reset Main button", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Reset Main button", exact: true })).toHaveCount(0);

  // Discard asks first; cancelling keeps the changes.
  await page.getByRole("button", { name: "Discard changes" }).click();
  await answer(page, "Cancel");
  await expect(editor.getByLabel("Badge 1")).toHaveValue("Built for growing teams");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  // The preview shows the saved choices; a draft changes nothing on the website.
  await page.goto("/admin/hero-preview/figbud/v9?theme=light");
  const hero = page.locator('[data-hero-design="dark_enterprise"]');
  await expect(hero).not.toHaveAttribute("data-theme", /.+/);
  await expect(hero).toContainText("Built for growing teams");
  await expect(hero).toHaveAttribute("style", /--ph-accent:\s*#0f766e/);
  await expect(hero.locator("a[aria-describedby]").filter({ visible: true }).first()).toContainText("ZiraHR");
  expect((await (await request.get(`${API}/v1/sites/figbud/hero`)).json()).hero).toEqual(liveBefore);

  // Reset to default, after a confirmation; then discard it.
  await page.goto("/admin/sites/figbud/hero");
  await page.locator('[data-variant="v9"]').getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Reset to default" }).click();
  await answer(page, "Reset");
  await expect(page.getByLabel("Badge 1")).toHaveValue("");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await answer(page, "Discard changes");
  await expect(page.getByRole("status").filter({ hasText: "Changes discarded" })).toBeVisible();
  await expect(page.getByLabel("Badge 1")).toHaveValue("Built for growing teams");
  expect(violations(await axe(page))).toEqual([]);

  // Reset and save: the design's defaults again (and a clean start for the next run).
  await page.getByRole("button", { name: "Reset to default" }).click();
  await answer(page, "Reset");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  await page.goto("/admin/hero-preview/figbud/v9?theme=light");
  await expect(page.locator('[data-hero-design="dark_enterprise"]')).toHaveAttribute("data-theme", "dark");
});
