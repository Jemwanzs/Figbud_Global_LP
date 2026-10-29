import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import path from "node:path";

import { type Page, expect, test } from "@playwright/test";

// Media library (P7-D2) against e2e/mock-api.mjs: Ziwa LMS has a seeded
// image on its published Platform page.

test.describe.configure({ timeout: 60_000 });

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
  // Shared mock data: change it from one project only.
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
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

test("upload with alt text, use it on a page, and see where it's used", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/admin/sites/ziwa");
  await page.getByRole("link", { name: "Media", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Media");

  // The seeded image is in use, so it can't be archived.
  const seeded = page.getByRole("listitem", { name: "Ziwa team" });
  await expect(seeded).toContainText("Platform (published)");
  await expect(seeded.getByRole("button", { name: "Archive Ziwa team" })).toBeDisabled();

  // Alt text is required before uploading.
  const form = page.getByRole("region", { name: "Upload an image" });
  await form.getByLabel("File").setInputFiles(path.join(process.cwd(), "public", "icon.png"));
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue("icon");
  const uploadButton = page.getByRole("button", { name: "Upload image" });
  await expect(uploadButton).toBeDisabled();
  await form.getByLabel("Name", { exact: true }).fill("Branch opening");
  await form.getByLabel("Alt text", { exact: true }).fill("Customers at a branch opening in Kisumu");
  await uploadButton.click();
  await expect(page.getByRole("status").filter({ hasText: "Uploaded" })).toBeVisible();
  const card = page.getByRole("listitem", { name: "Branch opening" });
  await expect(card).toContainText("Not used on any page");

  // Alt text stays editable.
  await card.getByRole("button", { name: "Edit Branch opening" }).click();
  await card.getByLabel("Alt text").fill("Customers celebrating a branch opening in Kisumu");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card).toContainText("Customers celebrating a branch opening in Kisumu");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // Use it on the Platform page: the preview shows it with the library's alt text.
  await page.goto("/admin/sites/ziwa/pages");
  await page.locator(`a[href^="/admin/sites/ziwa/pages/"]`, { hasText: "Platform" }).first().click();
  const sections = page.getByRole("list", { name: "Sections" });
  await sections.getByRole("button", { name: /^Image/ }).click();
  const picker = page.getByRole("radiogroup", { name: "Image", exact: true });
  await expect(picker.getByRole("radio", { name: "Ziwa team" })).toHaveAttribute("aria-checked", "true");
  await picker.getByRole("radio", { name: "Branch opening" }).click();
  const preview = page.getByRole("region", { name: "Live preview" });
  await expect(
    preview.getByRole("img", { name: "Customers celebrating a branch opening in Kisumu" }),
  ).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible({ timeout: 10_000 });

  // Back in the library, the draft use is shown and archiving is blocked.
  await page.goto("/admin/sites/ziwa/media");
  await expect(page.getByRole("listitem", { name: "Branch opening" })).toContainText("Platform (draft)");
  await expect(
    page
      .getByRole("listitem", { name: "Branch opening" })
      .getByRole("button", { name: "Archive Branch opening" }),
  ).toBeDisabled();
});
