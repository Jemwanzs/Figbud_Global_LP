import type { Page } from "@playwright/test";

/**
 * Waits until a theme switch has finished: colours ease over 280 ms
 * (`setTheme` in @figbud/ui), and contrast checks must see the end state.
 */
export async function themeSettled(page: Page): Promise<Page> {
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-theme-switching"));
  return page;
}
