import { describe, expect, it } from "vitest";

import { formatMoment, isoToZonedInput, zoneName, zonedInputToIso } from "./time";

describe("display time zone (owner's brief, 14 Nov 2026)", () => {
  it("shows UTC moments in East Africa Time by default, named", () => {
    expect(formatMoment("2026-11-14T15:56:00Z")).toBe("14 Nov 2026, 18:56 EAT");
    expect(zoneName()).toBe("EAT");
  });

  it("moves the calendar date across midnight", () => {
    expect(formatMoment("2026-11-14T22:30:00Z")).toBe("15 Nov 2026, 01:30 EAT");
    expect(formatMoment("2026-11-14T22:30:00Z", { dateOnly: true })).toBe("15 Nov 2026");
    expect(formatMoment("2026-12-31T21:15:00Z", { dateOnly: true })).toBe("1 Jan 2027");
  });

  it("follows another zone when chosen, and falls back to EAT for an unknown one", () => {
    expect(formatMoment("2026-11-14T15:56:00Z", { timeZone: "UTC" })).toBe("14 Nov 2026, 15:56 UTC");
    expect(formatMoment("2026-11-14T15:56:00Z", { timeZone: "Mars/Base" })).toBe("14 Nov 2026, 18:56 EAT");
    expect(formatMoment("not a date")).toBe("");
  });

  it("reads and writes scheduling inputs in the display zone", () => {
    expect(zonedInputToIso("2026-11-14T18:56", "Africa/Nairobi")).toBe("2026-11-14T15:56:00.000Z");
    expect(isoToZonedInput("2026-11-14T22:30:00Z", "Africa/Nairobi")).toBe("2026-11-15T01:30");
    // Daylight saving: London is UTC+1 in July, UTC in November.
    expect(zonedInputToIso("2026-07-01T09:00", "Europe/London")).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedInputToIso("2026-11-14T09:00", "Europe/London")).toBe("2026-11-14T09:00:00.000Z");
    expect(zonedInputToIso("", "Africa/Nairobi")).toBeNull();
  });
});
