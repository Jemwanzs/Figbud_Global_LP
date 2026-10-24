"use client";

import { cn } from "@figbud/ui";
import { Check, CircleDashed } from "lucide-react";
import { m } from "motion/react";

import type { Dictionary } from "@/i18n/get-dictionary";

/*
 * Synthetic product previews. Every figure here is illustrative sample data,
 * never customer or tenant data.
 */

type Previews = Dictionary["home"]["platforms"]["previews"];

const EASE = [0.16, 1, 0.3, 1] as const;

function Bar({ value, delay = 0, className }: { value: number; delay?: number; className?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-3">
      <m.div
        className={cn("h-full origin-left rounded-full bg-product rtl:origin-right", className)}
        style={{ width: `${value}%` }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, delay, ease: EASE }}
      />
    </div>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-bg-elevated/80 p-4 sm:p-5", className)}>
      {children}
    </div>
  );
}

function Steps({ steps, done }: { steps: string[]; done: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2">
      {steps.map((step, i) => (
        <m.li
          key={step}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 + i * 0.12, ease: EASE }}
          className="flex flex-col gap-2"
        >
          <span
            className={cn(
              "h-1 rounded-full",
              i < done
                ? "bg-product"
                : i === done
                  ? "bg-product/50 motion-safe:animate-[fb-pulse_1.8s_ease-in-out_infinite]"
                  : "bg-surface-3",
            )}
          />
          <span className="flex items-center gap-1 text-[0.7rem] text-muted sm:text-xs">
            {i < done ? (
              <Check aria-hidden className="size-3 text-product-text" strokeWidth={3} />
            ) : (
              <CircleDashed aria-hidden className="size-3" />
            )}
            <span className="truncate">{step}</span>
          </span>
        </m.li>
      ))}
    </ol>
  );
}

export function ZiraPreview({ copy }: { copy: Previews["zirahr"] }) {
  const deductions = [
    { label: copy.deductionItems[0], amount: "7.62M", share: 100 },
    { label: copy.deductionItems[1], amount: "1.33M", share: 18 },
    { label: copy.deductionItems[2], amount: "1.10M", share: 15 },
    { label: copy.deductionItems[3], amount: "0.72M", share: 10 },
  ];
  return (
    <div className="grid gap-3">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-text">{copy.title}</p>
          <span className="rounded-full bg-product-soft px-2.5 py-1 text-[0.7rem] text-product-text">
            412 / 412
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-subtle">{copy.gross}</p>
            <p className="mt-1 font-mono text-lg tracking-tight text-text sm:text-xl">KES 48.21M</p>
          </div>
          <div>
            <p className="text-xs text-subtle">{copy.net}</p>
            <p className="mt-1 font-mono text-lg tracking-tight text-text sm:text-xl">KES 35.94M</p>
          </div>
        </div>
        <p className="mt-5 text-xs text-subtle">{copy.deductions}</p>
        <ul className="mt-2 space-y-2.5">
          {deductions.map((d, i) => (
            <li key={d.label} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 text-xs">
              <span className="text-muted">{d.label}</span>
              <Bar value={d.share} delay={0.1 + i * 0.08} />
              <span className="text-end font-mono text-text">{d.amount}</span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        <Card>
          <Steps steps={copy.steps} done={3} />
        </Card>
        <Card className="flex items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-product-soft text-xs font-medium text-product-text">
            WM
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-subtle">{copy.leave}</span>
            <span className="block truncate text-sm text-text">{copy.leaveDetail}</span>
            <span className="block text-[0.7rem] text-warning">{copy.leaveStatus}</span>
          </span>
        </Card>
      </div>
    </div>
  );
}

export function JasiriPreview({ copy }: { copy: Previews["jasiri"] }) {
  const pipeline = [248, 96, 41, 173];
  const max = Math.max(...pipeline);
  const schedule = [62, 64, 66, 68, 70, 72, 74, 77, 79, 82, 85, 88];
  // Portfolio-at-risk gauge spans 0–20%.
  const par = 4.8;
  return (
    <div className="grid gap-3">
      <Card>
        <p className="text-sm font-medium text-text">{copy.title}</p>
        <ul className="mt-4 grid grid-cols-4 items-end gap-2 sm:gap-3">
          {copy.pipeline.map((stage, i) => (
            <li key={stage} className="flex flex-col gap-2">
              <div className="flex h-24 items-end">
                <m.div
                  className="w-full origin-bottom rounded-t-lg bg-gradient-to-t from-product-2 to-product"
                  style={{ height: `${(pipeline[i]! / max) * 100}%` }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.8, delay: 0.1 + i * 0.1, ease: EASE }}
                />
              </div>
              <span className="font-mono text-sm text-text">{pipeline[i]}</span>
              <span className="truncate text-[0.7rem] text-muted sm:text-xs">{stage}</span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-4">
          <svg viewBox="0 0 100 56" className="w-24 shrink-0" aria-hidden>
            <path
              d="M8 50 A42 42 0 0 1 92 50"
              stroke="var(--surface-3)"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
            />
            <m.path
              d="M8 50 A42 42 0 0 1 92 50"
              stroke="var(--product)"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: par / 20 }}
              transition={{ duration: 1.1, delay: 0.2, ease: EASE }}
            />
          </svg>
          <span>
            <span className="block font-mono text-xl text-text">{par}%</span>
            <span className="block text-xs text-muted">{copy.parLabel}</span>
          </span>
        </Card>
        <Card>
          <p className="text-xs text-subtle">{copy.collections}</p>
          <p className="mt-1 font-mono text-xl text-text">96.4%</p>
          <div className="mt-3">
            <Bar value={96.4} delay={0.3} />
          </div>
        </Card>
      </div>
      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs text-subtle">{copy.schedule}</p>
          <p className="text-[0.7rem] text-muted">{copy.scheduleDetail}</p>
        </div>
        <div className="mt-3 flex h-12 items-end gap-1.5">
          {schedule.map((h, i) => (
            <m.span
              key={i}
              className="flex-1 origin-bottom rounded-sm bg-product/70"
              style={{ height: `${h}%` }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.6, delay: 0.3 + i * 0.04, ease: EASE }}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function ExpensePreview({ copy }: { copy: Previews["expense_now"] }) {
  const budgets = [72, 54, 91, 41];
  return (
    <div className="grid gap-3">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-text">{copy.title}</p>
          <span className="rounded-full border border-product/30 px-2.5 py-1 text-[0.7rem] text-product-text">
            {copy.comingSoon}
          </span>
        </div>
        <ul className="mt-4 space-y-3">
          {copy.categories.map((category, i) => (
            <li key={category} className="grid grid-cols-[5.5rem_1fr_2.75rem] items-center gap-3 text-xs">
              <span className="text-muted">{category}</span>
              <Bar
                value={budgets[i]!}
                delay={0.1 + i * 0.08}
                className={budgets[i]! > 85 ? "bg-warning" : undefined}
              />
              <span className="text-end font-mono text-text">{budgets[i]}%</span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        <Card>
          <p className="mb-3 text-xs text-subtle">{copy.approvals}</p>
          <Steps steps={copy.approvalSteps} done={2} />
        </Card>
        <Card>
          <p className="text-xs text-subtle">{copy.batch}</p>
          <p className="mt-1 text-sm text-text">{copy.batchDetail}</p>
          <div className="mt-3 flex gap-1.5">
            {["KES", "USD", "EUR"].map((c) => (
              <span
                key={c}
                className="rounded-md bg-surface-3 px-2 py-0.5 font-mono text-[0.68rem] text-muted"
              >
                {c}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Ziwa LMS: the loan journey as one flow, with servicing and repayment rhythm. */
export function ZiwaPreview({ copy }: { copy: Previews["ziwa"] }) {
  const counts = [128, 117, 96, 88, 412];
  const queue = [3, 1, 2];
  const rhythm = [86, 89, 88, 92, 91, 94];
  return (
    <div className="grid gap-3">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-text">{copy.title}</p>
          <span className="rounded-full border border-product/30 px-2.5 py-1 text-[0.7rem] text-product-text">
            {copy.comingSoon}
          </span>
        </div>
        <div className="relative mt-5">
          <svg
            aria-hidden
            viewBox="0 0 500 40"
            preserveAspectRatio="none"
            className="absolute inset-x-0 top-1 h-8 w-full"
          >
            <path
              d="M10 20 C 60 4, 110 36, 160 20 S 260 4, 310 20 S 410 36, 490 20"
              fill="none"
              stroke="var(--product)"
              strokeOpacity="0.45"
              strokeWidth="2"
              strokeDasharray="4 6"
              className="motion-safe:animate-[fb-dash_6s_linear_infinite]"
            />
          </svg>
          <ol className="relative grid grid-cols-5 gap-1">
            {copy.stages.map((stage, i) => (
              <m.li
                key={stage}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 + i * 0.1, ease: EASE }}
                className="flex flex-col items-center gap-1.5 text-center"
              >
                <span className="flex size-8 items-center justify-center rounded-full border border-product/40 bg-bg-elevated font-mono text-[0.68rem] text-product-text">
                  {counts[i]}
                </span>
                <span className="truncate text-[0.68rem] text-muted sm:text-xs">{stage}</span>
              </m.li>
            ))}
          </ol>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
        <Card>
          <p className="text-xs text-subtle">{copy.servicing}</p>
          <ul className="mt-3 space-y-2">
            {copy.servicingItems.map((item, i) => (
              <li key={item} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted">{item}</span>
                <span className="rounded-md bg-surface-3 px-2 py-0.5 font-mono text-text">{queue[i]}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <p className="text-xs text-subtle">{copy.rhythm}</p>
          <div className="mt-3 flex h-12 items-end gap-1.5" aria-hidden>
            {rhythm.map((value, i) => (
              <m.span
                key={i}
                className="flex-1 origin-bottom rounded-t-md bg-product/70"
                style={{ height: `${(value - 80) * 5}%` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.7, delay: 0.2 + i * 0.06, ease: EASE }}
              />
            ))}
          </div>
          <p className="mt-2 text-[0.7rem] text-muted">{copy.rhythmDetail}</p>
        </Card>
      </div>
    </div>
  );
}
