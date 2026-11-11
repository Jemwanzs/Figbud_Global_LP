import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STUDIO_DEFAULTS, appearanceIssues, studioAppearanceCss, studioTokens } from "./studio-appearance";

const tokens = readFileSync(new URL("../../../../packages/brand/src/tokens.css", import.meta.url), "utf8");
const block = (selector: string) => {
  const i = tokens.indexOf(`${selector} {`);
  return tokens.slice(i, tokens.indexOf("}", i));
};

describe("the Studio's appearance", () => {
  it("starts from the built-in palette in tokens.css", () => {
    for (const mode of ["dark", "light"] as const) {
      const css = block(`[data-studio][data-theme="${mode}"]`);
      const m = STUDIO_DEFAULTS[mode];
      for (const [token, value] of [
        ["--bg", m.background],
        ["--bg-elevated", m.sidebar],
        ["--surface", m.surface],
        ["--surface-2", m.hover],
        ["--text", m.text],
        ["--text-muted", m.text_muted],
      ]) {
        expect(css, `${mode} ${token}`).toContain(`${token}: ${value};`);
      }
    }
  });

  it("built-in colours pass every critical check", () => {
    expect(appearanceIssues(STUDIO_DEFAULTS).filter((i) => i.critical)).toEqual([]);
  });

  it("blocks unreadable text and incomplete modes, with the ratio", () => {
    const weak = { dark: { ...STUDIO_DEFAULTS.dark, text_muted: "#3a2a20" } };
    const [issue] = appearanceIssues(weak);
    expect(issue).toMatchObject({ mode: "dark", critical: true });
    expect(issue?.ratio).toBeLessThan(4.5);
    expect(appearanceIssues({ light: { background: "#ffffff" } })[0]?.critical).toBe(true);
  });

  it("applies only to the Studio, as tokens, with derived values", () => {
    const css = studioAppearanceCss({ dark: { ...STUDIO_DEFAULTS.dark, field: "#100b08" } });
    expect(css).toContain('[data-studio][data-theme="dark"] {');
    expect(css).toContain("--bg-elevated: #130d09;");
    expect(css).toContain('[data-studio][data-theme="dark"] .fb-field { background-color: #100b08; }');
    expect(css).not.toContain("light");
    expect(studioTokens({ background: "#ffffff" })).toEqual({});
    expect(studioAppearanceCss({})).toBe("");
  });
});
