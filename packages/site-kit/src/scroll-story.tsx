"use client";

import { cn } from "@figbud/ui";
import {
  BookOpen,
  CalendarCheck,
  Check,
  CalendarDays,
  Clock,
  FileSpreadsheet,
  FileText,
  Mail,
  MessageCircle,
  type LucideIcon,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import { ZIRAHR_MODULES, ZIRAHR_SELF_SERVICE } from "./zirahr-modules";

/*
 * Signature scroll stories (UI-MO6; made compact on the owner's brief of 7 Nov
 * 2026). One panel stays in view while the page scrolls: the step's words on
 * one side, the product visual on the other (stacked on phones), both driven
 * by the same scroll position, so they always change together and reverse
 * together. Each step after the first adds about a third of a screen of
 * scrolling, no more. Nothing intercepts the wheel or touch, and the dots
 * jump to a step.
 *
 * The steps are ordinary text in the server's HTML: without JavaScript they
 * read as a list (`scripting: none` in the styles). The visual's states are
 * transforms, opacity or stroke offsets, still with reduced motion.
 */

export type StoryMotion = "standard" | "subtle" | "off";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Where the pinned panel rests and how far the page scrolls while it does.
 * The panel is as tall as its content and rests centred in the space below
 * the website's header (never above it); the spacer after it (`[data-runway]`)
 * is the scrolling the steps need, so it releases right after the last one.
 */
function geometry(el: HTMLElement, tallest?: { current: number }) {
  // Clear of the website's header, which takes two rows on phones.
  const header = document.querySelector("header")?.offsetHeight ?? 64;
  // The tallest the panel has been at this size: steps differ in height, and
  // a resting place that moved with each one could pull the page a step back.
  const stage = pinned(el);
  let pin = stage?.offsetHeight ?? 0;
  if (tallest) pin = tallest.current = Math.max(tallest.current, pin);
  // Where the heading scrolls by above the stage (phones), the pinned
  // stretch starts that much further down.
  const before = stage && stage !== el.firstElementChild ? stage.previousElementSibling : null;
  const offset = before instanceof HTMLElement ? before.offsetHeight : 0;
  const top = Math.max(header, Math.round((window.innerHeight + header - pin) / 2));
  const travel = Math.max(1, el.querySelector<HTMLElement>("[data-runway]")?.offsetHeight ?? 0);
  return { top, travel, offset };
}

/**
 * The element that stays in view: the panel, or, where the heading travels
 * with it but there isn't room for both (phones, short screens), the stage
 * alone (the panel is then `display: contents` and the heading scrolls by).
 */
function pinned(el: HTMLElement) {
  const panel = el.firstElementChild as HTMLElement | null;
  if (panel && window.getComputedStyle(panel).display === "contents") {
    return panel.querySelector<HTMLElement>("[data-stage-pin]");
  }
  return panel;
}

/** How long each step shows while a fast scroll catches up, one at a time. */
const STEP_MS = 110;

/**
 * Follows the page's scroll with passive listeners and one write per frame:
 * which of `count` steps the pinned stretch is at. Shared by the stories and
 * the module showcase (pin, progress, complete, release).
 */
export function useScrollStory(count: number) {
  const root = useRef<HTMLDivElement>(null);
  // Where the scroll position is, and the step on show, which follows it one
  // step at a time, so a fast flick still passes through every step, in
  // either direction (owner's brief, 12 Nov 2026), never jumping several.
  const [target, setTarget] = useState(0);
  const [step, setStep] = useState(0);
  const [onScreen, setOnScreen] = useState(false);
  const tallest = useRef(0);
  const remeasure = useRef<() => void>(() => {});
  // A step the visitor chose (a dot or tab): shown at once, and the page is
  // taken all the way to it, unless they scroll, touch or type meanwhile.
  const chosen = useRef<number | null>(null);

  // Each step shown can change the panel's height: measure again, so where the
  // page rests always matches the step (not only when the page scrolls).
  useEffect(() => {
    if (onScreen) remeasure.current();
  }, [step, onScreen]);

  useEffect(() => {
    if (step === target) return;
    const instant = !onScreen || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      () => setStep((s) => (instant ? target : s + Math.sign(target - s))),
      instant ? 0 : STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [step, target, onScreen]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const { top, travel, offset } = geometry(el, tallest);
      el.style.setProperty("--story-top", `${top}px`);
      // How far through the pinned stretch: 0 as the panel settles, 1 as it leaves.
      const progress = clamp((top - offset - el.getBoundingClientRect().top) / travel);
      el.style.setProperty("--story-progress", progress.toFixed(3));
      if (chosen.current === null) setTarget(Math.min(count - 1, Math.floor(progress * count)));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    remeasure.current = schedule;
    const resized = () => {
      tallest.current = 0;
      schedule();
    };
    // The visitor taking over ends a chosen step's journey.
    // (Keys inside the story are its own controls choosing a step.)
    const takeOver = (event: Event) => {
      if (event.type === "keydown" && el.contains(event.target as Node)) return;
      chosen.current = null;
    };
    const inputs = ["wheel", "touchstart", "keydown"] as const;
    for (const type of inputs) window.addEventListener(type, takeOver, { passive: true });
    // Only listens while the story is on screen.
    const visibility = new IntersectionObserver(([entry]) => {
      const visible = Boolean(entry?.isIntersecting);
      setOnScreen(visible);
      if (visible) {
        measure();
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", resized, { passive: true });
      } else {
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", resized);
      }
    });
    visibility.observe(el);
    return () => {
      visibility.disconnect();
      remeasure.current = () => {};
      for (const type of inputs) window.removeEventListener(type, takeOver);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resized);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [count]);

  /** Scrolls to the middle of a step's stretch (the dots). */
  const goTo = (i: number) => {
    const el = root.current;
    if (!el) return;
    const { top, travel, offset } = geometry(el, tallest);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const y = el.getBoundingClientRect().top + window.scrollY + offset - top + travel * ((i + 0.5) / count);
    chosen.current = i;
    setTarget(i);
    setStep(i);
    // Where the smooth scroll ends (or stops short, as one can when the page
    // changes under it), finish at the chosen step, then follow the scroll again.
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      window.removeEventListener("scrollend", settle);
      if (chosen.current !== i) return;
      if (Math.abs(window.scrollY - y) > 2) window.scrollTo({ top: y, behavior: "auto" });
      chosen.current = null;
      remeasure.current();
    };
    window.addEventListener("scrollend", settle);
    // Browsers without `scrollend`, or a scroll that doesn't move at all.
    window.setTimeout(settle, reduced ? 50 : 1200);
    window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
  };

  /** Scrolls just past the pinned stretch (the "skip" control). */
  const leave = () => {
    const el = root.current;
    if (!el) return;
    // Leaving ends any chosen step's journey, so nothing pulls the page back.
    chosen.current = null;
    const header = document.querySelector("header")?.offsetHeight ?? 64;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: el.getBoundingClientRect().bottom + window.scrollY - header,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  return { root, step, onScreen, goTo, leave };
}

/** The step's words beside (or beneath, on phones) the visual, in one panel that stays in view. */
function ScrollStory({
  steps,
  motion,
  label,
  fit = "stage",
  intro,
  children,
}: {
  steps: { title: string; body: string }[];
  motion: StoryMotion;
  label: string;
  /**
   * The section's heading and lead, pinned with the story so they stay
   * together while it plays (owner's brief, 12 Nov 2026: no gap opening
   * between the heading and the story as the page scrolls).
   */
  intro?: ReactNode;
  /**
   * "stage": a sized stage, for visuals placed in it (pieces flying in from
   * set points); "content": as tall as its content (owner's brief, 11 Nov
   * 2026: no oversized panels).
   */
  fit?: "stage" | "content";
  children: (state: { step: number; onScreen: boolean }) => ReactNode;
}) {
  const count = steps.length;
  const { root, step, onScreen, goTo } = useScrollStory(count);
  return (
    <div
      ref={root}
      data-story={label}
      data-motion={motion}
      data-step={step}
      style={{ "--story-progress": 0, "--story-steps": count } as CSSProperties}
      className="fb-story relative"
    >
      <div className="fb-story-pin sticky top-[var(--story-top,4.5rem)] flex flex-col gap-4 py-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-12 lg:gap-y-8 lg:py-4">
        {intro && <div className="fb-story-intro lg:col-span-12">{intro}</div>}
        {/* Compact: about 46rem at most, beside the words; the full width on phones. */}
        <div className="w-full lg:order-2 lg:col-span-7 lg:ms-auto lg:max-w-[46rem]">
          {/* The steps say all of this in words, so the picture isn't read out. */}
          <div
            aria-hidden
            data-tone="inverse"
            data-fit={fit}
            className={cn(
              "fb-demo-stage relative overflow-hidden rounded-[var(--radius-panel)] text-text",
              fit === "stage"
                ? intro
                  ? // Room for the heading above it in the same pinned panel.
                    "fb-story-stage h-[min(42svh,20rem)] min-h-56 lg:h-[min(24rem,calc(100svh-19rem))]"
                  : "fb-story-stage h-[min(42svh,20rem)] min-h-56 lg:h-[min(26rem,calc(100svh-11rem))]"
                : "@container",
            )}
          >
            {children({ step, onScreen })}
          </div>
          <p className="mt-2 text-xs text-subtle">Illustrative product activity · synthetic data</p>
        </div>
        {/* Centred against the picture beside it (owner's brief, 13 Nov 2026). */}
        <div className="lg:order-1 lg:col-span-5 lg:self-center">
          {/* Where the story is: the current step, and a dot for each that jumps to it. */}
          <div className="fb-story-nav mb-4 flex items-center gap-3">
            <span className="font-mono text-sm text-product-text tabular-nums">
              {String(step + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
            </span>
            <span className="flex gap-1.5">
              {steps.map((item, i) => (
                <button
                  key={item.title}
                  type="button"
                  aria-label={`Step ${i + 1}: ${item.title}`}
                  aria-current={i === step ? "step" : undefined}
                  onClick={() => goTo(i)}
                  className="grid size-6 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-[width,background-color] duration-[var(--motion-base)]",
                      i === step ? "w-5 bg-product" : "w-1.5 bg-line-strong",
                    )}
                  />
                </button>
              ))}
            </span>
          </div>
          <ol className="fb-story-steps grid">
            {steps.map((item, i) => (
              <li
                key={item.title}
                data-story-step={i}
                data-place={i === step ? "current" : i < step ? "past" : "next"}
                aria-current={i === step ? "step" : undefined}
                className="fb-story-step [grid-area:1/1]"
              >
                <span className="mb-3 block h-0.5 w-10 bg-product" />
                <h3 className="font-display text-title font-semibold text-text">{item.title}</h3>
                <p className="mt-3 max-w-prose text-muted">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {/* The scrolling the steps need: the panel stays pinned over it, then lets go. */}
      <div aria-hidden data-runway="" className="fb-story-runway" />
    </div>
  );
}

/* ------------------------------------------- scattered tools to one platform */

const TOOLS: { name: string; note: string; icon: LucideIcon; scattered: [number, number, number] }[] = [
  { name: "payroll_final_v7.xlsx", note: "Which version?", icon: FileSpreadsheet, scattered: [24, 18, -7] },
  { name: "Re: leave request", note: "Still waiting", icon: Mail, scattered: [74, 15, 5] },
  { name: "Contract, scanned", note: "In whose folder?", icon: FileText, scattered: [17, 56, 4] },
  { name: "Who approved this?", note: "Team chat", icon: MessageCircle, scattered: [80, 54, -5] },
  { name: "Who's out on Friday?", note: "Wall calendar", icon: CalendarDays, scattered: [47, 84, 3] },
];
// The five scattered tools settle as the first five modules of the shared catalogue.
const MODULES = ZIRAHR_MODULES.slice(0, 5).map((m) => m.label);
const PAY_STAGES = ["Draft", "Validated", "Approved", "Locked"];
const TRAIL = [
  ["Inputs validated", "HR"],
  ["Run approved", "Finance"],
  ["Payroll locked", "Finance"],
];
// What one record holds, across the modules (owner's brief, 11 Nov 2026: the
// record shows more of ZiraHR, compactly). Synthetic, labelled on the page.
const ACTIVITY = [
  ["Leave request approved", "Manager · 3 days"],
  ["Course completed", "Learning · Payroll basics"],
  ["Team update shared", "Teams · Finance"],
];

function toolStyle(index: number, step: number): CSSProperties {
  const [x, y, turn] = TOOLS[index]!.scattered;
  // Scattered, then drawn in, then settled as the platform's modules along the top.
  const at =
    step === 0
      ? { x, y, turn, scale: 1 }
      : step === 1
        ? { x: 50 + (x - 50) * 0.72, y: 50 + (y - 50) * 0.8, turn: 0, scale: 0.92 }
        : { x: 12 + index * 19, y: 9, turn: 0, scale: 0.9 };
  return {
    transform: `translate(calc(${at.x} * 1cqw - 50%), calc(${at.y} * 1cqh - 50%)) rotate(${at.turn}deg) scale(${at.scale})`,
    transitionDelay: `${index * 45}ms`,
  };
}

function ScatteredStage({ step, onScreen, mark }: { step: number; onScreen: boolean; mark?: ReactNode }) {
  const [stage, setStage] = useState(0);
  const running = step === 3 && onScreen;
  // The pay run moves on by itself once it's reached, and stops at Locked.
  useEffect(() => {
    if (!running || stage >= PAY_STAGES.length - 1) return;
    const id = window.setTimeout(() => setStage((s) => s + 1), 1300);
    return () => window.clearTimeout(id);
  }, [running, stage]);

  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        {TOOLS.map((tool, i) => (
          <path
            key={tool.name}
            d={`M${50 + (tool.scattered[0] - 50) * 0.72} ${50 + (tool.scattered[1] - 50) * 0.8} L 50 50`}
            pathLength={1}
            className="fb-story-path"
            // Drawn while "drawing together" is the step (the second quarter of the story).
            style={{ "--path-start": 0.24 + i * 0.03 } as CSSProperties}
          />
        ))}
      </svg>

      <div
        data-open={step === 1}
        className="fb-story-rise absolute top-1/2 left-1/2 -mt-6 -ml-6 grid size-12 place-items-center rounded-2xl border border-line bg-surface p-1.5 shadow-lg"
      >
        {mark ?? <span className="size-3 rounded-full bg-product" />}
      </div>

      {TOOLS.map((tool, i) => {
        const Icon = tool.icon;
        const settled = step >= 2;
        return (
          <div key={tool.name} style={toolStyle(i, step)} className="fb-story-move absolute top-0 left-0">
            <div
              // Settled, they light up one after another.
              style={{ transitionDelay: settled ? `${200 + i * 110}ms` : "0ms" }}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-2 py-1.5 text-[0.68rem] whitespace-nowrap shadow-lg transition-[background-color,border-color] duration-[var(--motion-base)] @lg:px-3 @lg:py-2 @lg:text-xs",
                settled ? "border-product/50 bg-product-soft" : "border-line bg-surface",
              )}
            >
              <Icon
                aria-hidden
                className={cn("size-4 shrink-0", settled ? "text-product-text" : "text-muted")}
              />
              {settled ? (
                // Icons alone on phones: five labels don't fit, and the text beside this names them.
                <span className="hidden font-medium @lg:inline">{MODULES[i]}</span>
              ) : (
                <span>
                  <span className="block font-medium">{tool.name}</span>
                  <span className="block text-subtle">{tool.note}</span>
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* One record unfolds where the lines meet: who, six facts, then what's happening on it. */}
      <div
        data-open={step >= 2}
        className="fb-story-unfold absolute inset-x-[4%] top-[17%] overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-2xl @lg:inset-x-[5%] @lg:p-4"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-product text-product-ink @lg:size-10">
            <UserRound className="size-4 @lg:size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">Amani W.</p>
            <p className="truncate text-xs text-muted">Finance · accounts lead</p>
          </div>
          <span className="shrink-0 rounded-full bg-product-soft px-2 py-0.5 text-[0.65rem] font-medium text-product-text @lg:text-xs">
            One record
          </span>
        </div>
        <dl className="mt-2.5 grid grid-cols-3 gap-1.5 text-[0.68rem] @lg:mt-3 @lg:gap-2 @lg:text-xs">
          {(
            [
              ["Leave left", step >= 3 ? "11 days" : "14 days", CalendarCheck],
              ["Today", "In 08:02", Clock],
              ["Payslip", stage === PAY_STAGES.length - 1 ? "Ready" : "Soon", Wallet],
              ["Team", "Finance · 6", Users],
              ["Learning", "2 courses", BookOpen],
              ["Self-service", "Any browser", ZIRAHR_SELF_SERVICE.icon],
            ] as [string, string, LucideIcon][]
          ).map(([label, value, Icon], i) => (
            <div
              key={label}
              data-open={step >= 2}
              // The facts arrive one after another once the record opens.
              style={{ transitionDelay: step >= 2 ? `${120 + i * 70}ms` : "0ms" }}
              className="fb-story-rise min-w-0 rounded-xl bg-surface-2 p-2 @lg:p-2.5"
            >
              <dt className="flex items-center gap-1 text-subtle">
                <Icon className="size-3 shrink-0 text-product-text" />
                <span className="truncate">{label}</span>
              </dt>
              <dd className="mt-0.5 truncate font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {/* The record's activity, then the pay run moving through: one place, no gap kept for later. */}
        <div className="mt-2.5 grid @lg:mt-3">
          <ul data-open={step === 2} className="fb-story-rise grid content-start gap-1.5 [grid-area:1/1]">
            {ACTIVITY.map(([what, where], i) => (
              <li
                key={what}
                className={cn(
                  "items-center justify-between gap-3 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[0.68rem] @lg:text-xs",
                  i === 2 ? "hidden @lg:flex" : "flex",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Check className="size-3 shrink-0 text-product-text" />
                  <span className="truncate">{what}</span>
                </span>
                <span className="shrink-0 text-subtle">{where}</span>
              </li>
            ))}
          </ul>
          <div data-open={step >= 3} className="fb-story-rise [grid-area:1/1]">
            <p className="text-xs text-subtle">November pay run</p>
            <ol className="mt-1.5 flex items-center gap-1.5">
              {PAY_STAGES.map((name, i) => (
                <li
                  key={name}
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[0.7rem] transition-colors duration-[var(--motion-base)]",
                    i <= stage ? "bg-product text-product-ink" : "bg-surface-2 text-muted",
                  )}
                >
                  {i < stage && <Check className="hidden size-3 shrink-0 @lg:block" />}
                  <span className="truncate">{name}</span>
                </li>
              ))}
            </ol>
            {/* Each step leaves its mark; there's only room for the trail on wider stages. */}
            <ul className="mt-2 hidden flex-wrap gap-1.5 text-xs @lg:flex">
              {TRAIL.map(([what, who], i) => (
                <li
                  key={what}
                  data-open={i < stage}
                  className="fb-story-rise rounded-full bg-surface-2 px-2.5 py-1"
                >
                  {what} <span className="text-subtle">· {who}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

export function ScatteredToConnectedStory({
  motion = "standard",
  mark,
  intro,
}: {
  motion?: StoryMotion;
  mark?: ReactNode;
  intro?: ReactNode;
}) {
  return (
    <ScrollStory
      label="scattered-to-connected"
      motion={motion}
      intro={intro}
      steps={[
        {
          title: "HR usually lives in too many places.",
          body: "A payroll spreadsheet here, a leave request in someone's inbox, contracts in a folder, and the answer to who approved what lost in a chat.",
        },
        {
          title: "ZiraHR draws it together.",
          body: "Employee information, pay, time and approvals connect in one cloud platform, so a change made once reaches everything that depends on it.",
        },
        {
          title: "One record for every employee.",
          body: "Core HR, payroll, leave, attendance and performance all work from the same employee record, not from copies of it.",
        },
        {
          title: "So the work moves by itself.",
          body: "An approved request updates the balance. A pay run moves through validation and approval to locked, with a clear trail of who did what.",
        },
      ]}
    >
      {(state) => <ScatteredStage {...state} mark={mark} />}
    </ScrollStory>
  );
}

/* ------------------------------------------------- one employee's whole journey */

export function Rows({ rows, wide = [] }: { rows: [string, string, boolean?][]; wide?: string[] }) {
  return (
    <dl className="mt-2 divide-y divide-line text-xs @lg:mt-3 @lg:text-sm">
      {rows.map(([term, value, strong]) => (
        <div
          key={term}
          className={cn(
            "justify-between gap-3 py-1.5 @lg:py-2.5",
            wide.includes(term) ? "hidden @lg:flex" : "flex",
          )}
        >
          <dt className="text-muted">{term}</dt>
          <dd className={cn("text-end tabular-nums", strong ? "font-semibold text-text" : "text-text")}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Ticks({ items }: { items: [string, boolean][] }) {
  return (
    <ul className="mt-2 grid gap-1.5 text-xs @lg:mt-3 @lg:gap-2.5 @lg:text-sm">
      {items.map(([item, done]) => (
        <li key={item} className="flex items-center gap-2">
          <span
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full",
              done ? "bg-product text-product-ink" : "border border-line-strong",
            )}
          >
            {done && <Check className="size-3" />}
          </span>
          <span className={done ? "text-text" : "text-muted"}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-2 text-xs @lg:mt-3 @lg:text-sm">
      <p className="flex justify-between">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">{value}%</span>
      </p>
      <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-surface-2">
        <span
          className="block h-full origin-left rounded-full bg-product rtl:origin-right"
          style={{ transform: `scaleX(${value / 100})` }}
        />
      </span>
    </div>
  );
}

const JOURNEY: { stage: string; title: string; card: ReactNode }[] = [
  {
    stage: "Recruit",
    title: "Applicant pipeline",
    card: (
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[0.68rem] @lg:mt-4 @lg:gap-2 @lg:text-xs">
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
  {
    stage: "Onboard",
    title: "First-week checklist",
    card: (
      <Ticks
        items={[
          ["Record created from the offer", true],
          ["Contract and IDs on file", true],
          ["Probation dates set", true],
          ["Self-service invitation", false],
        ]}
      />
    ),
  },
  {
    stage: "Day to day",
    title: "Time and leave",
    card: (
      <Rows
        rows={[
          ["Today", "In 08:02"],
          ["Shift", "08:00 to 17:00"],
          ["Annual leave balance", "14 days", true],
          ["Next approved leave", "24 Dec"],
        ]}
      />
    ),
  },
  {
    stage: "Pay",
    title: "November payslip",
    card: (
      <Rows
        rows={[
          ["Gross pay", "150,000.00"],
          ["NSSF", "−6,480.00"],
          ["SHIF", "−4,125.00"],
          ["Housing Levy", "−2,250.00"],
          ["Statutory deductions", "−12,855.00"],
          ["PAYE", "−33,526.85"],
          ["Net pay", "103,618.15", true],
        ]}
        wide={["NSSF", "SHIF", "Housing Levy"]}
      />
    ),
  },
  {
    stage: "Grow",
    title: "Goals and learning",
    card: (
      <>
        <Meter label="Quarterly goal" value={70} />
        <Meter label="Statutory payroll course" value={45} />
        <div className="hidden @lg:block">
          <Ticks items={[["Mid-year review shared", true]]} />
        </div>
      </>
    ),
  },
];

function JourneyStage({ step }: { step: number }) {
  return (
    // In normal flow: the stage is as tall as the tallest card, never taller.
    <div className="relative grid grid-cols-[auto_1fr] gap-3 p-3 @lg:gap-6 @lg:p-6">
      {/* The rail follows the scroll; each stop lights up as it's reached. */}
      <ol className="relative flex flex-col justify-between py-1 text-[0.7rem] text-muted">
        <span className="absolute start-[0.6875rem] top-3 bottom-3 w-0.5 bg-line" />
        <span className="fb-story-rail absolute start-[0.6875rem] top-3 bottom-3 w-0.5 bg-product" />
        {JOURNEY.map((item, i) => (
          <li key={item.stage} className="relative flex items-center gap-2">
            <span
              className={cn(
                "size-6 shrink-0 rounded-full border-2 transition-colors duration-[var(--motion-base)]",
                i <= step ? "border-product bg-product" : "border-line-strong bg-surface",
              )}
            />
            <span className={cn("hidden @lg:inline", i === step && "font-medium text-text")}>
              {item.stage}
            </span>
          </li>
        ))}
      </ol>
      {/* One card, turning into each stage: earlier ones lift away, later ones wait behind it. */}
      <div className="relative grid min-w-0 [perspective:70rem]">
        {JOURNEY.map((item, i) => (
          <div
            key={item.stage}
            data-place={i < step ? "past" : i === step ? "now" : "next"}
            className="fb-story-card overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-2xl [grid-area:1/1] @lg:p-5"
          >
            <p className="text-xs font-medium tracking-wide text-product-text uppercase">{item.stage}</p>
            <p className="mt-1 font-semibold">{item.title}</p>
            <p className="mt-0.5 hidden text-xs text-muted @lg:block">
              Amani W. · the same record throughout
            </p>
            {item.card}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmployeeJourneyStory({
  motion = "standard",
  intro,
}: {
  motion?: StoryMotion;
  intro?: ReactNode;
}) {
  return (
    <ScrollStory
      label="employee-journey"
      motion={motion}
      intro={intro}
      fit="content"
      steps={[
        {
          title: "It starts with a hire.",
          body: "Move applicants through one connected hiring flow, from application to offer.",
        },
        {
          title: "Onboarding picks up from the offer.",
          body: "The new starter's record is already there, so contracts, documents and probation dates attach to it, with nothing typed twice.",
        },
        {
          title: "Every day runs on the same record.",
          body: "Time and attendance, shifts and leave balances stay with the employee, and they can see their own in any web browser.",
        },
        {
          title: "Payroll already knows.",
          body: "Pay draws on that same record, and each statutory deduction is shown line by line on a payslip the employee can open themselves.",
        },
        {
          title: "And growth stays connected.",
          body: "Goals, reviews and learning sit alongside everything else, so progress is part of the same story.",
        },
      ]}
    >
      {({ step }) => <JourneyStage step={step} />}
    </ScrollStory>
  );
}
