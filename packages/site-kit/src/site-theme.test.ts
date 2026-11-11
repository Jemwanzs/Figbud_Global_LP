import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BUILT_IN_THEMES,
  builtInTheme,
  contrast,
  gradientCss,
  mix,
  siteThemeCss,
  themeIssues,
  themeTokens,
  type StudioTheme,
} from "./site-theme";

const tokensCss = readFileSync(new URL("../../brand/src/tokens.css", import.meta.url), "utf8");

describe("Brand & Theme Studio colours", () => {
  it("mix and measure like the API (site_theme.rs)", () => {
    expect(mix("#000000", "#ffffff", 50)).toBe("#808080");
    expect(mix("#38302d", "#fff5e6", 6)).toBe("#443c38");
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("write gradients from numbers and hex colours only", () => {
    expect(
      gradientCss({
        kind: "linear",
        angle: 125,
        stops: [
          { color: "#292625", at: 5 },
          { color: "#6B4229", at: 100 },
        ],
      }),
    ).toBe("linear-gradient(125deg, #292625 5%, #6b4229 100%)");
    expect(
      gradientCss({
        kind: "radial",
        x: 80,
        y: 20,
        stops: [
          { color: "#765037", at: 0, opacity: 40 },
          { color: "#292625", at: 100 },
        ],
      }),
    ).toBe("radial-gradient(ellipse at 80% 20%, rgb(118 80 55 / 40%) 0%, #292625 100%)");
    expect(
      gradientCss({
        stops: [
          { color: "red;}body{", at: 0 },
          { color: "#000000", at: 100 },
        ],
      }),
    ).toBeNull();
  });

  it("scope a website's theme to that website and to both themes", () => {
    const css = siteThemeCss("ziwa", {
      light: builtInTheme("ziwa").light,
      gradients: BUILT_IN_THEMES.zirahr.gradients,
    });
    expect(css).toContain('[data-theme="light"] [data-site="ziwa"]');
    expect(css).toContain('[data-site="ziwa"] [data-theme="light"]');
    expect(css).toContain('[data-theme="dark"] [data-site="ziwa"] [data-tone="inverse"]');
    expect(css).toContain("--bg: #f8fafc;");
    expect(css).toContain("--grad-hero: linear-gradient(125deg, #f9f5ef 5%");
    // The dark mode has gradients only: its colours stay the built-in ones.
    const dark = css.slice(css.indexOf('[data-theme="dark"] [data-site="ziwa"],'));
    expect(dark.split("{")[1]).not.toContain("--bg:");
    expect(siteThemeCss('x"] body, [y', builtInTheme("x"))).toBe("");
    expect(siteThemeCss("ziwa", {})).toBe("");
  });

  it("derive every surface the components use", () => {
    const t = themeTokens(BUILT_IN_THEMES.zirahr.dark!);
    expect(t["--surface-2"]).toBe(mix("#38302d", "#fff5e6", 6));
    expect(t["--action-ink"]).toBe("#292625");
    expect(t["--text-on-grad"]).toBe("#eadfd2");
    expect(themeTokens({ background: "#ffffff" })).toEqual({});
  });

  it("start from built-in themes that pass every check", () => {
    for (const slug of ["zirahr", "ziwa"]) {
      expect(themeIssues(builtInTheme(slug)).filter((i) => i.critical)).toEqual([]);
    }
  });

  it("match ZiraHR's built-in tokens", () => {
    const zirahr: StudioTheme = BUILT_IN_THEMES.zirahr;
    for (const [mode, mark] of [
      ["dark", '[data-theme="dark"] [data-site="zirahr"],'],
      ["light", '[data-theme="light"] [data-site="zirahr"],'],
    ] as const) {
      const block = tokensCss.slice(tokensCss.indexOf(mark), tokensCss.indexOf("}", tokensCss.indexOf(mark)));
      const m = zirahr[mode]!;
      for (const [token, value] of [
        ["--bg", m.background],
        ["--surface", m.surface],
        ["--text", m.text],
        ["--text-muted", m.text_muted],
        ["--action", m.action],
        ["--action-ink", m.action_text],
        ["--product-text", m.accent_text],
        ["--focus", m.focus],
        ["--text-on-grad", m.text_on_gradient],
        ["--grad-hero", gradientCss(zirahr.gradients!.hero![mode]!)],
        ["--grad-band", gradientCss(zirahr.gradients!.band![mode]!)],
        ["--grad-cta", gradientCss(zirahr.gradients!.cta![mode]!)],
      ]) {
        expect(block, `${mode} ${token}`).toContain(`${token}: ${value};`);
      }
    }
  });

  it("report what blocks publishing, with the ratio", () => {
    const weak = {
      ...BUILT_IN_THEMES.zirahr,
      light: { ...BUILT_IN_THEMES.zirahr.light, text_muted: "#c9b6a3" },
    };
    const issues = themeIssues(weak).filter((i) => i.critical);
    expect(issues.map((i) => i.message)).toContain("Secondary text on the background and surfaces");
    expect(issues.every((i) => i.mode === "light")).toBe(true);
    expect(issues[0]?.ratio).toBeLessThan(4.5);
    expect(themeIssues({ dark: { background: "#000000" } })[0]).toMatchObject({
      mode: "dark",
      critical: true,
    });
  });
});
