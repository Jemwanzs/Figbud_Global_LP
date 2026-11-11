"use client";

import { cn } from "@figbud/ui";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import { DemoControl, useAutoDemo } from "./auto-demo";
import { ziraModules } from "./zirahr-modules";

/*
 * The hero's "connected modules" visual (UI-HE1; all eight modules on the
 * owner's brief of 8 Nov 2026). Module cards sit on a rising signal line; the
 * middle card is lit. With more modules than places, the cards travel along
 * the line: each step the next module enters at the top, the others move
 * down a place and the last one fades out at the bottom, so every module gets
 * its turn in the light. Five places (three on narrow stages). The picture is
 * decorative (the words beside it carry the message); the dots beneath name
 * each module and choose it, beside the pause control. It moves on the shared
 * demonstration clock: only on screen, never under keyboard focus, two passes
 * and then it rests; with reduced motion it doesn't move by itself.
 */

type Point = [number, number];

// Where each place's node sits on the line (percent of the stage), rising left to right.
const PLACES: Record<3 | 5, Point[]> = {
  5: [
    [10, 80],
    [30, 70],
    [50, 63],
    [70, 50],
    [90, 40],
  ],
  3: [
    [18, 76],
    [50, 63],
    [82, 44],
  ],
};
// Off the line: where the next card waits (top right) and where the last one leaves (bottom left).
const ENTER: Point = [106, 28];
const LEAVE: Point = [-6, 92];
const LINE =
  "M0 88 C 6 86, 8 81, 10 80 S 22 73, 30 70 S 44 64, 50 63 S 63 55, 70 50 S 84 42, 90 40 S 97 34, 100 30";

export type HeroMotion = "standard" | "subtle" | "off";

/** Where module `i` stands when `current` is lit: a place on the line, or waiting/leaving off it. */
function placeOf(i: number, current: number, count: number, places: number) {
  if (count <= places) return { place: i, shown: true };
  const mid = Math.floor(places / 2);
  const ahead = (((i - current) % count) + count) % count;
  if (ahead <= places - 1 - mid) return { place: mid + ahead, shown: true };
  if (ahead >= count - mid) return { place: mid - (count - ahead), shown: true };
  // Off the line: the ones next in line wait at the top, the one that just left stays at the bottom.
  const toEnter = ahead - (places - mid);
  const sinceLeft = count - mid - 1 - ahead;
  return { place: toEnter <= sinceLeft ? "enter" : "leave", shown: false } as const;
}

export function HeroSignal({
  modules: keys,
  motion = "standard",
  messages,
}: {
  /** Catalogue keys in order (from the Studio); all eight when empty. Keys, not modules: icons can't cross to the client. */
  modules?: readonly string[] | null;
  motion?: HeroMotion;
  /** Each module's hover message, as changed in the Studio; the approved copy otherwise. */
  messages?: Partial<Record<string, string>> | null;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [places, setPlaces] = useState<3 | 5>(5);
  // The module whose message shows (owner's brief, 11 Nov 2026): hovered, tapped or its dot focused.
  const [tip, setTip] = useState<number | null>(null);
  const modules = ziraModules(keys);
  const count = modules.length;
  const demo = useAutoDemo<HTMLDivElement>({
    durations: modules.map(() => (motion === "subtle" ? 4200 : 2800)),
    // "Off" in the Studio: it rests on the first module, the dots still choose.
    passes: motion === "off" ? 0 : 2,
  });
  const current = demo.index;
  const message = (i: number) => messages?.[modules[i]!.key]?.trim() || modules[i]!.hover;
  // Exploring a module holds the journey where it is, then it carries on.
  const explore = (i: number | null) => {
    setTip(i);
    demo.hold(i !== null);
  };
  const static_ = count <= places;
  const lit = static_ ? current : Math.floor(places / 2);

  // Three places when the stage is narrow, so the cards stay readable.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPlaces(entry.contentRect.width < 440 ? 3 : 5);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (tip === null) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && explore(null);
    // A tap or click anywhere but a card puts the message away.
    const away = (e: PointerEvent) =>
      !(e.target as Element | null)?.closest?.("[data-card]") && explore(null);
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", away);
    };
  });

  const nodes = PLACES[places];
  return (
    <div ref={demo.ref} data-hero-modules={count} data-current={current}>
      <div
        ref={stage}
        aria-hidden
        data-moving={demo.state === "playing" || undefined}
        className="fb-signal relative aspect-[5/3] w-full"
        style={{ "--card-w": places === 3 ? "26%" : "17%" } as CSSProperties}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <path d={LINE} pathLength={1} className="fb-signal-glow" />
          <path d={LINE} pathLength={1} className="fb-signal-line" />
        </svg>
        {nodes.map(([x, y], i) => (
          <span
            key={`${places}-${i}`}
            style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${0.5 + i * 0.22}s` }}
            className={cn(
              "fb-signal-node absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-product",
              i === lit && "fb-signal-node-on",
            )}
          />
        ))}
        {modules.map((module, i) => {
          const Icon = module.icon;
          const { place, shown } = placeOf(i, current, count, places);
          const [x, y] = place === "enter" ? ENTER : place === "leave" ? LEAVE : nodes[place]!;
          const on = shown && (static_ ? i === current : place === lit);
          return (
            // The wrapper is the stage's size, so its translate is in stage percent; it carries the movement.
            <div
              key={module.key}
              data-module={module.key}
              data-shown={shown || undefined}
              style={{ transform: `translate(${x}%, ${y - 9}%)` }}
              className={cn(
                "fb-signal-track pointer-events-none absolute inset-0",
                shown ? "opacity-100" : "opacity-0",
              )}
            >
              <div
                style={{ animationDelay: `${0.35 + Math.min(i, 4) * 0.12}s` }}
                className="fb-signal-card absolute top-0 left-0 w-[var(--card-w)] -translate-x-1/2 -translate-y-full"
              >
                {/* Pointer only: keyboard and screen-reader visitors reach the same message through the dots. */}
                <div
                  data-on={on || undefined}
                  data-card=""
                  data-tip={tip === i || undefined}
                  onPointerEnter={(e) => e.pointerType === "mouse" && shown && explore(i)}
                  onPointerLeave={(e) => e.pointerType === "mouse" && explore(null)}
                  onClick={() => {
                    if (!shown) return;
                    demo.choose(i);
                    setTip(i);
                  }}
                  className={cn(
                    "group/card flex flex-col items-center gap-1.5 rounded-2xl border px-1.5 py-2.5 text-center backdrop-blur-md transition-[transform,background-color,border-color,box-shadow] duration-[var(--motion-slow)] ease-[var(--motion-ease)] @lg:px-2 @lg:py-4",
                    shown && "pointer-events-auto cursor-pointer",
                    on
                      ? "-translate-y-1.5 border-product/70 bg-product-soft shadow-[0_18px_40px_-16px_var(--product)]"
                      : "border-line-strong bg-surface/70",
                    tip === i &&
                      "-translate-y-2 border-product shadow-[0_0_0_1px_var(--product),0_16px_36px_-12px_var(--product)]",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 place-items-center rounded-xl transition-transform duration-200 @lg:size-10",
                      on ? "bg-product text-product-ink" : "bg-surface-2 text-product-text",
                      tip === i && "scale-110",
                    )}
                  >
                    <Icon className="size-3.5 @lg:size-5" />
                  </span>
                  <span className="text-[0.62rem] leading-tight font-semibold text-text @lg:text-sm">
                    {module.label}
                  </span>
                  <span className="hidden text-[0.7rem] leading-tight text-muted @2xl:block">
                    {module.note}
                  </span>
                </div>
                {tip === i && shown && (
                  // Above the card; at either end of the line it lines up inward so it never runs off the edge.
                  <span
                    data-hero-tip={module.key}
                    className={cn(
                      "fb-hero-tip pointer-events-none absolute bottom-full z-10 mb-2 w-[min(13rem,46cqw)] rounded-xl border border-product/50 bg-surface px-3 py-2 text-start text-xs leading-snug font-medium text-text shadow-[0_12px_32px_-14px_var(--product)]",
                      typeof place === "number" && place === 0
                        ? "start-0"
                        : typeof place === "number" && place === nodes.length - 1
                          ? "end-0"
                          : "start-1/2 -translate-x-1/2 rtl:translate-x-1/2",
                    )}
                  >
                    {message(i)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* There's more than fits: which module is lit, a dot for each that shows it, and pause. */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <span className="text-xs text-subtle tabular-nums" aria-hidden>
          {`${current + 1} of ${count} modules`}
        </span>
        <span className="flex">
          {modules.map((module, i) => (
            <button
              key={module.key}
              type="button"
              aria-label={`Show ${module.name}`}
              aria-description={message(i)}
              aria-pressed={i === current}
              onClick={() => demo.choose(i)}
              onFocus={() => explore(i)}
              onBlur={() => explore(null)}
              onKeyDown={(e) => e.key === "Escape" && explore(null)}
              className="grid size-6 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-[width,background-color] duration-[var(--motion-base)]",
                  i === current ? "w-4 bg-product" : "w-1.5 bg-line-strong",
                )}
              />
            </button>
          ))}
        </span>
        {motion !== "off" && <DemoControl state={demo.state} onToggle={demo.toggle} className="size-8" />}
      </div>
      {/* For a module off the line, its message reads here; screen readers hear it on the dot. */}
      <p aria-hidden className="mt-1 min-h-5 text-end text-xs text-muted">
        {tip !== null && placeOf(tip, current, count, places).shown === false ? message(tip) : ""}
      </p>
    </div>
  );
}
