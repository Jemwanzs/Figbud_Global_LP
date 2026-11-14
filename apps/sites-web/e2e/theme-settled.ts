import type { Page } from "@playwright/test";

/**
 * Waits until a theme switch has finished, including any element's own colour
 * transition: contrast checks must see the end state, not a colour part-way.
 */
export async function themeSettled(page: Page): Promise<Page> {
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-theme-switching"));
  // One-off entrances (a page fading in after navigating) end first: contrast is
  // measured on what stays on screen, not on text part-way through fading in.
  await page
    .waitForFunction(
      () =>
        !document
          .getAnimations()
          .some(
            (a) =>
              a instanceof CSSAnimation &&
              a.playState === "running" &&
              a.effect?.getTiming().iterations !== Infinity,
          ),
      undefined,
      { timeout: 2_000 },
    )
    .catch(() => undefined);
  // A colour still easing (an element's own hover-style transition picking up the new
  // theme). Capped: some browsers keep restarting transitions on looping content, and
  // movement such as auto-advancing demonstrations doesn't count anyway.
  await page
    .waitForFunction(
      () => {
        const colours = ["color", "background-color", "border-color", "fill", "stroke"];
        return !document
          .getAnimations()
          .some(
            (a) =>
              a instanceof CSSTransition &&
              a.playState === "running" &&
              colours.includes(a.transitionProperty),
          );
      },
      undefined,
      { timeout: 1_500 },
    )
    .catch(() => undefined);
  return page;
}

/**
 * Scrolls to the top before a whole-page scan: sticky headers cover whatever
 * sits under them, and axe counts a part-covered field as an undersized target.
 */
export async function scrolledToTop(page: Page): Promise<Page> {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  return page;
}
