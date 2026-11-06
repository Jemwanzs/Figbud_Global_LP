"use client";

import { cn } from "@figbud/ui";
import { CalendarCheck, Clock, type LucideIcon, Target, UserRound, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/*
 * The hero's "connected modules" visual (UI-HE1): five module cards rising like
 * steps, and a signal line that draws beneath them and lights each card in turn.
 * Decorative (the words beside it carry the message), so it's hidden from
 * assistive technology. Transforms, opacity and stroke offsets only; it pauses
 * off screen, and with reduced motion it rests settled on the first card.
 */

const CARDS: { name: string; note: string; icon: LucideIcon }[] = [
  { name: "Core HR", note: "Employee 360", icon: UserRound },
  { name: "Payroll", note: "Statutory ready", icon: Wallet },
  { name: "Leave", note: "Approvals", icon: CalendarCheck },
  { name: "Attendance", note: "Time and shifts", icon: Clock },
  { name: "Performance", note: "Goals and reviews", icon: Target },
];

// Where each card's node sits on the line (percent of the stage), rising left to right.
const NODES: [number, number][] = [
  [10, 80],
  [30, 70],
  [50, 63],
  [70, 50],
  [90, 40],
];
const LINE =
  "M0 88 C 6 86, 8 81, 10 80 S 22 73, 30 70 S 44 64, 50 63 S 63 55, 70 50 S 84 42, 90 40 S 97 34, 100 30";

export function HeroSignal() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const tick = () => {
      setActive((i) => (i + 1) % CARDS.length);
      timer = window.setTimeout(tick, 2400);
    };
    // Only while it's on screen.
    const visibility = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting) {
        setMoving(true);
        timer = window.setTimeout(tick, 2400);
      }
    });
    visibility.observe(el);
    return () => {
      visibility.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      ref={root}
      aria-hidden
      data-moving={moving || undefined}
      className="fb-signal relative aspect-[5/3] w-full"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <path d={LINE} pathLength={1} className="fb-signal-glow" />
        <path d={LINE} pathLength={1} className="fb-signal-line" />
      </svg>
      {NODES.map(([x, y], i) => (
        <span
          key={i}
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${0.5 + i * 0.22}s` }}
          className={cn(
            "fb-signal-node absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-product",
            i === active && "fb-signal-node-on",
          )}
        />
      ))}
      {CARDS.map((card, i) => {
        const Icon = card.icon;
        const [x, y] = NODES[i]!;
        const on = i === active;
        return (
          <div
            key={card.name}
            style={{ left: `${x}%`, top: `${y - 9}%`, animationDelay: `${0.35 + i * 0.12}s` }}
            className="fb-signal-card absolute w-[17%] -translate-x-1/2 -translate-y-full"
          >
            <div
              data-on={on || undefined}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-2xl border px-1.5 py-2.5 text-center backdrop-blur-md transition-[transform,background-color,border-color,box-shadow] duration-[var(--motion-slow)] ease-[var(--motion-ease)] @lg:px-2 @lg:py-4",
                on
                  ? "-translate-y-1.5 border-product/70 bg-product-soft shadow-[0_18px_40px_-16px_var(--product)]"
                  : "border-line-strong bg-surface/70",
              )}
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-xl @lg:size-10",
                  on ? "bg-product text-product-ink" : "bg-surface-2 text-product-text",
                )}
              >
                <Icon className="size-3.5 @lg:size-5" />
              </span>
              <span className="text-[0.62rem] leading-tight font-semibold text-text @lg:text-sm">
                {card.name}
              </span>
              <span className="hidden text-[0.7rem] leading-tight text-muted @2xl:block">{card.note}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
