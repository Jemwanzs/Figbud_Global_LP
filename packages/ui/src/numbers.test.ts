import { describe, expect, it } from "vitest";

import { formatFigure } from "./numbers";

describe("figures on every website (owner's brief, 19 Nov 2026)", () => {
  const n = (value: number, extra = {}) => formatFigure({ value, format: "number", ...extra });

  it("is compact by default, with automatic decimals and no trailing zero", () => {
    expect(n(1_200)).toBe("1.2K");
    expect(n(25_000)).toBe("25K");
    expect(n(250_000)).toBe("250K");
    expect(n(1_200_000)).toBe("1.2M");
    expect(n(25_000_000)).toBe("25M");
    expect(n(1_500_000_000)).toBe("1.5B");
    expect(n(12)).toBe("12");
  });

  it("never rounds a verified figure up", () => {
    expect(n(1_364)).toBe("1.3K");
    expect(n(999_999)).toBe("999.9K");
    expect(n(1_999)).toBe("1.9K");
  });

  it("keeps currency, marks and percentages, and full notation on request", () => {
    expect(formatFigure({ value: 25_000_000, format: "currency", currency: "KES", suffix: "+" })).toBe(
      "KES 25M+",
    );
    expect(
      formatFigure({ value: 25_000_000, format: "currency", currency: "KES", notation: "full", suffix: "+" }),
    ).toBe("KES 25,000,000+");
    expect(formatFigure({ value: 99.5, format: "percent" })).toBe("99.5%");
    expect(n(12, { suffix: "+" })).toBe("12+");
    expect(n(1_364, { decimals: 2 })).toBe("1.36K");
    // A "+" appears only when the figure carries it.
    expect(n(25_000_000)).not.toContain("+");
  });

  it("follows the website's default when a figure says auto", () => {
    expect(formatFigure({ value: 1_200, format: "number", notation: "auto" }, "en", "full")).toBe("1,200");
    expect(formatFigure({ value: 1_200, format: "number", notation: "auto" }, "en", "compact")).toBe("1.2K");
  });

  it("formats each count-up frame the same way as the final figure", () => {
    const f = { value: 25_000_000, format: "currency" as const, currency: "KES", suffix: "+" };
    expect(formatFigure(f, "en", "compact", f.value)).toBe(formatFigure(f));
    expect(formatFigure(f, "en", "compact", 12_400_000)).toBe("KES 12.4M+");
  });
});
