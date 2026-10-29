import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const MOCK_API_PORT = 3199;

/**
 * Visitors in most tests have already made their cookie choice (optional
 * cookies rejected), so the banner doesn't cover the page; the consent tests
 * start without it.
 */
const choiceMade = {
  cookies: [
    {
      name: "fb_consent",
      value: encodeURIComponent(
        `1|00000000-0000-4000-8000-000000000000|000|${Math.floor(Date.now() / 1000)}`,
      ),
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    },
  ],
  origins: [],
};

/**
 * End-to-end tests run against a production build (`npm run build` first).
 * The enquiry API is mocked at the network layer and the CMS by e2e/mock-api.mjs,
 * so no backend is required.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Dark is the default theme whatever the device prefers; tests run as a dark-mode device.
    colorScheme: "dark",
    storageState: choiceMade,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    // Cross-browser engines: Gecko and WebKit (Safari / iOS). Samsung Internet
    // is Chromium-based, so the Pixel project covers its engine.
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
  ],
  webServer: [
    {
      // Stand-in for the API (CMS and admin endpoints); the Next server reads it at runtime.
      command: `node e2e/mock-api.mjs`,
      url: `http://localhost:${MOCK_API_PORT}/health`,
      env: { MOCK_API_PORT: String(MOCK_API_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx next start --port ${PORT}`,
      url: `http://localhost:${PORT}/en`,
      env: { API_INTERNAL_URL: `http://localhost:${MOCK_API_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
