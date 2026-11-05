"use client";

import { buttonClasses, cn } from "@figbud/ui";
import {
  BarChart3,
  BookOpen,
  Check,
  CircleCheck,
  CircleDashed,
  Clock,
  FileText,
  type LucideIcon,
  Palmtree,
  Receipt,
  Target,
  UserRound,
  UserSearch,
  Users,
  Wallet,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { EmployeeJourneyStory, ScatteredToConnectedStory, type StoryMotion } from "./scroll-story";

/*
 * Interactive product demonstrations for product website pages (P14-W), chosen
 * in the page builder like any block. Original ZiraHR art direction: a single
 * "signal line" connecting everything, in the website's product colour. Each
 * demo moves differently and only when it comes into view. Figures are
 * synthetic and labelled. The payslip and rules match the engine's own test
 * (`matches_the_illustrative_payslip_on_the_website`), so they can't drift
 * silently from the calculator.
 */

export type DemoKind =
  | "connected_modules"
  | "pay_run"
  | "payslip"
  | "rules"
  | "self_service"
  | "outputs"
  | "leave_flow"
  | "team_calendar"
  | "scattered_to_connected"
  | "employee_journey";

const SYNTHETIC = "Illustrative product activity · synthetic data";

/** Arms the entrance once the demo is in view; without JavaScript or with reduced motion, it's simply there. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [state, setState] = useState<"idle" | "waiting" | "seen">("idle");
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setState("waiting");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState("seen");
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, state, moving: state !== "idle" };
}

/** Moves on by itself while in view, until someone chooses a step. */
function useAutoStep(count: number, ms: number, running: boolean) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!running || held) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % count), ms);
    return () => window.clearTimeout(id);
  }, [index, held, running, count, ms]);
  return {
    index,
    choose: (i: number) => {
      setHeld(true);
      setIndex(i);
    },
  };
}

function Caption({ className }: { className?: string }) {
  return <p className={cn("text-xs text-subtle", className)}>{SYNTHETIC}</p>;
}

/** Arrow keys for a row of tabs, as everywhere else on the site. */
function arrows(event: KeyboardEvent, index: number, count: number, choose: (i: number) => void) {
  const rtl = document.documentElement.dir === "rtl";
  const forward = ["ArrowRight", "ArrowDown"];
  const back = ["ArrowLeft", "ArrowUp"];
  let next: number | null = null;
  if ((rtl ? back : forward).includes(event.key)) next = (index + 1) % count;
  if ((rtl ? forward : back).includes(event.key)) next = (index - 1 + count) % count;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = count - 1;
  if (next === null) return;
  event.preventDefault();
  choose(next);
  const list = (event.currentTarget as HTMLElement).closest('[role="tablist"]');
  list?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
}

const MODULES: { name: string; line: string; icon: LucideIcon }[] = [
  { name: "Core HR", line: "Every record, contract and milestone in one place.", icon: UserRound },
  { name: "Leave", line: "Requests, approvals and balances without the back-and-forth.", icon: Palmtree },
  { name: "Payroll", line: "From earnings and deductions to approvals and reports.", icon: Wallet },
  { name: "Time & Attendance", line: "Working time, shifts and overtime, clearly.", icon: Clock },
  { name: "Performance", line: "Goals, feedback and progress, connected.", icon: Target },
  { name: "Teams & Collaboration", line: "A shared home for work, updates and approvals.", icon: Users },
  { name: "Recruitment", line: "From first application to first day.", icon: UserSearch },
  { name: "Learning & Development", line: "Skills and growth in the employee journey.", icon: BookOpen },
];

/** Eight modules on one line around one record. The lit stretch of the line follows the chosen module. */
function ConnectedModules() {
  const { ref, state, moving } = useReveal<HTMLDivElement>();
  const { index, choose } = useAutoStep(MODULES.length, 3200, moving && state === "seen");
  const active = MODULES[index]!;
  const Icon = active.icon;
  const R = 150;
  const point = (i: number) => {
    const a = (i / MODULES.length) * Math.PI * 2 - Math.PI / 2;
    return { x: 200 + R * Math.cos(a), y: 200 + R * Math.sin(a) };
  };
  const length = 2 * Math.PI * R;
  const stretch = length / MODULES.length;
  return (
    <div
      ref={ref}
      data-theme="dark"
      data-reveal-state={state}
      className="fb-demo-stage grid items-center gap-8 overflow-hidden rounded-[var(--radius-panel)] p-5 text-text sm:p-8 @3xl:grid-cols-2"
    >
      <div className="relative mx-auto aspect-square w-full max-w-[26rem]">
        <svg aria-hidden viewBox="0 0 400 400" className="absolute inset-0 size-full">
          <circle cx="200" cy="200" r={R} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
          <circle
            cx="200"
            cy="200"
            r={R}
            fill="none"
            stroke="var(--product)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${stretch} ${length - stretch}`}
            strokeDashoffset={-index * stretch}
            transform="rotate(-90 200 200)"
            className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
          />
        </svg>
        <div className="absolute inset-[30%] grid place-items-center rounded-full border border-line bg-surface text-center">
          <p className="px-2 text-xs leading-snug text-muted @lg:text-sm">
            <span className="block font-semibold text-text">One record</span>
            per employee
          </p>
        </div>
        <div role="tablist" aria-label="Platform modules" aria-orientation="horizontal">
          {MODULES.map((module, i) => {
            const { x, y } = point(i);
            const NodeIcon = module.icon;
            const selected = i === index;
            return (
              <button
                key={module.name}
                type="button"
                role="tab"
                id={`demo-module-${i}`}
                aria-selected={selected}
                aria-controls="demo-module-panel"
                aria-label={module.name}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(i)}
                onKeyDown={(e) => arrows(e, i, MODULES.length, choose)}
                style={{ left: `${(x / 400) * 100}%`, top: `${(y / 400) * 100}%` }}
                className={cn(
                  "absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border transition-[color,background-color,border-color,scale] duration-300 @lg:size-12",
                  selected
                    ? "scale-110 border-product bg-product text-product-ink"
                    : "border-line-strong bg-surface text-muted hover:border-product hover:text-text",
                )}
              >
                <NodeIcon aria-hidden className="size-5" />
              </button>
            );
          })}
        </div>
      </div>
      <div
        id="demo-module-panel"
        role="tabpanel"
        aria-labelledby={`demo-module-${index}`}
        className="min-h-40"
        key={active.name}
      >
        <span
          aria-hidden
          className="grid size-12 place-items-center rounded-2xl bg-product-soft text-product-text"
        >
          <Icon className="size-6" />
        </span>
        <p className="mt-4 font-mono text-sm text-product-text">{`${String(index + 1).padStart(2, "0")} / 08`}</p>
        <h3 className="mt-1 font-display text-title font-semibold text-text">{active.name}</h3>
        <p className="mt-2 text-lead text-muted">{active.line}</p>
      </div>
    </div>
  );
}

const STAGES = [
  {
    key: "Prepare",
    line: "Pull earnings, deductions and attendance into the run.",
    who: "Payroll officer",
    records: "Inputs and changes since last month",
    unlocks: "Validation",
    state: "12 changes since last run",
  },
  {
    key: "Validate",
    line: "Flag anything unusual before anyone signs off.",
    who: "Payroll officer",
    records: "Flags and comments on each line",
    unlocks: "Approval",
    state: "2 flags to review",
  },
  {
    key: "Approve",
    line: "Your approvers sign off, in your order.",
    who: "The approvers you choose",
    records: "Each decision, who made it and when",
    unlocks: "Payment files",
    state: "Step 2 of 2 waiting",
  },
  {
    key: "Lock",
    line: "A completed run is closed, so its numbers stay as approved.",
    who: "Payroll lead",
    records: "The locked run and its audit trail",
    unlocks: "Reports",
    state: "Closed and read-only",
  },
  {
    key: "Report",
    line: "See costs across branches, departments and projects.",
    who: "HR, finance and leadership",
    records: "Downloads and who took them",
    unlocks: "Next month's run",
    state: "Reports ready",
  },
];

/** A run moving along the line: the line fills as far as the chosen stage. */
function PayRun() {
  const { ref, state, moving } = useReveal<HTMLDivElement>();
  const { index, choose } = useAutoStep(STAGES.length, 3600, moving && state === "seen");
  const stage = STAGES[index]!;
  return (
    <div ref={ref} data-reveal-state={state} className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-8">
      <div className="relative">
        <span aria-hidden className="absolute inset-x-[10%] top-5 h-0.5 bg-line-strong" />
        <span
          aria-hidden
          style={{ width: `${(index / (STAGES.length - 1)) * 80}%` }}
          className="absolute start-[10%] top-5 h-0.5 bg-product transition-[width] duration-700 ease-out motion-reduce:transition-none"
        />
        <div role="tablist" aria-label="Payroll stages" className="relative grid grid-cols-5">
          {STAGES.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              id={`demo-run-${i}`}
              aria-selected={i === index}
              aria-controls="demo-run-panel"
              tabIndex={i === index ? 0 : -1}
              onClick={() => choose(i)}
              onKeyDown={(e) => arrows(e, i, STAGES.length, choose)}
              className="flex min-h-11 flex-col items-center gap-2 text-center"
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-10 place-items-center rounded-full border text-sm font-semibold transition-colors duration-300",
                  i < index && "border-product bg-product-soft text-product-text",
                  i === index && "border-product bg-product text-product-ink",
                  i > index && "border-line-strong bg-surface text-muted",
                )}
              >
                {i < index ? <Check className="size-4" /> : i + 1}
              </span>
              <span
                className={cn("text-xs @lg:text-sm", i === index ? "font-semibold text-text" : "text-muted")}
              >
                {s.key}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div
        id="demo-run-panel"
        role="tabpanel"
        aria-labelledby={`demo-run-${index}`}
        className="mt-8 grid gap-6 @3xl:grid-cols-5"
      >
        <div className="@3xl:col-span-3">
          <h3 className="font-display text-title font-semibold text-text">{stage.key}</h3>
          <p className="mt-1 text-muted">{stage.line}</p>
          <dl className="mt-4 divide-y divide-line text-sm">
            {[
              ["Who acts", stage.who],
              ["What's recorded", stage.records],
              ["What's next", stage.unlocks],
            ].map(([term, value]) => (
              <div key={term} className="grid grid-cols-[8rem_1fr] gap-3 py-2.5">
                <dt className="text-muted">{term}</dt>
                <dd className="font-medium text-text">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2 p-4 @3xl:col-span-2">
          <p className="text-sm font-semibold text-text">November pay run</p>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            {index >= 3 ? (
              <CircleCheck aria-hidden className="size-4 text-product-text" />
            ) : (
              <CircleDashed aria-hidden className="size-4 text-product-text" />
            )}
            {stage.state}
          </p>
          <div aria-hidden className="mt-4 h-1.5 overflow-hidden rounded-full bg-line">
            <span
              style={{ width: `${((index + 1) / STAGES.length) * 100}%` }}
              className="block h-full rounded-full bg-product transition-[width] duration-700 motion-reduce:transition-none"
            />
          </div>
          <Caption className="mt-4" />
        </div>
      </div>
    </div>
  );
}

const LINES = [
  {
    key: "paye",
    label: "PAYE",
    amount: "33,526.85",
    title: "How PAYE was worked out",
    steps: [
      ["Gross pay", "150,000.00"],
      ["Less NSSF, SHIF and Housing Levy", "−12,855.00"],
      ["Taxable pay", "137,145.00", true],
      ["24,000.00 at 10%", "2,400.00"],
      ["8,333.00 at 25%", "2,083.25"],
      ["104,812.00 at 30%", "31,443.60"],
      ["Tax before relief", "35,926.85", true],
      ["Less personal relief", "−2,400.00"],
    ],
    total: "33,526.85",
  },
  {
    key: "nssf",
    label: "NSSF",
    amount: "6,480.00",
    title: "How NSSF was worked out",
    steps: [
      ["Tier I: 9,000.00 at 6%", "540.00"],
      ["Tier II: 99,000.00 at 6%", "5,940.00"],
    ],
    total: "6,480.00",
  },
  {
    key: "shif",
    label: "SHIF",
    amount: "4,125.00",
    title: "How SHIF was worked out",
    steps: [["150,000.00 at 2.75%", "4,125.00"]],
    total: "4,125.00",
  },
  {
    key: "ahl",
    label: "Housing Levy",
    amount: "2,250.00",
    title: "How the Housing Levy was worked out",
    steps: [["150,000.00 at 1.5%", "2,250.00"]],
    total: "2,250.00",
  },
] as const;

/** Choose a line on the payslip; its working unfolds alongside. */
function Payslip() {
  const { ref, state } = useReveal<HTMLDivElement>();
  const [index, setIndex] = useState(0);
  const line = LINES[index]!;
  return (
    <div
      ref={ref}
      data-reveal-state={state}
      className="grid overflow-hidden rounded-[var(--radius-panel)] border border-line @3xl:grid-cols-2"
    >
      <div className="bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold text-text">Sample employee</p>
            <p className="text-sm text-muted">Payslip · KES</p>
          </div>
          <FileText aria-hidden className="size-5 text-subtle" />
        </div>
        <dl className="mt-4 divide-y divide-line border-y border-line text-sm">
          <div className="flex justify-between py-2.5 font-medium">
            <dt className="text-text">Gross pay</dt>
            <dd className="text-text tabular-nums">150,000.00</dd>
          </div>
        </dl>
        <p id="demo-slip-label" className="mt-4 text-xs font-medium tracking-[0.12em] text-subtle uppercase">
          Deductions: choose one
        </p>
        <div
          role="tablist"
          aria-labelledby="demo-slip-label"
          aria-orientation="vertical"
          className="mt-2 space-y-1"
        >
          {LINES.map((l, i) => (
            <button
              key={l.key}
              type="button"
              role="tab"
              id={`demo-slip-${l.key}`}
              aria-selected={i === index}
              aria-controls="demo-slip-panel"
              tabIndex={i === index ? 0 : -1}
              onClick={() => setIndex(i)}
              onKeyDown={(e) => arrows(e, i, LINES.length, setIndex)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 text-sm transition-colors",
                i === index
                  ? "border-product bg-product-soft font-medium text-text"
                  : "border-transparent text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <span>{l.label}</span>
              <span className="tabular-nums">{l.amount}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-product-soft p-4">
          <span className="text-sm font-medium text-text">Net pay</span>
          <span className="font-display text-xl font-semibold text-text tabular-nums">103,618.15</span>
        </div>
      </div>
      <div
        data-theme="dark"
        id="demo-slip-panel"
        role="tabpanel"
        aria-labelledby={`demo-slip-${line.key}`}
        className="fb-demo-stage p-5 text-text sm:p-7"
      >
        <div key={line.key} className="fb-demo-unfold">
          <h3 className="flex items-center gap-2 font-semibold text-text">
            <Receipt aria-hidden className="size-5 text-product-text" />
            {line.title}
          </h3>
          <dl className="mt-4 divide-y divide-line text-sm">
            {line.steps.map((step) => (
              <div key={step[0]} className="flex justify-between gap-4 py-2.5">
                <dt className={cn(step[2] ? "font-semibold text-text" : "text-muted")}>{step[0]}</dt>
                <dd className={cn("text-text tabular-nums", step[2] && "font-semibold")}>{step[1]}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-product/50 p-4">
            <span className="text-sm font-medium text-text">{line.label}</span>
            <span className="font-display text-xl font-semibold text-product-text tabular-nums">{`KES ${line.total}`}</span>
          </div>
        </div>
        <p className="mt-4 text-xs text-subtle">
          Illustrative figures for a sample monthly pay. Not advice: real results depend on the rules in
          force.
        </p>
      </div>
    </div>
  );
}

const BANDS = [
  { rate: "10%", top: "24K", width: 16 },
  { rate: "25%", top: "32.3K", width: 12 },
  { rate: "30%", top: "500K", width: 36 },
  { rate: "32.5%", top: "800K", width: 20 },
  { rate: "35%", top: "∞", width: 16 },
];
const RULES = [
  ["PAYE", "Income-tax bands", "bands"],
  ["NSSF", "Tier I and Tier II, matched by the employer", "6%"],
  ["SHIF", "On gross pay, with a minimum", "2.75%"],
  ["Housing Levy", "Employee and employer shares", "1.5%"],
];

/** Payroll rules shown as settings with dates, with the tax bands growing into place. */
function Rules() {
  const { ref, state } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-theme="dark"
      data-reveal-state={state}
      className="fb-demo-stage overflow-hidden rounded-[var(--radius-panel)] p-5 text-text sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-text">
          <BarChart3 aria-hidden className="size-5 text-product-text" />
          Kenya payroll rules
        </p>
        <p className="rounded-full border border-line px-3 py-1 text-xs text-muted">
          Effective-dated · sample view
        </p>
      </div>
      {/* A staircase: each band is wider by its share of pay and taller by its rate. */}
      <div aria-hidden className="mt-6 flex h-24 items-end gap-0.5">
        {BANDS.map((band, i) => (
          <div
            key={band.rate}
            style={
              { width: `${band.width}%`, height: `${40 + i * 15}%`, "--demo-order": i } as React.CSSProperties
            }
            className="fb-demo-band flex items-end justify-center rounded-t-lg bg-product pb-1.5 text-xs font-semibold text-product-ink @lg:text-sm"
          >
            {band.rate}
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1 flex text-[0.7rem] text-subtle">
        {BANDS.map((band) => (
          <span key={band.rate} style={{ width: `${band.width}%` }} className="text-end">
            {band.top}
          </span>
        ))}
      </div>
      <p className="sr-only">
        Income tax rises through five bands: 10%, 25%, 30%, 32.5% and 35% of monthly taxable pay.
      </p>
      <table className="mt-6 w-full text-sm">
        <caption className="sr-only">Sample statutory settings</caption>
        <thead className="text-start text-xs text-subtle">
          <tr>
            <th scope="col" className="py-2 text-start font-normal">
              Rule
            </th>
            <th scope="col" className="hidden py-2 text-start font-normal @lg:table-cell">
              What it covers
            </th>
            <th scope="col" className="py-2 text-end font-normal">
              Rate
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {RULES.map(([name, what, rate]) => (
            <tr key={name}>
              <th scope="row" className="py-2.5 text-start font-medium text-text">
                {name}
              </th>
              <td className="hidden py-2.5 text-muted @lg:table-cell">{what}</td>
              <td className="py-2.5 text-end text-text tabular-nums">{rate}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Caption className="mt-4" />
    </div>
  );
}

const SCREENS = [
  {
    key: "Payslips",
    rows: [
      ["October payslip", "Download"],
      ["September payslip", "Download"],
      ["Annual P9 form", "Download"],
    ],
  },
  {
    key: "Leave",
    rows: [
      ["Annual leave balance", "14 days"],
      ["Request: 5 days", "With manager"],
      ["Sick leave balance", "7 days"],
    ],
  },
  {
    key: "Documents",
    rows: [
      ["Employment contract", "View"],
      ["HR letter", "View"],
      ["Personal details", "Update"],
    ],
  },
];

/** The employee's view in a phone's web browser: the address bar makes the point, there's no app. */
function SelfService() {
  const { ref, state, moving } = useReveal<HTMLDivElement>();
  const { index, choose } = useAutoStep(SCREENS.length, 3400, moving && state === "seen");
  const screen = SCREENS[index]!;
  return (
    <div ref={ref} data-reveal-state={state} className="grid items-center gap-8 @3xl:grid-cols-2">
      <div className="mx-auto w-full max-w-[19rem] rounded-[2.2rem] border border-line-strong bg-surface-2 p-2.5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.5)]">
        <div className="overflow-hidden rounded-[1.8rem] border border-line bg-surface">
          <p className="truncate border-b border-line bg-surface-2 px-4 py-2.5 text-center text-xs text-muted">
            Your company&apos;s ZiraHR, in your browser
          </p>
          <div className="p-4">
            <div
              role="tablist"
              aria-label="Employee self-service"
              className="grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1"
            >
              {SCREENS.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  id={`demo-ess-${i}`}
                  aria-selected={i === index}
                  aria-controls="demo-ess-panel"
                  tabIndex={i === index ? 0 : -1}
                  onClick={() => choose(i)}
                  onKeyDown={(e) => arrows(e, i, SCREENS.length, choose)}
                  className={cn(
                    "min-h-11 rounded-full text-xs transition-colors",
                    i === index ? "bg-product font-medium text-product-ink" : "text-muted hover:text-text",
                  )}
                >
                  {s.key}
                </button>
              ))}
            </div>
            <div
              id="demo-ess-panel"
              role="tabpanel"
              aria-labelledby={`demo-ess-${index}`}
              className="mt-3 min-h-44"
            >
              <ul key={screen.key} className="fb-demo-unfold divide-y divide-line">
                {screen.rows.map(([label, value]) => (
                  <li key={label} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="text-text">{label}</span>
                    <span className="shrink-0 text-xs font-medium text-product-text">{value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div>
        <ul className="space-y-3 text-text">
          {[
            "Works on phone, tablet and desktop",
            "Nothing to download or install",
            "Each employee sees only their own",
          ].map((line) => (
            <li key={line} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-product-soft text-product-text">
                <Check aria-hidden className="size-3" strokeWidth={3} />
              </span>
              {line}
            </li>
          ))}
        </ul>
        <Caption className="mt-5" />
      </div>
    </div>
  );
}

const OUTPUTS: { name: string; when: string; line: string; tags: string[]; icon: LucideIcon }[] = [
  {
    name: "Payslips",
    when: "In self-service",
    line: "Employees view and download every payslip and their pay history in the browser.",
    tags: ["View", "Download", "History"],
    icon: FileText,
  },
  {
    name: "Annual P9 forms",
    when: "Each year",
    line: "Available to each employee alongside their payslips, without asking HR.",
    tags: ["P9", "Self-service"],
    icon: Receipt,
  },
  {
    name: "Payroll reports",
    when: "Once locked",
    line: "Earnings, deductions and approvals from a completed run, for HR and finance.",
    tags: ["Earnings", "Deductions", "Approvals"],
    icon: BarChart3,
  },
  {
    name: "Cost reviews",
    when: "Any time",
    line: "See payroll costs across branches, departments and projects.",
    tags: ["Branches", "Departments", "Projects"],
    icon: Wallet,
  },
];

/** A completed run feeding four outputs: the signal line branches into each card. */
function Outputs() {
  const { ref, state } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-reveal-state={state}
      data-theme="dark"
      className="fb-demo-stage rounded-[var(--radius-panel)] p-5 text-text sm:p-8"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-text">
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-product text-product-ink">
          <Check className="size-4" />
        </span>
        November pay run, locked
      </p>
      <span aria-hidden className="ms-3.5 block h-5 w-0.5 bg-product" />
      <ul className="grid gap-3 border-t-2 border-product pt-4 @2xl:grid-cols-2">
        {OUTPUTS.map((output, i) => {
          const Icon = output.icon;
          return (
            <li
              key={output.name}
              style={{ "--demo-order": i } as React.CSSProperties}
              className="fb-demo-card rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-product/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2.5 font-semibold text-text">
                  <Icon aria-hidden className="size-5 text-product" />
                  {output.name}
                </h3>
                <span className="rounded-full border border-product/40 px-2.5 py-0.5 text-xs text-text">
                  {output.when}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">{output.line}</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {output.tags.map((tag) => (
                  <li key={tag} className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs text-text">
                    {tag}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <Caption className="mt-4" />
    </div>
  );
}

const ROUTES = {
  single: { label: "Single stage", steps: ["Line manager"] },
  multi: { label: "Multi-stage", steps: ["Line manager", "HR"] },
} as const;

/** Try the approval yourself: choose a route, approve each step, watch the balance update. */
function LeaveFlow() {
  const [route, setRoute] = useState<keyof typeof ROUTES>("multi");
  const [approved, setApproved] = useState(0);
  const steps = ROUTES[route].steps;
  const done = approved >= steps.length;
  const balance = done ? 11 : 14;
  return (
    <div className="grid gap-5 @3xl:grid-cols-12">
      <div className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6 @3xl:col-span-5">
        <p className="truncate rounded-full bg-surface-2 px-3 py-1.5 text-center text-xs text-muted">
          Your company&apos;s ZiraHR, in your browser
        </p>
        <h3 className="mt-4 font-semibold text-text">Annual leave request</h3>
        <dl className="mt-2 divide-y divide-line text-sm">
          {[
            ["From", "Thu 24 Dec"],
            ["To", "Tue 29 Dec"],
            ["Days counted", "3"],
          ].map(([term, value]) => (
            <div key={term} className="flex justify-between py-2">
              <dt className="text-muted">{term}</dt>
              <dd className="font-medium text-text">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-subtle">The weekend and public holidays aren&apos;t counted.</p>
        <div
          className="mt-4 flex items-center justify-between rounded-2xl bg-product-soft p-4"
          aria-live="polite"
        >
          <span className="text-sm font-medium text-text">Annual leave balance</span>
          <span
            className="font-display text-2xl font-semibold text-text tabular-nums"
            data-testid="leave-balance"
          >
            {done && <span className="me-2 text-base font-normal text-muted line-through">14</span>}
            {balance}
          </span>
        </div>
      </div>
      <div
        data-theme="dark"
        className="fb-demo-stage rounded-[var(--radius-panel)] p-5 text-text sm:p-6 @3xl:col-span-7"
      >
        <div
          role="group"
          aria-label="Approval route"
          className="inline-flex gap-1 rounded-full border border-line bg-surface p-1"
        >
          {(Object.keys(ROUTES) as (keyof typeof ROUTES)[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={route === key}
              onClick={() => {
                setRoute(key);
                setApproved(0);
              }}
              className={cn(
                "min-h-11 rounded-full px-4 text-sm transition-colors",
                route === key ? "bg-product font-medium text-product-ink" : "text-muted hover:text-text",
              )}
            >
              {ROUTES[key].label}
            </button>
          ))}
        </div>
        <ol className="mt-5 space-y-0">
          <li className="flex items-center gap-3 py-2 text-sm text-text">
            <CircleCheck aria-hidden className="size-6 text-product" />
            Request submitted
          </li>
          {steps.map((step, i) => {
            const isDone = i < approved;
            return (
              <li key={step} className="flex items-center gap-3 py-2 text-sm">
                {isDone ? (
                  <CircleCheck aria-hidden className="size-6 text-product" />
                ) : (
                  <CircleDashed
                    aria-hidden
                    className={cn("size-6", i === approved ? "text-text" : "text-subtle")}
                  />
                )}
                <span className={cn(isDone || i === approved ? "text-text" : "text-muted")}>{step}</span>
                <span className="ms-auto text-xs text-muted">
                  {isDone ? "Approved" : i === approved ? "Waiting" : "Next"}
                </span>
              </li>
            );
          })}
          <li className="flex items-center gap-3 py-2 text-sm">
            {done ? (
              <CircleCheck aria-hidden className="size-6 text-product" />
            ) : (
              <CircleDashed aria-hidden className="size-6 text-subtle" />
            )}
            <span className={done ? "font-medium text-text" : "text-muted"}>
              {done ? "Approved. Balance updated." : "Balance updates when approved"}
            </span>
          </li>
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {done ? (
            <button type="button" onClick={() => setApproved(0)} className={buttonClasses("secondary", "md")}>
              Try it again
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setApproved((a) => a + 1)}
              className={buttonClasses("product", "md")}
            >
              {`Approve as ${steps[approved]}`}
            </button>
          )}
        </div>
        <Caption className="mt-4" />
      </div>
    </div>
  );
}

const DECEMBER_START = 2; // 1 December 2026 is a Tuesday (Sunday = 0).
const HOLIDAYS: Record<number, string> = { 12: "Jamhuri Day", 25: "Christmas Day", 26: "Boxing Day" };
const isWeekend = (day: number) => {
  const weekday = (DECEMBER_START + day - 1) % 7;
  return weekday === 0 || weekday === 6;
};
const TEAM = [
  { name: "Wanjiru K.", type: "Annual", from: 21, to: 31 },
  { name: "Otieno P.", type: "Annual", from: 14, to: 18 },
  { name: "Achieng L.", type: "Sick", from: 2, to: 4 },
  { name: "Mutua J.", type: "Annual", from: 16, to: 22 },
  { name: "Njeri M.", type: "Study", from: 7, to: 8 },
];
const countedDays = (from: number, to: number) => {
  let count = 0;
  for (let day = from; day <= to; day++) if (!isWeekend(day) && !HOLIDAYS[day]) count++;
  return count;
};
const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

/** Who's out, at a glance. Choose someone to see what's counted and who overlaps. */
function TeamCalendar() {
  const { ref, state } = useReveal<HTMLDivElement>();
  const [index, setIndex] = useState(0);
  const person = TEAM[index]!;
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const left = person.to - person.from + 1 - countedDays(person.from, person.to);
  const overlap = TEAM.filter(
    (other) => other !== person && other.from <= person.to && other.to >= person.from,
  ).map((other) => other.name);
  const columns = { gridTemplateColumns: "6.5rem repeat(31, minmax(1.45rem, 1fr))" };
  return (
    <div
      ref={ref}
      data-reveal-state={state}
      className="fb-panel overflow-hidden rounded-[var(--radius-panel)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <p className="font-semibold text-text">
          Finance team <span className="ms-1 text-sm font-normal text-muted">December · Kenya holidays</span>
        </p>
      </div>
      {/* Scrolls sideways on small screens, inside its own frame. */}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Team calendar, December">
        <div className="min-w-[52rem] px-3 py-3">
          <div
            aria-hidden
            className="grid items-end pb-2 text-center text-[0.7rem] text-subtle"
            style={columns}
          >
            <span />
            {days.map((day) => (
              <span key={day} className={cn(HOLIDAYS[day] && "font-semibold text-product-text")}>
                <span className="block">{WEEKDAY[(DECEMBER_START + day - 1) % 7]}</span>
                {day}
              </span>
            ))}
          </div>
          <div role="tablist" aria-label="Team members" aria-orientation="vertical">
            {TEAM.map((member, i) => (
              <div key={member.name} className="grid items-center border-t border-line" style={columns}>
                <button
                  type="button"
                  role="tab"
                  id={`demo-cal-${i}`}
                  aria-selected={i === index}
                  aria-controls="demo-cal-panel"
                  tabIndex={i === index ? 0 : -1}
                  onClick={() => setIndex(i)}
                  onKeyDown={(e) => arrows(e, i, TEAM.length, setIndex)}
                  className={cn(
                    "min-h-11 truncate rounded-lg px-2 text-start text-sm",
                    i === index ? "bg-product-soft font-medium text-text" : "text-muted hover:text-text",
                  )}
                >
                  {member.name}
                </button>
                {days.map((day) => {
                  const on = day >= member.from && day <= member.to;
                  const off = isWeekend(day) || HOLIDAYS[day];
                  return (
                    <span
                      aria-hidden
                      key={day}
                      className={cn(
                        "h-11 border-s border-line/50",
                        off && !on && "bg-surface-2",
                        on && !off && (i === index ? "bg-product" : "bg-product/45"),
                        on && off && "bg-product/15",
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div
        id="demo-cal-panel"
        role="tabpanel"
        aria-labelledby={`demo-cal-${index}`}
        aria-live="polite"
        className="grid gap-4 border-t border-line p-5 @3xl:grid-cols-2"
      >
        <p className="text-sm text-text" data-testid="calendar-summary">
          <strong>{`${person.name}: ${countedDays(person.from, person.to)} days counted`}</strong>
          <span className="text-muted">{` (${person.type.toLowerCase()} leave, ${person.from} to ${person.to} December${
            left ? `; ${left} weekend or holiday days aren't counted` : ""
          }).`}</span>
          {overlap.length > 0 && (
            <span className="mt-1.5 block text-muted">{`Overlaps with ${overlap.join(" and ")}: flagged before approval.`}</span>
          )}
        </p>
        <div className="text-xs text-subtle">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(HOLIDAYS).map(([day, name]) => (
              <li key={day}>{`${day} Dec: ${name}`}</li>
            ))}
          </ul>
          <Caption className="mt-2" />
        </div>
      </div>
    </div>
  );
}

export function ProductDemo({ demo, motion }: { demo: DemoKind; motion?: StoryMotion }) {
  switch (demo) {
    case "connected_modules":
      return <ConnectedModules />;
    case "pay_run":
      return <PayRun />;
    case "payslip":
      return <Payslip />;
    case "rules":
      return <Rules />;
    case "self_service":
      return <SelfService />;
    case "outputs":
      return <Outputs />;
    case "leave_flow":
      return <LeaveFlow />;
    case "team_calendar":
      return <TeamCalendar />;
    case "scattered_to_connected":
      return <ScatteredToConnectedStory motion={motion} />;
    case "employee_journey":
      return <EmployeeJourneyStory motion={motion} />;
  }
}

export interface ModuleItem {
  title: string;
  headline?: string | null;
  body: string;
  bullets?: string[];
  availability?: "available" | "planned";
  cta?: { label: string; href: string } | null;
}

/**
 * The module catalogue: a list and one open module, so eight modules read as
 * one calm section. Every module's content is in the server HTML. Stacked on
 * small screens, with the list scrolling sideways.
 */
export function ModuleCatalogue({
  items,
  plannedLabel,
  preview,
}: {
  items: ModuleItem[];
  plannedLabel: string;
  /** Studio previews show buttons without leaving the page. */
  preview?: boolean;
}) {
  const [index, setIndex] = useState(0);
  return (
    <div className="grid gap-5 @3xl:grid-cols-12 @3xl:gap-8">
      <div
        role="tablist"
        aria-label="Modules"
        aria-orientation="vertical"
        className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto pb-1 @3xl:col-span-4 @3xl:flex-col @3xl:overflow-visible @3xl:pb-0"
      >
        {items.map((item, i) => (
          <button
            key={item.title}
            type="button"
            role="tab"
            id={`module-tab-${i}`}
            aria-selected={i === index}
            aria-controls={`module-panel-${i}`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => setIndex(i)}
            onKeyDown={(e) => arrows(e, i, items.length, setIndex)}
            className={cn(
              "flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-start text-sm whitespace-nowrap transition-colors @3xl:whitespace-normal",
              i === index
                ? "border-product/60 bg-product-soft font-medium text-text"
                : "border-transparent text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            {item.title}
            {item.availability === "planned" && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[0.7rem] font-normal text-muted">
                {plannedLabel}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="@3xl:col-span-8">
        {items.map((item, i) => (
          <div
            key={item.title}
            id={`module-panel-${i}`}
            role="tabpanel"
            aria-labelledby={`module-tab-${i}`}
            hidden={i !== index}
            className="fb-panel rounded-[var(--radius-panel)] p-6 sm:p-8"
          >
            <div className="fb-demo-unfold">
              <h3 className="font-display text-title font-semibold text-text">
                {item.headline || item.title}
              </h3>
              <p className="mt-2 text-muted">{item.body}</p>
              {item.bullets && item.bullets.length > 0 && (
                <ul className="mt-5 grid gap-x-6 gap-y-2.5 text-sm text-text @xl:grid-cols-2">
                  {item.bullets
                    .filter((bullet) => bullet.trim())
                    .map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-product-soft text-product-text">
                          <Check aria-hidden className="size-3" strokeWidth={3} />
                        </span>
                        {bullet}
                      </li>
                    ))}
                </ul>
              )}
              {item.availability === "planned" && (
                <p className="mt-5 text-sm text-muted">
                  This module is planned. Ask us what&apos;s available for your organisation today.
                </p>
              )}
              {item.cta && (
                <div className="mt-6">
                  {preview ? (
                    <span className={buttonClasses("product", "lg")} title={item.cta.href}>
                      {item.cta.label}
                    </span>
                  ) : (
                    <a href={item.cta.href} className={buttonClasses("product", "lg")}>
                      {item.cta.label}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
