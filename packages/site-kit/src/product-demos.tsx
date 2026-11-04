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

/*
 * Interactive product demonstrations for product website pages (P14-W), chosen
 * in the page builder like any block. Original ZiraHR art direction: a single
 * "signal line" connecting everything, in the website's product colour. Each
 * demo moves differently and only when it comes into view. Figures are
 * synthetic and labelled. The payslip and rules match the engine's own test
 * (`matches_the_illustrative_payslip_on_the_website`), so they can't drift
 * silently from the calculator.
 */

export type DemoKind = "connected_modules" | "pay_run" | "payslip" | "rules" | "self_service";

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
  const list = (event.currentTarget as HTMLElement).parentElement;
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

export function ProductDemo({ demo }: { demo: DemoKind }) {
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
