/**
 * One way to show marketing figures on every website (owner's brief, 19 Nov
 * 2026: "KES 25,000,000+" on one website and "KES 25M+" on another).
 *
 * - Compact notation (1.2K, 25M, 1.5B) is the default for figures on
 *   marketing pages; full notation stays available per figure.
 * - Decimals are automatic (up to one, never a trailing zero) unless set.
 * - Rounding never overstates a verified figure: 1,364 shows as 1.3K, and
 *   999,999 as 999.9K, not 1M. A "+" or other mark shows only when the figure
 *   itself carries it.
 * - Only the display changes: the stored value stays exact, and prices,
 *   quotations, payroll and other calculations never use this.
 * - Count-up animations format each frame with the same function, so the
 *   last frame is exactly the static figure.
 */

export type FigureFormat = "number" | "currency" | "percent";
export type FigureNotation = "compact" | "full" | "auto";

export interface Figure {
  value: number;
  format: FigureFormat;
  /** ISO 4217 code for currency figures (KES, USD, EUR). */
  currency?: string | null;
  /** Compact, full or the default (compact). */
  notation?: FigureNotation;
  /** Fixed decimals; `null` or unset for automatic (up to one, no trailing zero). */
  decimals?: number | null;
  prefix?: string | null;
  suffix?: string | null;
}

/** Whether a figure is drawn compact: `auto` and unset follow the default (compact). */
export const isCompact = (notation: FigureNotation | undefined, fallback: FigureNotation = "compact") =>
  (notation && notation !== "auto" ? notation : fallback) !== "full";

/** Intl options for a figure (rounded down, so nothing is overstated). */
export function figureOptions(
  figure: Figure,
  fallback: FigureNotation = "compact",
): Intl.NumberFormatOptions {
  const compact = figure.format !== "percent" && isCompact(figure.notation, fallback);
  const fixed = typeof figure.decimals === "number";
  const digits: Intl.NumberFormatOptions = fixed
    ? { minimumFractionDigits: figure.decimals!, maximumFractionDigits: figure.decimals! }
    : { minimumFractionDigits: 0, maximumFractionDigits: compact || figure.format === "percent" ? 1 : 0 };
  return {
    ...(compact ? { notation: "compact", compactDisplay: "short" } : {}),
    ...(figure.format === "currency" && figure.currency
      ? { style: "currency", currency: figure.currency, currencyDisplay: "code" }
      : {}),
    ...digits,
    // Never round a verified figure up.
    roundingMode: "trunc",
  } as Intl.NumberFormatOptions;
}

/** A figure as text: "KES 25M+", "1.3K+", "99.5%", "12+". */
export function formatFigure(
  figure: Figure,
  locale = "en",
  fallback: FigureNotation = "compact",
  value = figure.value,
): string {
  const options = figureOptions(figure, fallback);
  let text: string;
  try {
    text = new Intl.NumberFormat(locale, options).format(value);
  } catch {
    text = new Intl.NumberFormat("en", options).format(value);
  }
  // The currency code stays with its number ("KES 25M", a non-breaking space) in every locale.
  if (figure.format === "currency" && figure.currency) {
    text = text.replace(new RegExp(`${figure.currency}[\\s\\u00a0]?(?=\\d)`), `${figure.currency} `);
  }
  const suffix = `${figure.format === "percent" ? "%" : ""}${figure.suffix ?? ""}`;
  return `${figure.prefix ?? ""}${text}${suffix}`;
}
