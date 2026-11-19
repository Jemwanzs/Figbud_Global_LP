"use client";

import { buttonClasses, cn } from "@figbud/ui";
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  Check,
  FileText,
  Globe,
  Minus,
  Plus,
  UserRound,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import { useAutoDemo } from "./auto-demo";
import type { MediaInfo } from "./blocks";

/**
 * An FAQ with an interactive product visual (owner's briefs, 19 Nov 2026,
 * P14-W5). Questions on the left, one open at a time; the visual on the
 * right shows the open question's scene (employee self-service, branches,
 * payroll, workflows), crossfading as questions change, and a connected
 * workspace when none is open. The scene belongs to the question itself
 * (its stable id travels with it), so rewording or translating a question
 * never breaks it. Optional autoplay runs only while no question is open,
 * pauses on hover, focus and off screen, and never with reduced motion.
 * Illustrations use synthetic data and say so; a question may show an
 * approved screenshot from the media library instead.
 */

export type FaqScene = "employee_access" | "branches" | "payroll" | "workflows";
type Scene = FaqScene | "workspace";

export interface FaqShowcaseItem {
  id?: string;
  question: string;
  scene?: FaqScene | null;
  labels?: string[];
  media?: MediaInfo | null;
}

export interface FaqShowcaseConfig {
  enabled?: boolean;
  speed?: "calm" | "normal" | "lively";
  autoplay?: boolean;
  cta?: { label: string; href: string } | null;
}

export interface FaqShowcaseWords {
  illustrative: string;
  labels: Record<Scene, string[]>;
  greeting: string;
  payslips: string;
  leave: string;
  profile: string;
  leaveBalance: string;
  workspace: string;
  allBranches: string;
  gross: string;
  deductions: string;
  net: string;
  payrollNote: string;
  stages: [string, string, string, string];
  newRequest: string;
}

export const FAQ_SHOWCASE_WORDS: FaqShowcaseWords = {
  illustrative: "Illustrative",
  labels: {
    workspace: ["Core HR", "Payroll", "Leave", "Self-service"],
    employee_access: ["Payslips", "Leave Requests", "Employee Profile", "Browser Access"],
    branches: ["Head Office", "Branches", "Workforce Overview", "Consolidated Reports"],
    payroll: ["Gross Pay", "Statutory Deductions", "Net Pay", "Payroll Reports"],
    workflows: ["Request", "Review", "Approval", "Completion"],
  },
  greeting: "Hello, Amina",
  payslips: "My payslips",
  leave: "Request leave",
  profile: "My profile",
  leaveBalance: "Leave balance",
  workspace: "HR workspace",
  allBranches: "All branches",
  gross: "Gross pay",
  deductions: "PAYE · NSSF · SHIF · Housing Levy",
  net: "Net pay",
  payrollNote: "Proportions only. The payroll calculator works out real figures.",
  stages: ["Request submitted", "Supervisor review", "HR / Finance approval", "Completed"],
  newRequest: "Leave request · 3 days",
};

const SPEED = { calm: 1.4, normal: 1, lively: 0.7 } as const;
const BRANCHES = ["Head office", "Nairobi", "Mombasa", "Kisumu", "Eldoret"];

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_60px_-28px_rgb(0_0_0/0.55)]",
        className,
      )}
    >
      <div aria-hidden className="flex items-center gap-1.5 border-b border-line bg-surface-2 px-3 py-2">
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="ms-2 h-3.5 flex-1 rounded-full bg-bg/70" />
      </div>
      {/* The screen: shorter scenes sit in its middle rather than at the top. */}
      <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

function Tile({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-bg p-2.5 text-center text-[0.7rem] font-medium text-text">
      <span className="text-product-text">{icon}</span>
      {label}
    </div>
  );
}

/** The scenes, drawn from tokens so they follow the band and theme. */
function SceneArt({ scene, words, step }: { scene: Scene; words: FaqShowcaseWords; step: number }) {
  switch (scene) {
    case "employee_access":
      return (
        <div className="relative h-full">
          <Frame className="absolute inset-y-[6%] start-0 w-[78%]">
            <div className="p-4">
              <p className="font-display text-sm font-semibold text-text">{words.greeting}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Tile icon={<FileText aria-hidden className="size-4" />} label={words.payslips} />
                <Tile icon={<CalendarCheck aria-hidden className="size-4" />} label={words.leave} />
                <Tile icon={<UserRound aria-hidden className="size-4" />} label={words.profile} />
              </div>
              <div className="mt-3 rounded-xl border border-line bg-bg p-2.5">
                <p className="text-[0.7rem] text-muted">{words.leaveBalance}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="fb-faq-grow h-full w-[62%] rounded-full bg-product" />
                </div>
              </div>
            </div>
          </Frame>
          {/* The same portal in a phone's browser. */}
          <div className="fb-faq-float absolute end-[2%] bottom-[2%] w-[30%] rounded-[1.4rem] border-4 border-text/80 bg-surface p-2 shadow-[0_24px_50px_-20px_rgb(0_0_0/0.6)]">
            <div aria-hidden className="mx-auto mb-2 h-1.5 w-8 rounded-full bg-text/70" />
            <div className="space-y-1.5">
              {[words.payslips, words.leave, words.profile].map((t) => (
                <div
                  key={t}
                  className="rounded-lg border border-line bg-bg px-2 py-1.5 text-[0.6rem] text-text"
                >
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    case "branches":
      return (
        <Frame className="h-full">
          <div className="relative min-h-0 flex-1">
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full"
            >
              {BRANCHES.map((_, i) => {
                const a = (i / BRANCHES.length) * Math.PI * 2 - Math.PI / 2;
                return (
                  <line
                    key={i}
                    x1="50"
                    y1="50"
                    x2={50 + Math.cos(a) * 36}
                    y2={50 + Math.sin(a) * 34}
                    className="fb-faq-flow stroke-product"
                    strokeWidth="0.6"
                    strokeDasharray="1.5 4"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
            <div className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-product px-3 py-2 text-center text-[0.7rem] font-semibold text-product-ink shadow-lg rtl:translate-x-1/2">
              {words.workspace}
            </div>
            {BRANCHES.map((name, i) => {
              const a = (i / BRANCHES.length) * Math.PI * 2 - Math.PI / 2;
              const active = step % BRANCHES.length === i;
              return (
                <div
                  key={name}
                  className={cn(
                    "absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-1 text-[0.62rem] whitespace-nowrap transition-colors duration-500",
                    active
                      ? "border-product bg-product-soft text-product-text"
                      : "border-line bg-bg text-muted",
                  )}
                  style={{ left: `${50 + Math.cos(a) * 36}%`, top: `${50 + Math.sin(a) * 34}%` }}
                >
                  <Building2 aria-hidden className="size-3" />
                  {name}
                </div>
              );
            })}
            <div className="absolute end-3 bottom-3 rounded-lg border border-line bg-bg px-2 py-1 text-[0.6rem] text-muted">
              {words.allBranches} ▾
            </div>
          </div>
        </Frame>
      );
    case "payroll":
      return (
        <Frame className="h-full">
          <div className="mx-auto w-full max-w-md space-y-3 p-4 @lg:p-6">
            {[
              { label: words.gross, width: 100, tone: "bg-product/80" },
              { label: words.deductions, width: 34, tone: "bg-line-strong" },
              { label: words.net, width: 66, tone: "bg-success/80" },
            ].map((row, i) => (
              <div key={row.label}>
                <p className="text-[0.7rem] text-muted">{row.label}</p>
                <div className="mt-1 h-3 rounded-full bg-surface-2">
                  <div
                    className="fb-faq-grow h-full rounded-full"
                    style={{ width: `${row.width}%`, animationDelay: `${i * 120}ms` }}
                  >
                    <div className={cn("size-full rounded-full", row.tone)} />
                  </div>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {["PAYE", "NSSF", "SHIF", "Housing Levy"].map((d, i) => (
                <span
                  key={d}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[0.62rem] transition-colors duration-500",
                    step % 4 === i
                      ? "border-product bg-product-soft text-product-text"
                      : "border-line text-muted",
                  )}
                >
                  {d}
                </span>
              ))}
            </div>
            <p className="text-[0.62rem] text-subtle">{words.payrollNote}</p>
          </div>
        </Frame>
      );
    case "workflows":
      return (
        <Frame className="h-full">
          <div className="mx-auto w-full max-w-sm p-4 @lg:p-6">
            <p className="text-[0.7rem] font-medium text-text @lg:text-sm">{words.newRequest}</p>
            <ol className="relative mt-3 space-y-2.5 border-s border-line ps-4">
              {words.stages.map((stage, i) => {
                const done = i < step % (words.stages.length + 1);
                const now = i === step % (words.stages.length + 1);
                return (
                  <li key={stage} className="relative text-[0.7rem] @lg:text-sm">
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -start-[1.32rem] top-0.5 grid size-3.5 place-items-center rounded-full border transition-colors duration-500",
                        done
                          ? "border-success bg-success text-white"
                          : now
                            ? "border-product bg-product-soft"
                            : "border-line bg-bg",
                      )}
                    >
                      {done && <Check className="size-2.5" />}
                    </span>
                    <span className={cn("transition-colors", now ? "font-semibold text-text" : "text-muted")}>
                      {stage}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </Frame>
      );
    default:
      return (
        <Frame className="h-full">
          <div className="relative grid min-h-0 flex-1 grid-cols-2 gap-3 p-4">
            {words.labels.workspace.map((label, i) => (
              <div
                key={label}
                className={cn(
                  "flex items-center justify-center rounded-xl border p-3 text-center text-xs font-medium transition-colors duration-500",
                  step % 4 === i
                    ? "border-product bg-product-soft text-product-text"
                    : "border-line bg-bg text-text",
                )}
              >
                {label}
              </div>
            ))}
            <div className="absolute start-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-product text-product-ink shadow-lg rtl:translate-x-1/2">
              <Globe aria-hidden className="size-5" />
            </div>
          </div>
        </Frame>
      );
  }
}

const CORNERS = [
  "start-[-4%] top-[4%]",
  "end-[-4%] top-[10%]",
  "start-[-2%] bottom-[8%]",
  "end-[-2%] bottom-[2%]",
];

export function FaqShowcase({
  heading,
  items,
  answers,
  showcase,
  mediaBase,
  words = FAQ_SHOWCASE_WORDS,
  headingNode,
}: {
  heading?: string | null;
  items: FaqShowcaseItem[];
  /** Each answer, rendered (sanitised HTML) by the page. */
  answers: ReactNode[];
  showcase: FaqShowcaseConfig;
  mediaBase: string;
  words?: FaqShowcaseWords;
  /** The section heading as the page draws it. */
  headingNode?: ReactNode;
}) {
  const uid = useId().replace(/:/g, "");
  const [open, setOpen] = useState<number | null>(null);
  const speed = SPEED[showcase.speed ?? "normal"];
  const scenes = useMemo(() => items.map((i) => (i.scene ?? "workspace") as Scene), [items]);
  // Autoplay (only while nothing is open) walks through the questions' scenes.
  const auto = useAutoDemo<HTMLDivElement>({
    durations: scenes.map(() => 5200 * speed),
    passes: showcase.autoplay ? 2 : 0,
    resumeAfter: 15_000,
  });
  // A small inner step for each scene's own motion (branch highlight, approvals).
  const [step, setStep] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = Boolean(e?.isIntersecting)), { threshold: 0.3 });
    io.observe(el);
    const timer = window.setInterval(() => {
      if (visible && !document.hidden) setStep((s) => s + 1);
    }, 1300 * speed);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, [speed]);

  const playing = open === null && showcase.autoplay && auto.state === "playing";
  const index = open ?? (playing ? auto.index : null);
  const scene: Scene = index === null ? "workspace" : (scenes[index] ?? "workspace");
  const item = index === null ? null : items[index];
  const labels = (item?.labels?.length ? item.labels : words.labels[scene]).slice(0, 4);
  const shot = item?.media ?? null;

  return (
    <div
      data-faq-showcase=""
      className="@container grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14"
      style={{ "--faq-speed": String(speed) } as CSSProperties}
    >
      <div>
        {headingNode}
        <div className={cn("space-y-3", Boolean(heading || headingNode) && "mt-8")}>
          {items.map((q, i) => {
            const expanded = open === i;
            const key = q.id ?? String(i);
            return (
              <div
                key={key}
                data-faq-item={key}
                className={cn(
                  "rounded-2xl border transition-[border-color,box-shadow,background-color] duration-300",
                  expanded
                    ? "border-product bg-surface shadow-[0_18px_40px_-24px_var(--product)]"
                    : "border-line bg-surface/60 hover:-translate-y-px hover:border-line-strong",
                )}
              >
                <h3>
                  <button
                    type="button"
                    id={`${uid}-q-${i}`}
                    aria-expanded={expanded}
                    aria-controls={`${uid}-a-${i}`}
                    onClick={() => setOpen(expanded ? null : i)}
                    className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-start font-medium text-text"
                  >
                    {q.question}
                    <span aria-hidden className="shrink-0 text-product-text">
                      {expanded ? <Minus className="size-5" /> : <Plus className="size-5" />}
                    </span>
                  </button>
                </h3>
                <div
                  id={`${uid}-a-${i}`}
                  role="region"
                  aria-labelledby={`${uid}-q-${i}`}
                  hidden={!expanded}
                  className="px-5 pb-5"
                >
                  {answers[i]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The visual answers the open question; decorative, so it's hidden from assistive technology. */}
      <div
        ref={(el) => {
          auto.ref.current = el;
          stage.current = el;
        }}
        onPointerEnter={() => auto.hold(true)}
        onPointerLeave={() => auto.hold(false)}
        data-faq-scene={scene}
        className="relative mx-auto w-full max-w-xl lg:sticky lg:top-28"
      >
        <div aria-hidden className="relative aspect-square w-full @lg:aspect-[5/4]">
          <div className="pointer-events-none absolute inset-[-10%] rounded-full bg-[radial-gradient(closest-side,var(--product-soft),transparent)] opacity-80" />
          {(["workspace", "employee_access", "branches", "payroll", "workflows"] as Scene[]).map((s) => (
            <div
              key={s}
              className={cn(
                "absolute inset-[6%] transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
                s === scene ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
              )}
            >
              {s === scene && shot ? (
                <Frame className="h-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${mediaBase}${shot.id}`}
                    alt=""
                    width={shot.width}
                    height={shot.height}
                    loading="lazy"
                    decoding="async"
                    className="min-h-0 w-full flex-1 bg-bg object-contain object-top"
                  />
                </Frame>
              ) : (
                <SceneArt scene={s} words={words} step={step} />
              )}
            </div>
          ))}
          {/* Floating labels for the scene on show (wide enough only, so nothing overlaps). */}
          <div className="absolute inset-0 hidden @md:block">
            {labels.map((label, i) => (
              <span
                key={`${scene}-${label}`}
                className={cn(
                  "fb-faq-chip absolute rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs font-medium text-text shadow-md backdrop-blur",
                  CORNERS[i],
                )}
                style={{ animationDelay: `${i * 90}ms` }}
              >
                {label}
              </span>
            ))}
          </div>
          {!shot && (
            <span className="absolute end-[8%] top-[1%] rounded-full bg-bg/90 px-2 py-0.5 text-[0.62rem] font-medium tracking-wide text-subtle uppercase">
              {words.illustrative}
            </span>
          )}
        </div>
        {scene === "workflows" && showcase.cta && (
          <div className="mt-4 flex justify-center">
            <a href={showcase.cta.href} className={buttonClasses("product", "md")}>
              {showcase.cta.label}
              <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
