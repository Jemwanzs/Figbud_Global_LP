"use client";

import { buttonClasses, cn } from "@figbud/ui";
import { Check } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, type ReactNode, useSyncExternalStore } from "react";

import { DemoControl, useAutoDemo } from "./auto-demo";
import { Meter, Rows, Ticks, useScrollStory } from "./scroll-story";
import { ZIRAHR_MODULES, type ZiraModuleKey } from "./zirahr-modules";

/*
 * "Choose a module" as a guided tour (owner's brief, 11 Nov 2026), for this
 * section only: the rest of the page scrolls as before.
 *
 * - Wide screens: once its heading has passed, the section pins below the
 *   header and scrolling moves it through the modules (about a fifth of a
 *   screen each), then releases into the next section; scrolling up goes
 *   back. A tab jumps to its module, and "Skip the tour" leaves.
 * - Phones: nothing pins; the modules play by themselves on the shared
 *   demonstration clock while the section is in view (a choice made by hand
 *   holds, pause stops it), and the tabs scroll sideways.
 * - Each module shows its words beside a compact demonstration of what it
 *   does, whose lines arrive one after another. Synthetic data, labelled.
 *
 * Every module's words stay in the server HTML (hidden panels), so the
 * section reads in full to search engines and assistive technology.
 */

export interface TourItem {
  title: string;
  headline?: string | null;
  body: string;
  bullets?: string[];
  availability?: "available" | "planned";
  cta?: { label: string; href: string } | null;
}

/** A module's catalogue key from its title in the Studio, if it's one of the eight. */
function moduleKey(title: string): ZiraModuleKey | null {
  const t = title.toLowerCase();
  const rules: [RegExp, ZiraModuleKey][] = [
    [/core hr|employee 360/, "core_hr"],
    [/payroll/, "payroll"],
    [/leave/, "leave"],
    [/attendance|time &/, "attendance"],
    [/performance/, "performance"],
    [/team|collaboration/, "teams"],
    [/recruit/, "recruitment"],
    [/learning|training/, "learning"],
  ];
  return rules.find(([pattern]) => pattern.test(t))?.[1] ?? null;
}

/** Compact demonstrations, one per module; the same sample employee as the stories. */
const PREVIEWS: Record<ZiraModuleKey, { title: string; body: ReactNode }> = {
  core_hr: {
    title: "Amani W. · Employee 360",
    body: (
      <Rows
        rows={[
          ["Department", "Finance"],
          ["Contract", "Permanent · on file"],
          ["Probation", "Completed"],
          ["Documents", "ID, PIN certificate, contract"],
        ]}
      />
    ),
  },
  payroll: {
    title: "November payslip",
    body: (
      <Rows
        rows={[
          ["Gross pay", "150,000.00"],
          ["Statutory deductions", "−12,855.00"],
          ["PAYE", "−33,526.85"],
          ["Net pay", "103,618.15", true],
        ]}
      />
    ),
  },
  leave: {
    title: "Annual leave · 3 days",
    body: (
      <Ticks
        items={[
          ["Requested in self-service", true],
          ["Balance and overlaps checked", true],
          ["Approved by the manager", true],
          ["Balance updated: 14 → 11 days", true],
        ]}
      />
    ),
  },
  attendance: {
    title: "Today",
    body: (
      <Rows
        rows={[
          ["Clocked in", "08:02 · location checked"],
          ["Shift", "08:00 to 17:00"],
          ["Overtime", "2 h · approved"],
          ["Sent to payroll", "Yes", true],
        ]}
      />
    ),
  },
  performance: {
    title: "Goals and reviews",
    body: (
      <>
        <Meter label="Quarterly goal" value={70} />
        <Meter label="Review progress" value={50} />
        <Ticks items={[["Mid-year review shared", true]]} />
      </>
    ),
  },
  teams: {
    title: "Finance team",
    body: (
      <Ticks
        items={[
          ["Month-end close · done", true],
          ["Supplier reconciliation · done", true],
          ["Board pack draft · due Friday", false],
        ]}
      />
    ),
  },
  recruitment: {
    title: "Applicant pipeline",
    body: (
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[0.68rem] @lg:text-xs">
        {["Applied", "Interview", "Offer"].map((column, i) => (
          <div key={column} className="rounded-xl bg-surface-2 p-2">
            <p className="text-subtle">{column}</p>
            <p
              className={cn(
                "mt-2 truncate rounded-lg px-2 py-2",
                i === 2 ? "bg-product font-medium text-product-ink" : "bg-surface text-muted",
              )}
            >
              {i === 2 ? "Amani W." : "Candidate"}
            </p>
          </div>
        ))}
      </div>
    ),
  },
  learning: {
    title: "Learning plan",
    body: (
      <>
        <Meter label="Statutory payroll course" value={45} />
        <Meter label="Spreadsheet skills" value={80} />
        <Ticks items={[["Certificate on file", true]]} />
      </>
    ),
  },
};

const WIDE = "(min-width: 64rem)";
function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

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

export function ModuleTour({ items, plannedLabel }: { items: TourItem[]; plannedLabel: string }) {
  const count = items.length;
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
  const story = useScrollStory(count);
  // Wide screens are driven by scrolling, so the clock stays out of it there.
  const demo = useAutoDemo<HTMLDivElement>({ durations: items.map(() => 4500), passes: wide ? 0 : 1 });
  // One control at a time: scrolling on wide screens, the clock on phones.
  const index = wide ? story.step : demo.index;
  const choose = (i: number) => (wide ? story.goTo(i) : demo.choose(i));

  return (
    <div
      ref={(el) => {
        story.root.current = el;
        demo.ref.current = el;
      }}
      data-module-tour=""
      data-step={index}
      style={{ "--story-steps": count, "--story-progress": 0 } as CSSProperties}
      className="relative"
    >
      <div className="fb-tour-pin py-2 lg:sticky lg:top-[var(--story-top,4.5rem)]">
        <div className="grid gap-5 @3xl:grid-cols-12 @3xl:gap-8">
          <div className="min-w-0 @3xl:col-span-4">
            <div
              role="tablist"
              aria-label="Modules"
              aria-orientation="vertical"
              className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto pb-1 @3xl:flex-col @3xl:overflow-visible @3xl:pb-0"
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
                  onClick={() => choose(i)}
                  onKeyDown={(e) => arrows(e, i, count, choose)}
                  className={cn(
                    "relative flex min-h-11 shrink-0 items-center justify-between gap-3 overflow-hidden rounded-xl border px-3.5 py-2 text-start text-sm whitespace-nowrap transition-colors duration-300 @3xl:whitespace-normal",
                    i === index
                      ? "border-product/60 bg-product-soft font-medium text-text"
                      : i < index
                        ? "border-transparent text-text hover:bg-surface-2"
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
            {/* Where the tour is, and a way out of it. */}
            <div className="mt-3 flex items-center gap-3">
              <span className="font-mono text-sm text-product-text tabular-nums">
                {`${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`}
              </span>
              <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                <span
                  className="block h-full origin-left rounded-full bg-product transition-transform duration-500 ease-out motion-reduce:transition-none rtl:origin-right"
                  style={{ transform: `scaleX(${(index + 1) / count})` }}
                />
              </span>
              {wide ? (
                <button
                  type="button"
                  onClick={story.leave}
                  className="fb-tour-skip inline-flex min-h-11 items-center rounded-full px-1 text-sm text-muted underline underline-offset-4 hover:text-text focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
                >
                  Skip the tour
                </button>
              ) : (
                <DemoControl state={demo.state} onToggle={demo.toggle} />
              )}
            </div>
          </div>

          {/* Every panel shares one cell, so the section is always as tall as the tallest
              module: nothing below moves as the tour changes module (or the theme). */}
          <div className="grid min-w-0 @3xl:col-span-8">
            {items.map((item, i) => {
              const key = moduleKey(item.title);
              const preview = key ? PREVIEWS[key] : null;
              const Icon = key ? ZIRAHR_MODULES.find((m) => m.key === key)!.icon : null;
              return (
                <div
                  key={item.title}
                  id={`module-panel-${i}`}
                  role="tabpanel"
                  aria-labelledby={`module-tab-${i}`}
                  inert={i !== index}
                  className={cn(
                    "fb-panel @container rounded-[var(--radius-panel)] p-5 [grid-area:1/1] sm:p-6",
                    i !== index && "invisible",
                  )}
                >
                  <div
                    // Remounted as it opens, so its lines arrive afresh each time.
                    key={i === index ? "open" : "closed"}
                    className={cn(
                      "fb-demo-unfold grid gap-5",
                      preview && "@2xl:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] @2xl:items-start",
                    )}
                  >
                    <div className="min-w-0">
                      <h3 className="font-display text-title font-semibold text-text">
                        {item.headline || item.title}
                      </h3>
                      <p className="mt-2 text-muted">{item.body}</p>
                      {item.bullets && item.bullets.length > 0 && (
                        <ul className="mt-4 grid gap-2 text-sm text-text">
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
                        <p className="mt-4 text-sm text-muted">
                          This module is planned. Ask us what&apos;s available for your organisation today.
                        </p>
                      )}
                      {item.cta && (
                        <a href={item.cta.href} className={buttonClasses("product", "md", "mt-5")}>
                          {item.cta.label}
                        </a>
                      )}
                    </div>
                    {preview && (
                      // The words say it; the picture shows it, so it isn't read out.
                      <figure
                        aria-hidden
                        data-module-preview={key}
                        data-tone="inverse"
                        className="fb-demo-stage fb-tour-preview @container rounded-2xl p-4 text-text"
                      >
                        <div className="flex items-center gap-2">
                          {Icon && (
                            <span className="grid size-7 place-items-center rounded-lg bg-product text-product-ink">
                              <Icon className="size-4" />
                            </span>
                          )}
                          <p className="truncate text-sm font-semibold">{preview.title}</p>
                        </div>
                        {preview.body}
                        <figcaption className="mt-3 text-[0.68rem] text-subtle">
                          Illustrative · synthetic data
                        </figcaption>
                      </figure>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* The scrolling the tour needs on wide screens: pinned over it, then released. */}
      <div aria-hidden data-runway="" className="fb-modules-runway hidden lg:block" />
    </div>
  );
}
