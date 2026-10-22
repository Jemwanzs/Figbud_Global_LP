import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const MOCK_API_PORT = 3199;

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
