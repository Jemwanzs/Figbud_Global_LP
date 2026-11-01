import type { ShowcaseSettings } from "@figbud/site-kit";

// Scroll-driven Our Platforms (UI-MO5): the pure parts, kept out of the
// component so they can be tested and reasoned about on their own.

/** Above this width the showcase is the desktop composition (Tailwind lg). */
export const WIDE = "(min-width: 64rem)";
/**
 * Where the pinned showcase may run without JavaScript knowing its height:
 * large, tall enough and with motion allowed. The runway's spacer is in the
 * server CSS for these screens, so the page doesn't shift when it hydrates.
 * Must match `.fb-showcase` in site-kit's styles.css.
 */
export const PIN_QUERY =
  "(min-width: 64rem) and (min-height: 45rem) and (prefers-reduced-motion: no-preference)";
/** The site header (4.5rem) plus breathing room under it. */
export const HEADER = 72;
const GAP = 16;
/** The smallest scale the pinned showcase may use: below it, text gets too small to read comfortably. */
export const MIN_SCALE = { wide: 0.7, narrow: 0.85 } as const;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Raw scroll progress (0 → products - 1) to the showcase position. Each
 * product rests fully in place for a short stretch either side of its stop,
 * and moves with an ease in between, so the cards settle instead of drifting.
 */
export function settle(progress: number, rest = 0.18): number {
  const base = Math.floor(progress);
  const t = clamp((progress - base - rest) / (1 - 2 * rest), 0, 1);
  return base + t * t * (3 - 2 * t);
}

/**
 * The scale that fits the whole showcase between the header and the bottom
 * of the screen, and where to pin it so it sits centred in that space.
 */
export function fit(height: number, viewport: number): { scale: number; top: number } {
  const room = viewport - HEADER - GAP * 2;
  const scale = height > 0 ? Math.min(1, room / height) : 1;
  return { scale, top: HEADER + GAP + Math.max(0, (room - height * scale) / 2) };
}

/** Per-frame easing towards the scroll position, independent of the display's refresh rate. */
const FOLLOW: Record<ShowcaseSettings["smoothness"], number> = { direct: 1, smooth: 0.2, gentle: 0.1 };
export function follow(smoothness: ShowcaseSettings["smoothness"], elapsedMs: number): number {
  const perFrame = FOLLOW[smoothness];
  return perFrame >= 1 ? 1 : 1 - Math.pow(1 - perFrame, clamp(elapsedMs, 0, 100) / (1000 / 60));
}

/** How much a product away from the centre shrinks and fades. Kept small: depth, not zoom. */
export const DEPTH: Record<ShowcaseSettings["intensity"], { scale: number; fade: number }> = {
  subtle: { scale: 0.025, fade: 0.35 },
  standard: { scale: 0.05, fade: 0.5 },
  bold: { scale: 0.08, fade: 0.6 },
};

/** A panel's look at a distance from the current position (0 = in place). */
export function panelStyle(distance: number, intensity: ShowcaseSettings["intensity"]) {
  const d = Math.min(1, Math.abs(distance));
  const depth = DEPTH[intensity];
  return { opacity: 1 - depth.fade * d, scale: 1 - depth.scale * d };
}

export type ShowcaseMode = "carousel" | "pinned" | "flowing";

/**
 * Which experience runs: pinned (sticky runway), flowing (scroll-linked as
 * the section passes, no pin) or the carousel. Reduced motion and screens
 * where the showcase can't fit comfortably always get the carousel.
 */
export function chooseMode(
  settings: Pick<ShowcaseSettings, "scroll_driven" | "sticky" | "mobile">,
  screen: { wide: boolean; pinnable: boolean; reducedMotion: boolean; scale: number },
): ShowcaseMode {
  if (!settings.scroll_driven || screen.reducedMotion) return "carousel";
  if (!screen.wide && settings.mobile !== "scroll_where_comfortable") return "carousel";
  if (!settings.sticky) return "flowing";
  if (screen.wide) return screen.pinnable && screen.scale >= MIN_SCALE.wide ? "pinned" : "carousel";
  return screen.scale >= MIN_SCALE.narrow ? "pinned" : "carousel";
}
