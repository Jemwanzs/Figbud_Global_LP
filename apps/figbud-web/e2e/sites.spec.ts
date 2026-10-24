import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// Website registry (Admin Studio, Phase B) against e2e/mock-api.mjs, signed in as an owner.

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
  await page.getByLabel("Your name").fill("Olu Owner");
  await page.getByRole("button", { name: "Create passkey and sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Olu");
}

const status = (page: Page, text: string) =>
  expect(page.getByRole("status").filter({ hasText: text })).toBeVisible();

test("create a product website, launch it with approval and manage its settings", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Websites" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Websites & products");
  const card = (name: string | RegExp) => page.getByRole("article", { name });
  await expect(card("FigBud Global")).toContainText("Corporate website");
  await expect(card("Expense Now")).toContainText("Coming soon");

  // Guided creation: the identifier follows the name, the template follows the category.
  const run = randomBytes(3).toString("hex");
  await page.getByRole("link", { name: "New website" }).click();
  // Create stays disabled, and says why, until the required fields are filled.
  await expect(page.getByRole("button", { name: "Create draft website" })).toBeDisabled();
  await expect(page.getByText("Enter a name and a valid identifier")).toBeVisible();
  await page.getByLabel("Website name").fill(`PayFlow ${run}`);
  await expect(page.getByLabel("Identifier")).toHaveValue(`payflow_${run}`);
  await page.getByRole("radio", { name: "Lending & Credit" }).click();
  await expect(page.getByLabel("Starting template")).toHaveValue("lending");
  await expect(page.getByRole("list", { name: "Suggested pages" })).toContainText("Collections");
  await page.getByRole("radio", { name: /Coming soon/ }).click();
  await page.getByLabel("Domain").fill("https://bad");
  await page.getByRole("button", { name: "Create draft website" }).click();
  await expect(page.getByText("Enter a host name such as product.example.com.")).toBeVisible();
  await page.getByLabel("Domain").fill(`payflow-${run}.example.com`);
  await page.getByRole("button", { name: "Create draft website" }).click();

  // Created as a draft; the launch status waits for approval.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`PayFlow ${run}`);
  const lifecycle = page.getByRole("complementary", { name: "Marketing status" });
  await expect(lifecycle.getByRole("listitem").and(page.locator("[aria-current=step]"))).toHaveText("Draft");
  await expect(lifecycle).toContainText("Draft → Coming soon");
  await lifecycle.getByRole("button", { name: "Approve my request" }).click();
  await status(page, "Status change approved.");
  await expect(lifecycle.locator("[aria-current=step]")).toHaveText("Coming soon");
  await expect(lifecycle).toContainText("Draft → Coming soon · Approved");

  // A new request can be withdrawn before anyone decides.
  await lifecycle.getByLabel("Change status to").selectOption("beta");
  await lifecycle.getByLabel("Reason").fill("Pilot customers are ready.");
  await lifecycle.getByRole("button", { name: "Request change" }).click();
  await status(page, "Request sent for approval.");
  await expect(lifecycle).toContainText("Coming soon → Beta / early access");
  await lifecycle.getByRole("button", { name: "Cancel request" }).click();
  await status(page, "Request cancelled.");
  await expect(lifecycle).toContainText("Coming soon → Beta / early access · Cancelled");

  // Settings save with the current version.
  const settings = page.getByRole("region", { name: "Settings" });
  const save = settings.getByRole("button", { name: "Save settings" });
  // Save is enabled only while something differs from what is saved.
  await expect(save).toBeDisabled();
  await expect(settings.getByText("Nothing to save")).toBeVisible();
  await settings.getByLabel("Tagline").fill("Temporary");
  await expect(save).toBeEnabled();
  await settings.getByLabel("Tagline").fill("");
  await expect(save).toBeDisabled();
  await settings.getByLabel("Tagline").fill("Lending, simplified.");
  await save.click();
  await status(page, "Settings saved.");
  await expect(save).toBeDisabled();
  await settings.getByLabel("Tagline").fill("Lending, simplified twice.");
  await settings.getByRole("button", { name: "Save settings" }).click();
  await status(page, "Settings saved.");

  // Archive hides it until restored.
  page.once("dialog", (dialog) => dialog.accept());
  await lifecycle.getByRole("button", { name: "Archive website" }).click();
  await status(page, "Website archived.");
  await expect(lifecycle).toContainText("Restore this website to change its status.");
  await lifecycle.getByRole("button", { name: "Restore website" }).click();
  await status(page, "Website restored.");

  await page.goto("/admin/sites");
  await expect(page.getByRole("article", { name: `PayFlow ${run}` })).toContainText(
    "Lending, simplified twice.",
  );
});

test("the corporate website is always active and cannot be archived", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/admin/sites/figbud");
  const lifecycle = page.getByRole("complementary", { name: "Marketing status" });
  await expect(lifecycle).toContainText("The FigBud Global website is always active.");
  await expect(lifecycle.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Lending & Credit" })).toHaveCount(0);
  await page.goto("/admin/sites/not_a_site");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
});

test("website pages are accessible", async ({ page }) => {
  await signInAsOwner(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/admin/sites", "/admin/sites/new", "/admin/sites/expense_now"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    expect(results.violations.map((v) => `${path}: ${v.id}`)).toEqual([]);
  }
});
