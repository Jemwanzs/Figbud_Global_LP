import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// Brand profiles and logo management against e2e/mock-api.mjs, which seeds the
// same official and proposed files as the real API.

test.describe.configure({ timeout: 60_000 });

const logoSvg = (fill: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40" width="160" height="40"><rect width="160" height="40" rx="10" fill="${fill}"/></svg>`,
  );

test.describe("public websites", () => {
  test("the header shows the official FigBud logo, on a plate in the light theme", async ({ page }) => {
    await page.goto("/en");
    const header = page.getByRole("banner");
    const logo = header.getByRole("img", { name: "FigBud Global" }).filter({ visible: true }).first();
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("src", /^\/brand\/assets\/[0-9a-f-]{36}/);
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    // Proportions come from the file: 306 × 64 shown at 28 px high.
    expect(await logo.getAttribute("width")).toBe(String(Math.round((28 * 306) / 64)));

    await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
    const plate = header.locator(".fb-brand-solo").filter({ visible: true }).first();
    await expect(plate).toHaveCSS("background-color", "rgb(21, 18, 15)");
  });

  test("product cards use the published logos and symbols", async ({ page }) => {
    await page.goto("/en/products");
    const jasiri = page.locator("#jasiri");
    await expect(
      jasiri.getByRole("heading", { level: 2 }).getByRole("img", { name: "Jasiri LMS" }).first(),
    ).toBeVisible();
    const zirahr = page.locator("#zirahr");
    await expect(zirahr.getByRole("heading", { level: 2 })).toHaveText("ZiraHR");
    await expect(zirahr.locator('img[src^="/brand/assets/"]').first()).toBeVisible();
    // The Expense Now concept is not approved, so it keeps its built-in icon.
    await expect(page.locator('#expense_now img[src^="/brand/assets/"]')).toHaveCount(0);
  });

  test("logo files are served from the website's own origin, published files only", async ({
    request,
    page,
  }) => {
    await page.goto("/en");
    const src = await page
      .getByRole("banner")
      .getByRole("img", { name: "FigBud Global" })
      .first()
      .getAttribute("src");
    const ok = await request.get(src!);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toBe("image/png");
    expect(ok.headers()["content-security-policy"]).toContain("sandbox");
    expect((await request.get("/brand/assets/00000000-0000-7000-8000-000000000000")).status()).toBe(404);
    expect((await request.get("/brand/assets/not-a-uuid")).status()).toBe(404);
  });
});

test.describe("admin branding", () => {
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

  async function newSite(page: Page) {
    const run = randomBytes(3).toString("hex");
    await page.goto("/admin/sites/new");
    await page.getByLabel("Website name").fill(`Brandly ${run}`);
    await page.getByRole("button", { name: "Create draft website" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Brandly ${run}`);
    return run;
  }

  async function upload(page: Page, name: string, fill: string) {
    const library = page.getByRole("region", { name: "Brand files" });
    await library
      .locator('input[type="file"]')
      .setInputFiles({ name: `${name}.svg`, mimeType: "image/svg+xml", buffer: logoSvg(fill) });
    await expect(library.getByRole("img", { name: "Preview of the chosen file" })).toBeVisible();
    await expect(library.getByText(new RegExp(`${name}\.svg · .* · 160 × 40 px`))).toBeVisible();
    await library.getByLabel("Alternative text").fill("Brandly");
    await library.getByRole("button", { name: "Upload to library" }).click();
    await expect(page.getByRole("status").filter({ hasText: "File added to the library" })).toBeVisible();
  }

  const saved = (page: Page) =>
    expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible({ timeout: 10_000 });

  test("upload, preview, publish with approval, replace and roll back", async ({ page }) => {
    await signInAsOwner(page);
    const run = await newSite(page);
    await page.getByRole("link", { name: "Branding" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Brandly ${run} branding`);
    const publishing = page.getByRole("region", { name: "Publishing" });
    await expect(publishing.getByRole("list", { name: "Brand checks" })).toContainText(
      "A horizontal or symbol logo for dark backgrounds (the default theme) (required)",
    );

    // Unsupported files are refused before upload.
    const library = page.getByRole("region", { name: "Brand files" });
    await library
      .locator('input[type="file"]')
      .setInputFiles({ name: "logo.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
    await expect(library.getByText("Choose an SVG, PNG or WebP file.")).toBeVisible();

    await upload(page, "brandly-first", "#22d3ee");
    await page.getByLabel("Horizontal logo: dark backgrounds").selectOption({ label: "brandly first" });
    await saved(page);
    const preview = page.getByRole("figure").filter({ hasText: "Dark theme (default)" });
    await expect(preview.getByRole("img", { name: `Brandly ${run}` })).toBeVisible();
    await expect(publishing).toContainText(
      "A horizontal or symbol logo for dark backgrounds (the default theme)",
    );

    // Undo and redo the choice; autosave follows.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByLabel("Horizontal logo: dark backgrounds")).toHaveValue("");
    await page.getByRole("button", { name: "Redo" }).click();
    await saved(page);

    await publishing.getByLabel("What changed?").fill("First logo");
    await publishing.getByRole("button", { name: "Submit for publishing" }).click();
    await expect(publishing).toContainText("Version 1 is awaiting approval");
    await publishing.getByRole("button", { name: "Publish my change" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Brand published" })).toBeVisible();
    const history = page.getByRole("region", { name: "Version history" });
    await expect(history).toContainText("Version 1 · Published");

    // Replace: a new file, published as version 2; version 1 can be restored.
    await upload(page, "brandly-second", "#f97316");
    await page.getByLabel("Horizontal logo: dark backgrounds").selectOption({ label: "brandly second" });
    await saved(page);
    const files = page.getByRole("list", { name: "Brand files" });
    await expect(files.getByRole("listitem").filter({ hasText: "brandly first" })).toContainText(
      "Live: Horizontal (dark backgrounds)",
    );
    await publishing.getByLabel("What changed?").fill("Second logo");
    await publishing.getByRole("button", { name: "Submit for publishing" }).click();
    await publishing.getByRole("button", { name: "Publish my change" }).click();
    await expect(history).toContainText("Version 2 · Published");

    await history.getByRole("button", { name: "Restore to draft (version 1)" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Version 1 copied into the draft" }),
    ).toBeVisible();
    await expect(page.getByLabel("Horizontal logo: dark backgrounds")).toHaveValue(/.+/);
    await expect(page.getByText("Restored from version 1")).toBeVisible();

    // Files in use can't be archived; the unused one can.
    await expect(
      files
        .getByRole("listitem")
        .filter({ hasText: "brandly first" })
        .getByRole("button", { name: /Archive/ }),
    ).toBeDisabled();
  });

  test("seeded profiles: the Expense Now concept waits for approval", async ({ page }) => {
    await signInAsOwner(page);
    await page.goto("/admin/sites/expense_now/brand");
    await expect(page.getByText("Proposed Expense Now logo concept: not approved.")).toBeVisible();
    const files = page.getByRole("list", { name: "Brand files" });
    await expect(
      files.getByRole("listitem").filter({ hasText: "Expense Now logo concept (dark backgrounds)" }),
    ).toContainText("Proposed");
    await expect(page.getByRole("region", { name: "Version history" })).toContainText(
      "Nothing published yet.",
    );

    await page.goto("/admin/sites/zirahr/brand");
    await expect(files.getByRole("listitem").filter({ hasText: "incomplete" })).toContainText("Official");
  });

  test("branding page is accessible", async ({ page }) => {
    await signInAsOwner(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/admin/sites/figbud/brand");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("FigBud Global branding");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
  });
});
