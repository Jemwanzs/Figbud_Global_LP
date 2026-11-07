import { describe, expect, it } from "vitest";

import { sectionTones } from "./section-themes";

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
});
