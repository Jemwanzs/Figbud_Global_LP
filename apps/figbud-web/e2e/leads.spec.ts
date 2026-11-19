import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import { studioLink } from "./studio-nav";
import { scrolledToTop, themeSettled } from "./theme-settled";

// Start Now, demo booking and Leads & Enquiries (owner's brief, 18 Nov 2026,
// P8-M8), against e2e/mock-api.mjs with synthetic data. The mock's state is
// shared by parallel projects, so the Studio steps tolerate one another.

test.describe.configure({ timeout: 90_000 });

const axe = async (page: Page) =>
  (
    await new AxeBuilder({ page: await themeSettled(await scrolledToTop(page)) })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze()
  ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

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

/** Three days of synthetic slots, as the API sends them. */
const SLOTS = {
  enabled: true,
  time_zone: "Africa/Nairobi",
  slot_minutes: 30,
  note: "Demos are online; we'll send the meeting details when we confirm.",
  days: [
    { date: "2099-11-25", slots: ["2099-11-25T06:00:00Z", "2099-11-25T06:45:00Z"] },
    { date: "2099-11-26", slots: ["2099-11-26T07:00:00Z", "2099-11-26T11:00:00Z"] },
  ],
};

test.describe("on the website", () => {
  test("Start Now opens a workspace request in place and sends it as one", async ({ page }) => {
    const sent: Record<string, unknown>[] = [];
    await page.route("**/v1/enquiries", async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({ status: 201, json: { reference: "FBG-START-0001", status: "received" } });
    });
    await page.goto("/en#start-now");
    const dialog = page.getByRole("dialog", { name: "Start with FigBud Global" });
    await expect(dialog).toBeVisible();
    // Nothing filled in: it says what's needed, and sends nothing.
    await dialog.getByRole("button", { name: "Request my workspace" }).click();
    await expect(dialog.getByText("This field is required.").first()).toBeVisible();
    expect(sent).toHaveLength(0);
    expect(await axe(page)).toEqual([]);

    await dialog.getByLabel("Full name").fill("Amina Wanjiru");
    await dialog.getByLabel("Work email").fill("amina@example.co.ke");
    await dialog.getByLabel("Organisation").fill("Mfano Ltd");
    await dialog.getByText("51-200", { exact: true }).click();
    await dialog.getByLabel("Anything we should know?").fill("Payroll and leave for three branches.");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Request my workspace" }).click();
    await expect(dialog.getByText("Request received")).toBeVisible();
    await expect(dialog.locator("[data-reference]")).toHaveText("FBG-START-0001");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      kind: "workspace_request",
      product: "figbud",
      company: "Mfano Ltd",
      company_size: "51-200",
      consent: true,
    });
    expect(sent[0]).not.toHaveProperty("demo_slot");
    // Closing returns to the page and clears the address.
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await expect(dialog).toBeHidden();
    expect(new URL(page.url()).hash).toBe("");
  });

  test("demo booking offers free times, and a time taken meanwhile sends the visitor back to choose", async ({
    page,
  }) => {
    let taken = true;
    const sent: Record<string, unknown>[] = [];
    await page.route("**/v1/sites/figbud/demo-slots", (route) => route.fulfill({ json: SLOTS }));
    await page.route("**/v1/enquiries", async (route) => {
      sent.push(route.request().postDataJSON());
      if (taken) {
        taken = false;
        await route.fulfill({
          status: 409,
          json: {
            error: { code: "slot_taken", message: "That time was just taken. Please choose another." },
          },
        });
        return;
      }
      await route.fulfill({ status: 201, json: { reference: "FBG-DEMO-0001", status: "received" } });
    });
    await page.goto("/en#book-demo");
    const dialog = page.getByRole("dialog", { name: "Book a FigBud Global demo" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Times in Africa/Nairobi.")).toBeVisible();
    await expect(dialog.getByText(SLOTS.note)).toBeVisible();
    const next = dialog.getByRole("button", { name: "Continue" });
    await expect(next).toBeDisabled();
    // The first day is chosen; its times are in Nairobi time (UTC+3).
    await expect(dialog.locator("[data-days] button").first()).toHaveAttribute("aria-pressed", "true");
    await dialog.locator("[data-slots] button").filter({ hasText: "09:45" }).click();
    expect(await axe(page)).toEqual([]);
    await next.click();
    await expect(dialog.locator("[data-chosen-slot]")).toContainText("09:45");
    await dialog.getByLabel("Full name").fill("Baraka Otieno");
    await dialog.getByLabel("Work email").fill("baraka@example.co.ke");
    await dialog.getByLabel("Organisation").fill("Sample Sacco");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Book this time" }).click();

    // Someone took it meanwhile: back to the times, with a notice.
    await expect(dialog.getByRole("alert")).toContainText("That time was just taken");
    expect(sent[0]).toMatchObject({ kind: "demo_request", demo_slot: "2099-11-25T06:45:00Z" });
    await dialog.locator("[data-days] button").nth(1).click();
    await dialog.locator("[data-slots] button").filter({ hasText: "14:00" }).click();
    await dialog.getByRole("button", { name: "Continue" }).click();
    // What was typed is kept.
    await expect(dialog.getByLabel("Full name")).toHaveValue("Baraka Otieno");
    await dialog.getByRole("button", { name: "Book this time" }).click();
    await expect(dialog.getByText("Demo requested")).toBeVisible();
    await expect(dialog.locator("[data-reference]")).toHaveText("FBG-DEMO-0001");
    expect(sent[1]).toMatchObject({ kind: "demo_request", demo_slot: "2099-11-26T11:00:00Z" });
    // A new attempt is a new request, not a replay of the refused one.
    expect(sent[0]).not.toEqual(sent[1]);
  });

  test("with booking off, Book a demo offers the demo request form", async ({ page }) => {
    await page.route("**/v1/sites/figbud/demo-slots", (route) => route.fulfill({ json: { enabled: false } }));
    await page.goto("/en#book-demo");
    const dialog = page.getByRole("dialog", { name: "Book a FigBud Global demo" });
    await expect(dialog.getByText("Online booking isn't open right now")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Request a demo" })).toHaveAttribute(
      "href",
      /\/en\/contact\?kind=demo_request&product=figbud#enquire$/,
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("in the Studio", () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
  });

  test("availability, bookings, assignment, notes and the overview", async ({ page }, testInfo) => {
    await signInAsOwner(page);

    // Demo availability: each project edits its own website, so parallel runs never collide.
    const site = testInfo.project.name === "mobile" ? "expense_now" : "zirahr";
    await page.goto(`/admin/enquiries/availability?site=${site}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo availability");
    const on = page.getByRole("switch");
    if ((await on.getAttribute("aria-checked")) !== "true") await on.click();
    await page.getByLabel("Note beside the times").fill(`Online demos ${Date.now()}`);
    await page.getByRole("button", { name: "Save availability" }).click();
    await expect(page.getByRole("status").filter({ hasText: "takes bookings" })).toBeVisible();
    await expect(page.locator("[data-preview] li").first()).toContainText("times from");
    expect(await axe(page)).toEqual([]);

    // Demo bookings: confirm a pending one, then move it to another free time.
    await studioLink(page, "Demo bookings");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo bookings");
    const row = page.locator("li").filter({ hasText: "Baraka Otieno" });
    const confirm = row.getByRole("button", { name: "Confirm" });
    if (await confirm.isVisible()) {
      await confirm.click();
      await expect(row.getByRole("status")).toHaveText("Booking confirmed.");
    }
    await row.getByRole("button", { name: "Reschedule" }).click();
    const time = row.getByLabel(/New time/);
    await expect(time.locator("option").nth(1)).toBeAttached();
    await time.selectOption({ index: 1 });
    await row.getByRole("button", { name: "Move booking" }).click();
    await expect(row.getByRole("status")).toHaveText("Booking moved.");
    expect(await axe(page)).toEqual([]);

    // The enquiry shows the booking and its history.
    await row.getByRole("link", { name: /Baraka Otieno/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Baraka Otieno");
    await expect(page.getByRole("region", { name: "Demo booking" })).toBeVisible();
    await expect(page.getByRole("region", { name: "History" })).toContainText("Demo moved from");

    // A workspace request: assign it and add a note.
    await page.goto("/admin/enquiries?kind=workspace_request");
    await page.getByRole("link", { name: /Esther Njeri/ }).click();
    await expect(page.getByText("Workspace request · ZiraHR")).toBeVisible();
    // Shared mock: assign whoever isn't assigned yet.
    const assignee = page.getByLabel("Assigned to");
    const current = await assignee.locator("option:checked").textContent();
    const person = current === "Alice Editor" ? "Olu Owner" : "Alice Editor";
    await assignee.selectOption({ label: person });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Assigned." })).toBeVisible();
    await page.getByLabel("Add a note").fill("Called; sending the onboarding pack.");
    await page.getByRole("button", { name: "Add note" }).click();
    const history = page.getByRole("region", { name: "History" });
    await expect(history).toContainText(`Assigned to ${person}`);
    await expect(history).toContainText("Note: Called; sending the onboarding pack.");
    expect(await axe(page)).toEqual([]);

    // The overview counts what arrived.
    await studioLink(page, "Leads overview");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Leads overview");
    await expect(page.locator("[data-lead-tiles]")).toContainText("Demos booked");
    await expect(page.getByRole("region", { name: "By kind" })).toContainText("Workspace request");
    await page.getByRole("link", { name: "90 days" }).click();
    await expect(page).toHaveURL(/days=90$/);
    expect(await axe(page)).toEqual([]);
  });
});
