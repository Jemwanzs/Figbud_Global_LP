import { describe, expect, it } from "vitest";

import { bandProps, sectionLooks, sectionTones } from "./section-themes";

describe("alternating home sections", () => {
  it("start opposite the hero and alternate", () => {
    expect(sectionTones(["platforms", "philosophy", "africa", "engineer", "company", "closing"])).toEqual({
      platforms: "inverse",
      philosophy: "follow",
      africa: "inverse",
      engineer: "follow",
      company: "inverse",
      closing: "follow",
    });
  });

  it("give Trusted By its own band, opposite Our Platforms", () => {
    const tones = sectionTones(["platforms", "trusted", "philosophy", "africa"]);
    expect(tones).toEqual({
      platforms: "inverse",
      trusted: "follow",
      philosophy: "inverse",
      africa: "follow",
    });
    // On the light theme: dark, light, dark, light (the owner's brief).
    expect(sectionLooks(["platforms", "trusted", "philosophy", "africa"], {}, "light")).toEqual({
      platforms: "dark",
      trusted: "light",
      philosophy: "dark",
      africa: "light",
    });
  });

  it("count only the sections on the page, so neighbours never share a band", () => {
    const withProof = sectionTones([
      "platforms",
      "philosophy",
      "africa",
      "engineer",
      "proof",
      "company",
      "closing",
    ]);
    expect(withProof.proof).toBe("inverse");
    expect(withProof.company).toBe("follow");
  });

  it("keep a section set in the Studio, and carry on alternating from it", () => {
    const tones = sectionTones(["platforms", "philosophy", "africa", "engineer"], { philosophy: "inverse" });
    expect(tones).toEqual({
      platforms: "inverse",
      philosophy: "inverse",
      africa: "follow",
      engineer: "inverse",
    });
  });

  it("keep a light or dark section in both themes, and alternate from it in each", () => {
    const present = ["platforms", "trusted", "philosophy"] as const;
    const tones = sectionTones(present, { trusted: "light" });
    // Our Platforms is opposite the hero; Trusted By is light on both themes;
    // Our philosophy is dark after it on both, so it never matches its neighbour.
    expect(tones).toEqual({ platforms: "inverse", trusted: "light", philosophy: "dark" });
    for (const mode of ["light", "dark"] as const) {
      const looks = sectionLooks(present, { trusted: "light" }, mode);
      expect(looks.trusted).toBe("light");
      expect(looks.philosophy).toBe("dark");
    }
  });

  it("treat a brand band as dark and a soft band as the visitor's theme", () => {
    const tones = sectionTones(["platforms", "trusted", "philosophy"], {
      platforms: "brand",
      trusted: "soft",
    });
    expect(tones).toEqual({ platforms: "brand", trusted: "soft", philosophy: "inverse" });
    expect(sectionLooks(["platforms", "philosophy"], { platforms: "brand" }, "dark").philosophy).toBe(
      "light",
    );
    expect(sectionLooks(["platforms", "philosophy"], { platforms: "brand" }, "light").philosophy).toBe(
      "light",
    );
  });

  it("mark each style for the theme engine", () => {
    expect(bandProps("inverse")).toMatchObject({ "data-tone": "inverse", "data-band": "inverse" });
    expect(bandProps("light")).toMatchObject({ "data-tone-dark": "inverse", "data-tone-light": undefined });
    expect(bandProps("dark")).toMatchObject({ "data-tone-light": "inverse", "data-tone-dark": undefined });
    expect(bandProps("brand")).toMatchObject({ "data-tone-light": "inverse", "data-band": "brand" });
    expect(bandProps(undefined)).toMatchObject({ "data-tone": undefined, "data-band": "follow" });
  });
});
