import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import { themeSettled } from "./theme-settled";

// Scroll-driven Our Platforms (UI-MO5). Desktop screens that fit the whole
// showcase pin it while scrolling moves through the products; phones,
// reduced motion and short screens keep the carousel.

const API = "http://localhost:3199";
const showcase = (page: Page) => page.locator(".fb-showcase");
/** The showcase chooses its mode once its section hydrates, which can take a while on a busy machine. */
const HYDRATED = { timeout: 20_000 };
const selected = (page: Page) => page.locator('[role="tab"][aria-selected="true"]');
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** The scroll position at which product `i` (0-based) is in place, from the runway's own geometry. */
async function stop(page: Page, i: number) {
  return page.evaluate((i) => {
    const root = document.querySelector<HTMLElement>(".fb-showcase")!;
    const runway = root.querySelector<HTMLElement>(".fb-showcase-runway")!;
    const products = root.querySelectorAll('[role="tab"]').length;
    const top = parseFloat(getComputedStyle(root).getPropertyValue("--pin-top")) || 88;
    const start = window.scrollY + root.getBoundingClientRect().top - top;
    return Math.round(start + (i * runway.offsetHeight) / (products - 1));
  }, i);
}

test.describe("desktop: scrolling moves through the products", () => {
  test.beforeEach(({ isMobile }, testInfo) => {
    test.skip(isMobile || testInfo.project.name === "iphone", "desktop composition");
    test.setTimeout(90_000);
  });

  test("pins, follows the scroll both ways, then lets the page carry on", async ({ page }) => {
    await page.goto("/en");
    await expect(showcase(page)).toHaveAttribute("data-mode", "pinned", HYDRATED);
    const tabs = page.getByRole("tab");
    const names = await tabs.allTextContents();
    expect(names.length).toBeGreaterThan(2);

    // Each stop shows its product, with tab, position and the next-product control in step.
    for (let i = 0; i < names.length; i++) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), await stop(page, i));
      await expect(selected(page)).toHaveAttribute("id", (await tabs.nth(i).getAttribute("id"))!);
      await expect(page.getByText(`${i + 1} of ${names.length}`)).toBeVisible();
      // The stage stays in view while pinned.
      const box = (await page.getByRole("tablist").boundingBox())!;
      expect(box.y).toBeGreaterThan(60);
      expect(box.y).toBeLessThan(400);
      await expect(page.locator('[role="tabpanel"]:not([inert])')).toHaveCount(1);
    }

    // Past the last product, the page scrolls on to the next section.
    await page.mouse.move(700, 450);
    for (let n = 0; n < 3; n++) await page.mouse.wheel(0, 1600);
    await expect
      .poll(() => page.evaluate(() => document.querySelector(".fb-showcase")!.getBoundingClientRect().bottom))
      .toBeLessThan(450);

    // Reverse: scrolling back up retraces the products to the first.
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), await stop(page, 1));
    await expect(selected(page)).toHaveAttribute("id", (await tabs.nth(1).getAttribute("id"))!);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), await stop(page, 0));
    await expect(selected(page)).toHaveAttribute("id", (await tabs.nth(0).getAttribute("id"))!);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("tabs, arrows and the keyboard scroll to their product, and back and forward restore it", async ({
    page,
  }) => {
    await page.goto("/en#platforms");
    await expect(showcase(page)).toHaveAttribute("data-mode", "pinned", HYDRATED);
    const third = page.getByRole("tab").nth(2);
    await third.click();
    await expect(third).toHaveAttribute("aria-selected", "true");
    // The page scrolled to that product's stop: scroll position and product agree.
    await expect
      .poll(async () => {
        const y = await page.evaluate(() => window.scrollY);
        const [here, next] = [await stop(page, 2), await stop(page, 3)];
        return Math.abs(y - here) / (next - here);
      })
      .toBeLessThan(0.15);

    await page.getByRole("button", { name: "Previous product" }).click();
    await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab").nth(1).focus();
    await page.keyboard.press("ArrowRight");
    await expect(third).toHaveAttribute("aria-selected", "true");
    await expect(third).toBeFocused();

    // Away and back: whatever scroll position comes back, the product shown is the one for it.
    await page.goto("/en/privacy");
    await page.goBack();
    await expect(showcase(page)).toHaveAttribute("data-mode", "pinned", HYDRATED);
    await expect
      .poll(async () => {
        const stops = await Promise.all([0, 1, 2, 3].map((i) => stop(page, i)));
        const y = await page.evaluate(() => window.scrollY);
        const nearest = stops.reduce(
          (best, s, i) => (Math.abs(s - y) < Math.abs(stops[best]! - y) ? i : best),
          0,
        );
        const ids = await page
          .getByRole("tab")
          .evaluateAll((tabs) => tabs.map((t) => t.getAttribute("aria-selected")));
        return ids.indexOf("true") === Math.min(nearest, 3);
      })
      .toBe(true);
  });

  test("short screens and reduced motion keep the carousel, with nothing pinned", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto("/en#platforms");
    await expect(showcase(page)).toHaveAttribute("data-mode", "carousel", HYDRATED);
    await expect(page.locator(".fb-showcase-runway")).toBeHidden();
    await page.getByRole("button", { name: /^Next: / }).click();
    await expect(page.getByText(/2 of \d/)).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en#platforms");
    await expect(showcase(page)).toHaveAttribute("data-mode", "carousel", HYDRATED);
    await expect(page.locator(".fb-showcase-runway")).toBeHidden();
    await expect(page.locator(".fb-showcase-stage")).toHaveCSS("position", "static");
  });
});

test("phones get the swipeable carousel and natural page scrolling", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone composition");
  await page.goto("/en#platforms");
  await expect(showcase(page)).toHaveAttribute("data-mode", "carousel", HYDRATED);
  await expect(page.locator(".fb-showcase-runway")).toBeHidden();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("the server HTML has every product and the runway for screens that can pin", async ({ request }) => {
  const html = await (await request.get("/en")).text();
  expect(html).toContain('class="fb-showcase"');
  expect(html).toContain("data-pin");
  expect(html).toContain("fb-showcase-runway");
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

test("Studio: Our Platforms controls, saved with the website's settings", async ({
  page,
  request,
}, testInfo) => {
  // Shared mock data: edit it from one project only, and only in ways other tests don't see.
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  test.setTimeout(90_000);
  await signInAsOwner(page);
  await page.goto("/admin/sites/figbud");
  await page.getByRole("link", { name: "Our Platforms" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Our Platforms");
  const scroll = page.getByRole("switch", { name: "Scroll-driven animation" });
  await expect(scroll).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Sticky showcase" })).toBeEnabled();

  // Turning scroll-driven motion off disables its own options (not saved: other tests use it).
  await scroll.click();
  await expect(page.getByRole("switch", { name: "Sticky showcase" })).toBeDisabled();
  await expect(page.getByRole("radio", { name: /Bold/ })).toBeDisabled();
  await scroll.click();

  // Product order: every public product, movable.
  const rows = page.locator("[data-order]");
  await expect(rows).toHaveCount(4);
  const first = await rows.first().getAttribute("data-order");
  await page
    .getByRole("button", { name: /^Move down: / })
    .first()
    .click();
  await expect(rows.nth(1)).toHaveAttribute("data-order", first!);
  await page
    .getByRole("button", { name: /^Move up: / })
    .nth(1)
    .click();
  await expect(rows.first()).toHaveAttribute("data-order", first!);

  // Rotation moved here, still never faster than 6 seconds.
  await page.getByRole("switch", { name: "Rotate products slowly" }).click();
  await page.getByLabel("Seconds on each product").fill("3");
  await page.getByRole("button", { name: "Save Our Platforms" }).click();
  await expect(page.getByText("Between 6 and 20 seconds, so visitors have time to read.")).toBeVisible();
  // Turning it off again clears the hidden invalid value, so it can't block the next save.
  await page.getByRole("switch", { name: "Rotate products slowly" }).click();

  // A change nobody else depends on: the intensity, saved and put back.
  await page.getByRole("radio", { name: /Subtle/ }).check();
  await page.getByRole("button", { name: "Save Our Platforms" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  const listed = async () =>
    (
      (await (await request.get(`${API}/v1/sites`)).json()) as {
        slug: string;
        settings: { showcase: { intensity: string } };
      }[]
    ).find((s) => s.slug === "figbud")!.settings.showcase;
  expect((await listed()).intensity).toBe("subtle");
  // Saving Navigation & forms keeps Our Platforms as it is.
  await page.goto("/admin/sites/figbud/website");
  // Different text on each attempt (a retry finds the last attempt's save), repeated until the
  // form is ready to notice it.
  const band = page.getByLabel("Soft band (light mode)", { exact: true });
  const colour = `#fdf9f${testInfo.retry}`;
  const save = page.getByRole("button", { name: "Save settings" });
  await expect(async () => {
    await band.fill("");
    await band.fill(colour);
    await expect(save).toBeEnabled({ timeout: 1_000 });
  }).toPass();
  await save.click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  expect((await listed()).intensity).toBe("subtle");
  await band.fill("");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  await page.goto("/admin/sites/figbud/platforms");
  await page.getByRole("radio", { name: /Standard/ }).check();
  await page.getByRole("button", { name: "Save Our Platforms" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  expect((await listed()).intensity).toBe("standard");

  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);

  // Product websites don't have this page (not found, without its controls).
  await page.goto("/admin/sites/zirahr/platforms");
  await expect(page.getByRole("heading", { name: "Our Platforms" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Scroll-driven animation" })).toHaveCount(0);
});
