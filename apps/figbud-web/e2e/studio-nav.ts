import type { Page } from "@playwright/test";

/**
 * Follows a Studio sidebar link: opens the menu first on narrow screens, and
 * the main tab that holds the link if it's closed (one main tab is open at a time).
 */
export async function studioLink(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  const nav = page.getByRole("navigation", { name: "Admin" });
  const link = nav.getByRole("link", { name, exact: true });
  if (!(await link.isVisible())) {
    await nav
      .locator("li[data-group]")
      .filter({ has: page.getByRole("link", { name, exact: true, includeHidden: true }) })
      .locator(":scope > button")
      .click();
  }
  await link.click();
}
