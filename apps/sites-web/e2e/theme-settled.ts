import type { Page } from "@playwright/test";

/**
 * Waits until a theme switch has finished, including any element's own colour
 * transition: contrast checks must see the end state, not a colour part-way.
 */
export async function themeSettled(page: Page): Promise<Page> {
  await page.waitForFunction(() => {
    if (document.documentElement.hasAttribute("data-theme-switching")) return false;
    // A colour still easing (an element's own hover-style transition picking up the new
    // theme); movement such as auto-advancing demonstrations doesn't count.
    const colours = ["color", "background-color", "border-color", "fill", "stroke"];
    return !document
      .getAnimations()
      .some(
        (a) =>
          a instanceof CSSTransition && a.playState === "running" && colours.includes(a.transitionProperty),
      );
  });
  return page;
}
