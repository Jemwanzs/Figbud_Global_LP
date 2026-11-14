import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import { themeSettled } from "./theme-settled";
import { answer, confirmDialog } from "./confirm-dialog";

// The Studio shell (owner's briefs, 8 Nov 2026): a sidebar with one main tab
// open at a time, a top bar and sidebar that stay mounted between pages (no
// blank screen), and the Studio's warm palette, against e2e/mock-api.mjs.

test.beforeEach(({ browserName }) => {
  test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
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

const nav = (page: Page) => page.getByRole("navigation", { name: "Admin" });
const group = (page: Page, name: string) => nav(page).getByRole("button", { name, exact: true });

test.describe("wide screens", () => {
  test.skip(({ isMobile }) => isMobile, "the sidebar shows from 1024px");

  test("one main tab open at a time; the current page's tab opens by itself", async ({ page }) => {
    await signInAsOwner(page);
    await expect(nav(page).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");

    // Opening a main tab shows its sub-tabs; opening another closes the first.
    await group(page, "Websites").click();
    await expect(group(page, "Websites")).toHaveAttribute("aria-expanded", "true");
    await expect(nav(page).getByRole("link", { name: "All websites" })).toBeVisible();
    await group(page, "Content & Marketing").click();
    await expect(group(page, "Content & Marketing")).toHaveAttribute("aria-expanded", "true");
    await expect(group(page, "Websites")).toHaveAttribute("aria-expanded", "false");
    await expect(nav(page).getByRole("link", { name: "All websites" })).toBeHidden();
    // The open tab closes again when chosen twice.
    await group(page, "Content & Marketing").click();
    await expect(group(page, "Content & Marketing")).toHaveAttribute("aria-expanded", "false");
    await expect(nav(page).locator("[aria-expanded=true]")).toHaveCount(0);

    // Opening an address directly (or reloading) opens its parent and marks the page.
    await page.goto("/admin/settings/security");
    await expect(group(page, "Settings & Security")).toHaveAttribute("aria-expanded", "true");
    await expect(nav(page).getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator("main")).toHaveAttribute("data-area", "settings");
    await expect(page.getByRole("banner")).toContainText("Settings & Security");

    // Back and Forward move the highlight with them.
    await page.goto("/admin/approvals");
    await expect(nav(page).getByRole("link", { name: "Approvals" })).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(nav(page).getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page");
    await page.goForward();
    await expect(group(page, "Publishing")).toHaveAttribute("aria-expanded", "true");
    await expect(nav(page).getByRole("link", { name: "Approvals" })).toHaveAttribute("aria-current", "page");
  });

  test("moving between sections keeps the shell: no reload, no blank frame", async ({ page }) => {
    await signInAsOwner(page);
    // A marker that a full page load would wipe, the sidebar's own element, and a
    // frame-by-frame watch for any moment without the top bar, sidebar or content.
    await page.evaluate(() => {
      const w = window as unknown as { __kept: boolean; __aside: Element | null; __blank: number };
      w.__kept = true;
      w.__aside = document.querySelector("aside");
      w.__blank = 0;
      const watch = () => {
        const shell = document.querySelector("header[data-area]") && document.querySelector("aside");
        const content = document.querySelector("#studio-main")?.textContent?.trim();
        if (!shell || !content) w.__blank += 1;
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });

    const route: [string, string, string][] = [
      ["Websites", "All websites", "/admin/sites"],
      ["Websites", "ZiraHR", "/admin/sites/zirahr"],
      ["Websites", "Page builder", "/admin/sites/zirahr/pages"],
      ["Websites", "Hero management", "/admin/sites/zirahr/hero"],
      ["Pricing Studio", "ZiraHR pricing", "/admin/sites/zirahr/pricing"],
      ["Leads & Enquiries", "All enquiries", "/admin/enquiries"],
      ["Settings & Security", "Security", "/admin/settings/security"],
    ];
    for (const [tab, link, path] of route) {
      const target = nav(page).getByRole("link", { name: link, exact: true });
      if (!(await target.isVisible())) await group(page, tab).click();
      await target.click();
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
      await expect(target).toHaveAttribute("aria-current", "page");
    }
    // Back through history, quickly.
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/sites\/zirahr\/pricing$/);

    const result = await page.evaluate(() => {
      const w = window as unknown as { __kept?: boolean; __aside: Element | null; __blank: number };
      return { kept: w.__kept, sameAside: w.__aside === document.querySelector("aside"), blank: w.__blank };
    });
    expect(result).toEqual({ kept: true, sameAside: true, blank: 0 });
  });

  test("a website's tools follow the website being worked on", async ({ page }) => {
    await signInAsOwner(page);
    await page.goto("/admin/sites/zirahr");
    await expect(group(page, "Websites")).toHaveAttribute("aria-expanded", "true");
    await expect(nav(page).getByRole("link", { name: "ZiraHR", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav(page).getByRole("link", { name: "Page builder" })).toHaveAttribute(
      "href",
      "/admin/sites/zirahr/pages",
    );
    // FigBud Global's own tools aren't offered for ZiraHR.
    await expect(nav(page).getByRole("link", { name: "Section themes" })).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: /Selected website/ })).toContainText(
      "ZiraHR",
    );
    // Brand and media links work on the same website, even from another section.
    await page.goto("/admin/approvals");
    await group(page, "Products & Branding").click();
    await expect(nav(page).getByRole("link", { name: "Logos & brand colours" })).toHaveAttribute(
      "href",
      "/admin/sites/zirahr/brand",
    );
  });

  test("the sidebar can be made compact, and stays that way", async ({ page }) => {
    await signInAsOwner(page);
    const aside = page.locator("aside");
    await page.getByRole("button", { name: "Compact sidebar" }).click();
    await expect.poll(async () => (await aside.boundingBox())?.width ?? Infinity).toBeLessThanOrEqual(80);
    await page.reload();
    await expect.poll(async () => (await aside.boundingBox())?.width ?? Infinity).toBeLessThanOrEqual(80);
    // Icons keep their names; choosing a main tab widens the sidebar and opens it.
    await group(page, "Leads & Enquiries").click();
    await expect.poll(async () => (await aside.boundingBox())?.width ?? 0).toBeGreaterThan(200);
    await expect(nav(page).getByRole("link", { name: "Demo requests" })).toBeVisible();
    await nav(page).getByRole("link", { name: "Demo requests" }).click();
    await expect(page).toHaveURL(/\/admin\/enquiries\?kind=demo_request$/);
    await expect(nav(page).getByRole("link", { name: "Demo requests" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav(page).getByRole("link", { name: "All enquiries" })).not.toHaveAttribute("aria-current");
  });

  test("leaving a page with unsaved changes asks first", async ({ page }) => {
    await signInAsOwner(page);
    await page.goto("/admin/sites/figbud/section-themes");
    // A choice different from what's saved (other tests publish these too), so the page has changes.
    const choice = page.getByLabel(/^Our philosophy/);
    const next = (await choice.inputValue()) === "inverse" ? "follow" : "inverse";
    await expect(async () => {
      await choice.selectOption(next);
      await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled({ timeout: 1_000 });
    }).toPass();
    await group(page, "Publishing").click();
    const approvals = nav(page).getByRole("link", { name: "Approvals" });

    // An in-app dialog (not the browser's): Stay keeps the page and its changes.
    await approvals.click();
    const ask = confirmDialog(page);
    await expect(ask.getByRole("heading", { name: "Leave this page?" })).toBeVisible();
    await expect(ask).toContainText("Your unsaved changes will be lost.");
    await answer(page, "Stay");
    await expect(page).toHaveURL(/\/section-themes$/);
    await expect(choice).toHaveValue(next);

    // From the keyboard too: Escape cancels, and focus goes back to the link.
    await approvals.focus();
    await page.keyboard.press("Enter");
    await expect(ask).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(ask).toHaveCount(0);
    await expect(page).toHaveURL(/\/section-themes$/);
    await expect(approvals).toBeFocused();

    await approvals.click();
    await answer(page, "Leave page");
    await expect(page).toHaveURL(/\/admin\/approvals$/);
  });

  test("a missing page shows inside the shell", async ({ page }) => {
    await signInAsOwner(page);
    await page.goto("/admin/sites/no-such-site");
    await expect(page.getByRole("heading", { level: 1, name: "Not found" })).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(nav(page)).toBeVisible();
  });
});

test("narrow screens: the sidebar opens as a drawer and closes after choosing", async ({ page }) => {
  await signInAsOwner(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "Studio menu" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Websites", exact: true }).click();
  await drawer.getByRole("link", { name: "All websites" }).click();
  await expect(page).toHaveURL(/\/admin\/sites$/);
  await expect(drawer).toBeHidden();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  // Escape closes it too, and focus returns to the menu button.
  await menu.click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();
  // Nothing wider than the screen (the list names anything that is).
  expect(
    await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      return [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > width + 0.5 && !el.closest("dialog:not([open])"))
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`)
        .slice(0, 5);
    }),
  ).toEqual([]);
  // Landscape too.
  await page.setViewportSize({ width: 844, height: 390 });
  await menu.click();
  await expect(drawer.getByRole("link", { name: "Overview" })).toBeInViewport();
  await page.keyboard.press("Escape");
});

test("the Studio's warm palette in both themes", async ({ page }) => {
  await signInAsOwner(page);
  // The shell's own background (Next keeps the previous page hidden beside it).
  const bg = () =>
    page.evaluate(
      () => getComputedStyle(document.querySelector("header[data-area]")!.parentElement!).backgroundColor,
    );
  const scan = async () =>
    (
      await new AxeBuilder({ page: await themeSettled(page) })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

  await page.goto("/admin/sites/figbud/section-themes");
  expect(await bg()).toBe("rgb(12, 8, 6)");
  expect(await scan()).toEqual([]);
  await page.getByRole("banner").getByRole("button", { name: /Olu/ }).click();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.keyboard.press("Escape");
  await themeSettled(page);
  expect(await bg()).toBe("rgb(248, 241, 232)");
  expect(await scan()).toEqual([]);
});
