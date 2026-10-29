import { describe, expect, it } from "vitest";

import { consentCurrent, parseConsent, serialiseConsent } from "./consent";
import { DEFAULT_PRIVACY } from "./privacy";

const id = "0b5f3c9e-8a4b-4c1d-9e2f-1a2b3c4d5e6f";

describe("consent cookie", () => {
  it("round-trips a choice", () => {
    const consent = {
      version: 2,
      id,
      choices: { analytics: true, preferences: false, marketing: false },
      savedAt: 1_767_225_600,
    };
    expect(serialiseConsent(consent)).toBe(`2|${id}|100|1767225600`);
    expect(parseConsent(encodeURIComponent(serialiseConsent(consent)))).toEqual(consent);
  });

  it("ignores anything malformed instead of guessing consent", () => {
    for (const raw of [
      undefined,
      "",
      "yes",
      `1|${id}|111`,
      `1|not-an-id|111|1`,
      `1|${id}|1x1|1`,
      `x|${id}|111|1`,
    ]) {
      expect(parseConsent(raw)).toBeNull();
    }
  });

  it("asks again after a new policy version or once the retention period has passed", () => {
    const now = 1_767_225_600;
    const saved = {
      version: 1,
      id,
      choices: { analytics: false, preferences: false, marketing: false },
      savedAt: now,
    };
    expect(consentCurrent(saved, DEFAULT_PRIVACY, now + 86_400)).toBe(true);
    expect(consentCurrent(saved, { ...DEFAULT_PRIVACY, policy_version: 2 }, now)).toBe(false);
    expect(consentCurrent(saved, DEFAULT_PRIVACY, now + 181 * 86_400)).toBe(false);
    expect(consentCurrent(null, DEFAULT_PRIVACY, now)).toBe(false);
  });
});
