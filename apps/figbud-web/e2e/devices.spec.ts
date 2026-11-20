import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import { scrolledToTop, themeSettled } from "./theme-settled";

// Device experience in the Studio (P14-W8), against e2e/mock-api.mjs. A new
// website per test keeps saves apart; ZiraHR has the approved settings
// published, and is only read here.

test.describe.configure({ timeout: 90_000 });

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
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Olu" })).toBeVisible();
}

async function newSite(page: Page) {
  const run = randomBytes(3).toString("hex");
  await page.goto("/admin/sites/new");
  await expect(async () => {
    await page.getByLabel("Website name").fill(`Devices ${run}`);
    await expect(page.getByLabel("Identifier")).not.toHaveValue("", { timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: "Create draft website" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Devices ${run}`);
}

test("a website's device experience starts from the approved settings, then drafts, publishes and restores (P14-W8)", async ({
  page,
}) => {
  await signInAsOwner(page);
  await newSite(page);
  await page.getByRole("link", { name: "Device experience" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Device experience");
  const studio = page.locator("[data-device-studio]");
  await expect(studio.locator("[data-device-status]")).toContainText("Not published yet");

  // The approved settings: all three devices, Phone shown, no switching, no fades, not synchronised.
  for (const device of ["Desktop", "Tablet", "Phone"])
    await expect(studio.getByLabel(device, { exact: true })).toBeChecked();
  await expect(studio.getByLabel("Device shown", { exact: true })).toHaveValue("phone");
  await expect(studio.getByLabel("Visitors may switch devices")).not.toBeChecked();
  await expect(studio.getByLabel("Fade between devices")).toBeDisabled();
  await expect(studio.getByLabel(/^Synchronised previews/)).toBeDisabled();
  // At least one device stays on, and the device shown is always one of them.
  await studio.getByLabel("Phone", { exact: true }).uncheck();
  await expect(studio.getByLabel("Device shown", { exact: true })).toHaveValue("desktop");
  await studio.getByLabel("Phone", { exact: true }).check();
  await studio.getByLabel("Device shown", { exact: true }).selectOption("phone");

  // The frame library.
  await studio.getByRole("tab", { name: "Frame library" }).click();
  await studio.getByLabel("Desktop frame").selectOption("laptop");
  await studio.getByLabel("Phone frame").selectOption("minimal");

  // The media library tab: screenshots come from the website's library.
  await studio.getByRole("tab", { name: "Media library" }).click();
  await expect(studio.locator("[data-device-media]")).toHaveCount(3);
  await expect(studio.getByText("No images in the media library yet.").first()).toBeVisible();

  await studio.getByRole("button", { name: "Save draft" }).click();
  await expect(studio.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  await expect(studio.locator("[data-device-status]")).toContainText("A draft is saved.");
  await studio.getByRole("button", { name: "Publish" }).click();
  await expect(studio.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  await expect(studio.locator("[data-device-status]")).toContainText(
    "Published: sections that inherit show phone frames, with no switching.",
  );

  // The published version is kept; loading it fills the form for review before publishing again.
  await studio.getByRole("tab", { name: "Frame library" }).click();
  await studio.getByLabel("Phone frame").selectOption("landscape");
  await studio.getByText("Published versions").click();
  await studio.getByRole("button", { name: "Load to restore" }).first().click();
  await expect(studio.getByLabel("Phone frame")).toHaveValue("minimal");
  await expect(studio.getByRole("button", { name: "Publish" })).toBeDisabled();

  const results = await new AxeBuilder({ page: await themeSettled(await scrolledToTop(page)) })
    .include("[data-device-studio]")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
});

test("the Studio previews each device in its frame, checks screenshots, and sections inherit by default (P14-W8)", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/admin/sites/zirahr/devices");
  const studio = page.locator("[data-device-studio]");
  await expect(studio.locator("[data-device-status]")).toContainText(
    "Published: sections that inherit show phone frames",
  );

  // A square image is flagged for every device; chosen anyway, the previews show it framed.
  await studio.getByRole("tab", { name: "Media library" }).click();
  const phone = studio.locator("[data-device-media=phone]");
  await phone.getByRole("radio").first().check();
  await expect(
    phone.getByText("A phone screenshot is tall (portrait) or wide (landscape), not square.").first(),
  ).toBeVisible();
  await expect(
    studio
      .locator("[data-device-media=desktop]")
      .getByText(/A desktop screenshot is wider/)
      .first(),
  ).toBeVisible();
  await studio.locator("[data-device-media=desktop]").getByRole("radio").first().check();

  // What visitors see: the phone alone, no device buttons.
  const visitor = studio.locator("[data-device-visitor-preview] [data-device-preview]");
  await expect(visitor).toHaveAttribute("data-device", "phone");
  await expect(visitor).toHaveAttribute("data-switching", "off");
  await expect(studio.locator("[data-device-visitor-preview]").getByRole("button")).toHaveCount(0);
  // Three independent previews, each in its own frame.
  await expect(
    studio.locator("[data-device-sample=phone] [data-device-frame=phone][data-frame-style=portrait] img"),
  ).toBeVisible();
  await expect(
    studio.locator("[data-device-sample=desktop] [data-device-frame=desktop][data-frame-style=browser]"),
  ).toBeVisible();
  await expect(studio.locator("[data-device-sample=tablet]")).toContainText("Choose a tablet screenshot");

  // A section's device preview inherits the website's settings by default, and can override them.
  await page.goto("/admin/sites/zirahr/pages");
  await page.getByRole("link", { name: "Workspace", exact: true }).first().click();
  const sections = page.getByRole("list", { name: "Sections" });
  await sections.getByRole("button", { name: /^Device showcase/ }).click();
  const settings = sections.locator("[data-device-settings]");
  await expect(settings.getByRole("radio", { name: "Inherit website settings" })).toBeChecked();
  await expect(settings).toContainText("follows the website's published device settings");
  await expect(settings.getByLabel("Device shown", { exact: true })).toHaveCount(0);
  await settings.getByRole("radio", { name: "Override for this section" }).check();
  await expect(settings.getByLabel("Device shown", { exact: true })).toBeVisible();
  await expect(settings.getByLabel("Desktop frame")).toBeVisible();
  await expect(settings.getByLabel("Visitors may switch devices (device buttons)")).toBeVisible();
});
