import type { Page } from "@playwright/test";

/** Follows a Studio navigation link, opening the menu first on narrow screens. */
export async function studioLink(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name, exact: true }).click();
}
