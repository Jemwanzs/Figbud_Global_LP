#!/usr/bin/env node
// Completion baseline for the three workstreams, computed from docs/ROADMAP.md
// (the source of truth) and written to docs/PROGRESS.md. Run with
// `npm run roadmap:progress` after the roadmap changes.
//
// Method (kept identical between runs, so percentages are comparable):
// - Every roadmap row with an id (P2-05, UI-MO8 …) is one scoped deliverable.
// - A row belongs to a workstream by its phase, with the explicit exceptions
//   below; rows shared by both websites count in both.
// - Status scores: ✅ done = 1; 🔄 / 🟡 partly done = 0.5; ⬜ not started,
//   ⛔ blocked = 0. Rows on hold (⏸), superseded (↪) or deliberately not built
//   are out of scope and not counted.
// - Completion % = score ÷ rows in scope. "Blocked" lists rows waiting on an
//   owner decision (a Q-number in their status), which development can't close.
import { readFileSync, writeFileSync } from "node:fs";

const roadmap = readFileSync(new URL("../docs/ROADMAP.md", import.meta.url), "utf8");

const PHASE = {
  // FigBud Global landing page and corporate pages.
  P2: ["figbud"],
  P3: ["figbud"],
  // ZiraHR website.
  P14: ["zirahr"],
  // Admin Studio and the services behind it.
  P7: ["studio"],
  P8: ["studio"],
  P9: ["studio"],
  P11: ["studio"],
  P12: ["studio"],
  P13: ["studio"],
};

/** Exceptions to the phase rule. `[]` leaves a row out (other products, platform). */
const ROWS = {
  // Phase 4: only ZiraHR's rows (other product websites are on hold) and the shared template.
  "P4-01": ["zirahr"],
  "P4-02": ["zirahr", "figbud"],
  "P4-Z1": ["zirahr"],
  "P4-Z2": ["zirahr"],
  "P4-Z3": ["zirahr"],
  "P4-Z4": ["zirahr"],
  "P4-Z5": ["zirahr"],
  "P4-Z6": ["zirahr"],
  "P4-10": ["zirahr"],
  "P4-11": ["zirahr", "figbud"],
  "P4-12": ["zirahr"],
  "P4-13": ["zirahr"],
  "P4-14": ["zirahr"],
  "P4-CS1": ["figbud"],
  // Phase 5: the enquiry pipeline serves both websites' forms; the administration parts are the Studio's.
  "P5-01": ["figbud", "zirahr"],
  "P5-02": ["figbud", "zirahr"],
  "P5-03": ["figbud", "zirahr"],
  "P5-04": ["figbud", "zirahr"],
  "P5-05": ["figbud", "zirahr"],
  "P5-06": ["figbud", "zirahr"],
  "P5-11": ["figbud", "zirahr"],
  "P5-12": ["figbud"],
  "P5-13": [],
  "P5-14": ["figbud", "zirahr"],
  "P5-15": ["figbud", "zirahr"],
  "P5-16": ["studio"],
  "P5-07": ["studio"],
  "P5-08": ["studio"],
  "P5-09": ["studio"],
  "P5-10": ["studio"],
  "P5-17": ["studio"],
  // Phase 7 rows that are website features rather than Studio features.
  "P7-B6": ["figbud"],
  "UI-SP1": ["figbud"],
  "UI-F1": ["figbud"],
  "UI-NAV1": ["figbud"],
  "P7-ZR1": ["zirahr", "studio"],
  "P7-E3": ["zirahr"],
  "P7-ZW1": [],
  "P7-ZW2": [],
  // Phase 10: motion and proof, per website.
  "UI-MO1": ["figbud", "zirahr"],
  "UI-MO2": ["figbud"],
  "UI-MO3": ["figbud"],
  "UI-MO4": ["figbud"],
  "UI-NAV2": ["figbud", "zirahr", "studio"],
  "UI-MO5": ["figbud", "studio"],
  "UI-MO6": ["zirahr"],
  "UI-MO7": ["zirahr"],
  "UI-TH3": ["figbud", "zirahr"],
  "UI-TH4": ["zirahr"],
  "UI-HE1": ["zirahr", "studio"],
  "P7-PC2": ["figbud", "zirahr"],
  "UI-F2": ["zirahr"],
  "P7-FT1": ["figbud", "zirahr", "studio"],
  "P7-ZC1": ["zirahr"],
  "UI-TH5": ["figbud"],
  "UI-MO8": ["figbud", "zirahr", "studio"],
  "UI-MO10": ["zirahr", "figbud"],
  "UI-AD1": ["zirahr"],
  "UI-TH6": ["figbud", "studio"],
  "P7-UX3": ["studio"],
  "P7-UX4": ["studio"],
  "P7-UX5": ["studio"],
  "UI-HE2": ["zirahr", "studio"],
  "UI-NS1": ["figbud", "zirahr", "studio"],
  "UI-NS2": ["figbud", "zirahr"],
  "UI-SC1": ["zirahr", "figbud"],
  "UI-MT1": ["zirahr"],
  "UI-HE3": ["zirahr", "studio"],
  "UI-ZP1": ["zirahr"],
  "UI-GR1": ["zirahr"],
  "UI-BT1": ["studio", "zirahr"],
  "UI-HM1": ["studio", "zirahr"],
  "UI-TB1": ["studio", "figbud"],
  "UI-AP1": ["studio"],
  "UI-PR2": ["zirahr", "studio"],
  "UI-SS1": ["zirahr"],
  "UI-MO12": ["zirahr", "figbud"],
  "UI-MO11": ["zirahr"],
  "UI-MO9": ["figbud", "zirahr"],
  "UI-PR1": ["figbud"],
  "P10-T1": ["figbud", "studio"],
  "P10-T2": ["figbud", "studio"],
  "P10-T3": ["figbud", "studio"],
  "P10-B1": ["figbud"],
  "P10-W1": ["figbud"],
  "P10-V1": ["figbud", "zirahr"],
  // Hero collections: ZiraHR's designs are the ZiraHR website's; other products are on hold.
  "P12-H5": ["zirahr", "studio"],
  "P12-H6": [],
};

const NAMES = {
  figbud: "FigBud Global landing page",
  zirahr: "ZiraHR landing page",
  studio: "Centralised Admin Studio",
};

function score(status) {
  if (/^(⏸|↪)/.test(status) || /Deliberately not built/i.test(status)) return null;
  if (status.startsWith("✅")) return 1;
  if (/^(🔄|🟡)/.test(status)) return 0.5;
  return 0;
}

const rows = [];
for (const line of roadmap.split(/\r?\n/)) {
  const m = /^\|\s*([A-Z0-9]+-[A-Z0-9-]+)\s*\|(.*)\|\s*([^|]*)\|\s*$/.exec(line);
  if (!m) continue;
  const [, id, desc, status] = m;
  const streams = ROWS[id] ?? PHASE[id.split("-")[0]] ?? [];
  rows.push({ id, desc: desc.trim(), status: status.trim(), streams, value: score(status.trim()) });
}

const lines = [
  "# Workstream progress",
  "",
  "Generated by `npm run roadmap:progress` from `docs/ROADMAP.md`; don't edit by hand. The method is at the top of `scripts/roadmap-progress.mjs`: each roadmap row is one deliverable, scored ✅ 1, 🔄 or 🟡 0.5, ⬜ or ⛔ 0. Rows on hold, superseded or deliberately not built are left out.",
  "",
  "**Done** means built, tested and merged with CI passing. It doesn't by itself mean checked by hand on the live websites; the change log records those checks.",
  "",
  "| Workstream | Rows in scope | Done | Partly done | Not started or blocked | Completion | Remaining |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
];
const detail = [];
for (const key of Object.keys(NAMES)) {
  const mine = rows.filter((r) => r.streams.includes(key) && r.value !== null);
  const total = mine.reduce((sum, r) => sum + r.value, 0);
  const pct = mine.length ? Math.round((total / mine.length) * 1000) / 10 : 0;
  const done = mine.filter((r) => r.value === 1).length;
  const partly = mine.filter((r) => r.value === 0.5).length;
  const open = mine.filter((r) => r.value === 0).length;
  lines.push(
    `| ${NAMES[key]} | ${mine.length} | ${done} | ${partly} | ${open} | ${pct}% | ${Math.round((100 - pct) * 10) / 10}% |`,
  );
  detail.push(
    "",
    `## ${NAMES[key]}: outstanding`,
    "",
    "| Row | Deliverable | Status | Blocked by an owner decision |",
    "| --- | --- | --- | --- |",
  );
  for (const r of mine.filter((r) => r.value < 1)) {
    const blocked = /Q\d+/.exec(r.status)?.[0] ?? "";
    const desc = r.desc.length > 110 ? `${r.desc.slice(0, 107)}…` : r.desc;
    const status = r.status.length > 90 ? `${r.status.slice(0, 87)}…` : r.status;
    detail.push(`| ${r.id} | ${desc} | ${status} | ${blocked} |`);
  }
}
writeFileSync(new URL("../docs/PROGRESS.md", import.meta.url), [...lines, ...detail, ""].join("\n"));
console.log(lines.slice(6).join("\n"));
