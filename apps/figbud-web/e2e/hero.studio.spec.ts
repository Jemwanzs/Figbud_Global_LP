import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import { scrolledToTop, themeSettled } from "./theme-settled";

// Hero Design Studio (P12). Publishing is exercised on ZiraHR (the product
// renderer reads it), so the corporate home page other tests use stays on
// Hero 01; FigBud's designs are checked through the exact preview.

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

test("exact previews render each design's real hero, in light and dark, without touching the visitor's theme", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signInAsOwner(page);
  // Scans judge final states, as in a11y.spec.ts: entrance fades would be measured mid-way.
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Previews read the saved draft; the Studio test below may already have edited ZiraHR v2 (on a retry).
  const expected: [string, string, string][] = [
    ["figbud", "v1", "Built for complexity."],
    ["figbud", "v2", "Beyond the ordinary."],
    ["figbud", "v3", "One Vision. Endless Solutions."],
    ["zirahr", "v1", "HR Simplified."],
    ["zirahr", "v2", "Payroll"],
    ["zirahr", "v3", "Every stage of work,"],
  ];
  for (const [slug, id, headline] of expected) {
    for (const theme of ["light", "dark"] as const) {
      await page.goto(`/admin/hero-preview/${slug}/${id}?theme=${theme}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(headline);
      const results = await axe(page);
      expect(violations(results, `${slug}/${id}/${theme}: `)).toEqual([]);
    }
  }
  // The preview theme lives in the frame only.
  expect(await page.evaluate(() => localStorage.getItem("fb-theme"))).not.toBe("light");
  // Demonstrations say they're illustrative.
  await page.goto("/admin/hero-preview/zirahr/v2?theme=dark");
  await expect(page.getByText("Illustrative product activity · synthetic data")).toBeVisible();
  await page.getByRole("tab", { name: "Approve" }).click();
  await expect(page.getByRole("tabpanel", { name: "Approve" })).toContainText("Approved in sequence");
});

test("ZiraHR: edit, select, approve and publish one hero, then roll back", async ({ page, request }) => {
  test.setTimeout(120_000);
  const liveHero = async () => (await (await request.get(`${API}/v1/sites/zirahr/hero`)).json()).hero;
  // A retry runs after this test has published, so compare with what was live before.
  const before = await liveHero();
  await signInAsOwner(page);
  await page.goto("/admin/sites/zirahr");
  await page.getByRole("link", { name: "Hero Design Studio" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ZiraHR: Hero Design Studio");
  await expect(page.locator("[data-variant]")).toHaveCount(3);
  if (!before)
    await expect(page.getByText("Nothing published · the website keeps its current hero")).toBeVisible();

  // Light and dark previews switch the frames only.
  await page.getByRole("radiogroup", { name: "Preview theme" }).getByRole("radio", { name: "Light" }).click();
  await expect(page.locator('[data-variant="v1"] iframe')).toHaveAttribute("src", /theme=light/);

  // Full-screen preview with devices.
  await page.locator('[data-variant="v2"]').getByRole("button", { name: "Preview" }).click();
  const dialog = page.getByRole("dialog", { name: "Hero preview" });
  await dialog.getByRole("radio", { name: "Phone" }).click();
  await expect(dialog.locator("iframe")).toHaveAttribute("title", "Preview on Phone");
  await dialog.getByRole("button", { name: "Close preview" }).click();

  // Edit Payroll in Motion within its settings, select it, save.
  await page.locator('[data-variant="v2"]').getByRole("button", { name: "Edit" }).click();
  // A real change every run: approval is only offered when the draft differs from what's live.
  const headline =
    before?.config.headline === "Payroll, beautifully run."
      ? "Payroll, run well."
      : "Payroll, beautifully run.";
  await page.getByLabel("Headline", { exact: true }).fill(headline);
  await page.getByLabel("Main button goes to").fill("javascript:alert(1)");
  await page.locator('[data-variant="v2"]').getByRole("button", { name: "Select for publishing" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/Buttons go to a page path/).first()).toBeVisible();
  await page.getByLabel("Main button goes to").fill("#features");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  // Saving a draft changes nothing on the website.
  expect(await liveHero()).toEqual(before);

  // Approve and publish (owners may approve their own request).
  await page.getByRole("button", { name: "Ask for approval" }).click();
  await expect(page.getByText(/Approval requested by you/)).toBeVisible();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  let live = await liveHero();
  expect(live.design).toBe("payroll");
  expect(live.config.headline).toBe(headline);
  await expect(page.locator('[data-variant="v2"]').getByText("Live")).toBeVisible();

  // Publish Your Workforce, Connected; then roll back to Payroll in Motion.
  await page.locator('[data-variant="v1"]').getByRole("button", { name: "Select for publishing" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  await page.getByRole("button", { name: "Ask for approval" }).click();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  expect((await liveHero()).design).toBe("workforce");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Roll back to this" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Rolled back" })).toBeVisible();
  live = await liveHero();
  expect(live.design).toBe("payroll");

  expect(violations(await axe(page))).toEqual([]);
});
