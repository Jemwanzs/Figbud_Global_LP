import { type Page, expect } from "@playwright/test";

/** The Studio's in-app confirmation dialog, while it's open. */
export const confirmDialog = (page: Page) => page.locator("dialog[data-confirm-dialog][open]");

/** Answers the open confirmation with one of its buttons, and waits for it to close. */
export async function answer(page: Page, button: string) {
  const dialog = confirmDialog(page);
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
