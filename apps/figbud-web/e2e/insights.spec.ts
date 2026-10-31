import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import { studioLink } from "./studio-nav";

// Editorial UI against e2e/mock-api.mjs (signed in as an owner via a passkey invite).

// Long journeys (passkey sign-in plus many steps) get more than the default budget.
test.describe.configure({ timeout: 60_000 });

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
  await page.getByLabel("Your name").filter({ visible: true }).fill("Olu Owner");
  await page.getByRole("button", { name: "Create passkey and sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Olu");
}

test("write a draft, see field errors, save, submit, publish, archive and restore", async ({ page }) => {
  await signInAsOwner(page);
  await studioLink(page, "Insights");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Insights");
  await page.getByRole("link", { name: "New article" }).click();

  // Create stays disabled, and says why, until the required fields are filled.
  const create = page.getByRole("button", { name: "Create draft" });
  await expect(create).toBeDisabled();
  await expect(page.getByText("Add a title, summary and article text")).toBeVisible();

  const title = `Payroll rules ${randomBytes(3).toString("hex")}`;
  await page.getByLabel("Title", { exact: true }).filter({ visible: true }).fill(title);
  await expect(page.getByLabel("Address", { exact: true }).filter({ visible: true })).toHaveValue(
    title.toLowerCase().replace(/ /g, "-"),
  );
  await page
    .getByLabel("Summary")
    .filter({ visible: true })
    .fill("Why rules carry the dates they apply from.");
  await page
    .getByLabel("Article", { exact: true })
    .filter({ visible: true })
    .fill("## Why\n\nRates change mid-year.");
  await page.getByLabel("Topic").filter({ visible: true }).selectOption("payroll");
  await page.getByLabel("Tags").filter({ visible: true }).fill("Payroll, Compliance");

  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.locator(".fb-prose")).toContainText("Rates change mid-year.");
  await page.getByRole("tab", { name: "Write" }).click();

  // Server validation errors appear next to their fields.
  const address = page.getByLabel("Address", { exact: true }).filter({ visible: true });
  await address.fill("Not valid!");
  await create.click();
  await expect(page.getByText("Use lowercase letters, numbers and hyphens.")).toBeVisible();
  await expect(address).toHaveAttribute("aria-invalid", "true");
  await address.fill(title.toLowerCase().replace(/ /g, "-"));

  await create.click();
  await expect(page).toHaveURL(/\/admin\/insights\/[0-9a-f-]{36}$/);
  // Next.js keeps the previous route mounted but hidden (React Activity) for instant back navigation.
  await expect(page.locator("textarea[id$='-excerpt']:visible")).toHaveCount(1);
  const workflow = page.getByRole("complementary", { name: "Workflow" });
  await expect(workflow).toContainText("Draft");

  await page
    .getByLabel("Summary")
    .filter({ visible: true })
    .fill("Statutory rates change; payroll must not drift.");
  await expect(workflow).toContainText("Save your changes before changing the status.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await expect(workflow).toContainText("Version2");

  await workflow.getByRole("button", { name: "Submit for review" }).click();
  await expect(workflow).toContainText("In review");
  await workflow.getByRole("button", { name: "Publish now" }).click();
  await expect(workflow).toContainText("Published");
  await expect(workflow).toContainText("Approved by");

  await workflow.getByRole("button", { name: "Archive" }).click();
  await expect(workflow).toContainText("Archived");
  await workflow.getByRole("button", { name: "Restore as draft" }).click();
  await expect(workflow).toContainText("Draft");

  await page.getByRole("link", { name: "Back to Insights" }).click();
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Filter by status" })
    .getByRole("link", { name: "Published" })
    .click();
  await expect(page).toHaveURL(/status=published/);
});

test("a stale save is refused with a way to reload", async ({ page, context }) => {
  await signInAsOwner(page);
  await page.goto("/admin/insights/new");
  await page
    .getByLabel("Title", { exact: true })
    .filter({ visible: true })
    .fill(`Conflict ${randomBytes(3).toString("hex")}`);
  await page.getByLabel("Summary").filter({ visible: true }).fill("Two tabs, one article.");
  await page.getByLabel("Article", { exact: true }).filter({ visible: true }).fill("First version.");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/insights\/[0-9a-f-]{36}$/);

  // A second tab saves first.
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByLabel("Summary").filter({ visible: true }).fill("Saved in the other tab.");
  await other.getByRole("button", { name: "Save changes" }).click();
  await expect(other.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  await page.getByLabel("Summary").filter({ visible: true }).fill("Saved in the first tab.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.locator('[role="alert"]').filter({ hasText: "Someone saved this article" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
});
