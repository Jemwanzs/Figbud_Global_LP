"use client";

import { type ProductSlug, getProduct } from "@figbud/brand";
import { FigBudMark, cn } from "@figbud/ui";
import { AnimatePresence, m, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";

import { ProductGlyph } from "../product-glyph";

/** Composition coordinates in a 400 × 340 design space. */
const W = 400;
const H = 340;
const CORE = { x: 200, y: 172 };

const NODES: Record<ProductSlug, { x: number; y: number; bend: number }> = {
  zirahr: { x: 92, y: 74, bend: -34 },
  jasiri: { x: 318, y: 96, bend: 30 },
  expense_now: { x: 244, y: 290, bend: -30 },
};

/** Integration endpoints orbiting the products (banks, mobile money, identity, accounting). */
const SATELLITES: Array<{ from: ProductSlug; x: number; y: number }> = [
  { from: "zirahr", x: 30, y: 168 },
  { from: "zirahr", x: 178, y: 22 },
  { from: "jasiri", x: 378, y: 206 },
  { from: "jasiri", x: 262, y: 20 },
  { from: "expense_now", x: 104, y: 300 },
  { from: "expense_now", x: 362, y: 316 },
];

function curve(a: { x: number; y: number }, b: { x: number; y: number }, bend: number) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * bend;
  const cy = my + (dx / len) * bend;
  return `M${a.x} ${a.y} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}`;
}

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

type Props = {
  labels: Dictionary["home"]["hero"]["visual"];
  status: Dictionary["common"]["status"];
  caption: string;
};

export function EcosystemVisual({ labels, status, caption }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-10% 0px" });
  const reduceMotion = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!inView || reduceMotion) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    }, 2800);
    return () => window.clearInterval(id);
  }, [inView, reduceMotion]);

  const events = labels.events;
  const visible = [0, 1, 2].map((offset) => {
    const n = tick - offset;
    return { key: n, event: events[((n % events.length) + events.length) % events.length]! };
  });

  return (
    <figure ref={ref} className="relative">
      <div
        role="img"
        aria-label={labels.label}
        className="fb-panel relative overflow-hidden rounded-[var(--radius-panel)]"
      >
        <div
          aria-hidden
          className="fb-grid absolute inset-0 [mask-image:radial-gradient(circle_at_50%_50%,black,transparent_78%)] opacity-70"
        />
        <div aria-hidden className="relative aspect-[400/340] w-full">
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" fill="none">
            <defs>
              <radialGradient id="eco-core" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="var(--fb-amber)" stopOpacity="0.35" />
                <stop offset="1" stopColor="var(--fb-amber)" stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle cx={CORE.x} cy={CORE.y} r="92" stroke="var(--line-strong)" strokeDasharray="2 6" />
            <circle cx={CORE.x} cy={CORE.y} r="150" stroke="var(--line)" />
            <circle
              cx={CORE.x}
              cy={CORE.y}
              r="70"
              fill="url(#eco-core)"
              className="origin-center [transform-box:fill-box] motion-safe:animate-[fb-orbit-glow_6s_ease-in-out_infinite]"
            />

            {SATELLITES.map((s, i) => {
              const node = NODES[s.from];
              return (
                <g key={i}>
                  <path d={curve(node, s, 18)} stroke="var(--line-strong)" strokeWidth="1" />
                  <circle cx={s.x} cy={s.y} r="3.5" fill="var(--surface-3)" stroke="var(--line-strong)" />
                </g>
              );
            })}

            {(Object.keys(NODES) as ProductSlug[]).map((slug) => {
              const node = NODES[slug];
              const d = curve(CORE, node, node.bend);
              const live = getProduct(slug).status === "active";
              return (
                <g key={slug} data-product={slug}>
                  <path d={d} stroke="var(--product)" strokeOpacity={live ? 0.35 : 0.2} strokeWidth="1.5" />
                  <path
                    d={d}
                    stroke="var(--product)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={live ? "3 22" : "2 23"}
                    className="motion-safe:animate-[fb-dash_6s_linear_infinite]"
                    style={{
                      animationDuration: slug === "jasiri" ? "7.5s" : slug === "zirahr" ? "6s" : "11s",
                    }}
                  />
                </g>
              );
            })}
          </svg>

          {/* Core */}
          <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
            style={{ left: pct(CORE.x, W), top: pct(CORE.y, H) }}
          >
            <span className="rounded-[18px] bg-bg/60 p-2 shadow-[0_0_0_1px_var(--line-strong),0_12px_40px_-8px_var(--glow)] backdrop-blur">
              <FigBudMark className="size-10 sm:size-12" />
            </span>
            <span className="mt-2 text-[0.7rem] font-medium whitespace-nowrap text-text sm:text-xs">
              {labels.core}
            </span>
            <span className="hidden text-[0.65rem] whitespace-nowrap text-subtle sm:block">
              {labels.coreDetail}
            </span>
          </div>

          {/* Product nodes */}
          {(Object.keys(NODES) as ProductSlug[]).map((slug) => {
            const node = NODES[slug];
            const product = getProduct(slug);
            return (
              <div
                key={slug}
                data-product={slug}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: pct(node.x, W), top: pct(node.y, H) }}
              >
                <span
                  className={cn(
                    "flex items-center gap-2 rounded-2xl border border-line-strong bg-bg-elevated/90 py-1.5 ps-1.5 pe-3 shadow-[0_10px_30px_-12px_var(--product)] backdrop-blur",
                    product.status !== "active" && "opacity-85",
                  )}
                >
                  <ProductGlyph slug={slug} size="sm" className="size-7 rounded-[9px] sm:size-8" />
                  <span className="leading-tight">
                    <span className="block text-[0.72rem] font-medium whitespace-nowrap text-text sm:text-[0.8rem]">
                      {product.name}
                    </span>
                    <span className="flex items-center gap-1 text-[0.62rem] whitespace-nowrap text-product-text sm:text-[0.68rem]">
                      <span className="size-1 rounded-full bg-current" />
                      {status[product.status]}
                    </span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live activity feed */}
      <div className="fb-panel relative mt-4 rounded-2xl p-4 sm:p-5 lg:absolute lg:-bottom-10 lg:-left-8 lg:mt-0 lg:w-[19rem] xl:-left-14">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium tracking-wide text-muted">{labels.feedTitle}</p>
          <span className="flex items-center gap-1.5 text-[0.68rem] text-success">
            <span className="size-1.5 rounded-full bg-current motion-safe:animate-[fb-pulse_2s_ease-in-out_infinite]" />
            {labels.live}
          </span>
        </div>
        <ul className="mt-3 space-y-2" aria-hidden>
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map(({ key, event }, i) => (
              <m.li
                key={key}
                data-product={event.product}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: i === 2 ? 0.55 : 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3 rounded-xl bg-surface-2/70 px-3 py-2.5"
              >
                <span className="size-2 shrink-0 rounded-full bg-product shadow-[0_0_10px_var(--product)]" />
                <span className="min-w-0 flex-1 truncate text-[0.8rem] text-text">{event.text}</span>
                <span className="shrink-0 text-[0.68rem] text-subtle">{event.meta}</span>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <figcaption className="mt-3 text-end text-[0.7rem] text-subtle lg:mt-4">{caption}</figcaption>
    </figure>
  );
}
