import type { PageSection } from "@figbud/site-kit";
import { describe, expect, it } from "vitest";

import { alternatingPattern } from "./page-types";

const s = (id: string, extra: Record<string, unknown>) => ({ id, ...extra }) as unknown as PageSection;

describe("alternating light and dark sections (owner's brief, 20 Nov 2026)", () => {
  it("alternates Auto sections from the hero, keeping explicit styles and continuing from them", () => {
    const { sections, changed } = alternatingPattern([
      s("hero", { type: "hero", heading: "Hi" }),
      s("a", { type: "demo", demo: "pay_run" }),
      s("b", { type: "demo", demo: "payslip", tone: "brand" }),
      s("c", { type: "text", body: "x" }),
      s("d", { type: "text", body: "x", hidden: true }),
      s("e", { type: "faq", items: [] }),
      s("cta", { type: "call_to_action", heading: "Go" }),
    ]);
    expect(sections.map((x) => x.tone)).toEqual([
      undefined,
      "dark",
      "brand",
      "light",
      undefined,
      "dark",
      undefined,
    ]);
    expect(changed).toBe(3);
  });

  it("swaps side-by-side demonstrations in turn and changes nothing when every section has a style", () => {
    const { sections } = alternatingPattern([
      s("a", { type: "demo", demo: "leave_flow", layout: "split" }),
      s("b", { type: "demo", demo: "attendance", layout: "split" }),
    ]);
    expect(sections.map((x) => (x as { flip?: boolean }).flip)).toEqual([false, true]);
    expect(alternatingPattern([s("a", { type: "text", body: "x", tone: "light" })]).changed).toBe(0);
  });
});
