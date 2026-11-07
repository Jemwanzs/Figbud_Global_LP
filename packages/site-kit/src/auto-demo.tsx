"use client";

import { cn } from "@figbud/ui";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/*
 * The auto-demo engine (owner's brief, 7 Nov 2026): product demonstrations
 * show themselves. A demonstration starts once most of it is in view, moves
 * through its states on one shared clock (one timer for the whole page, not
 * one per demonstration), pauses when it leaves the screen or while focus is
 * inside it (so nothing changes under a keyboard or screen-reader user), and
 * stops after a few passes rather than looping for ever. Choosing a state by
 * hand takes over for a while, then the demonstration carries on from there.
 * With reduced motion it never moves by itself: the first state shows and
 * every control still works.
 */

export type DemoState = "idle" | "playing" | "paused" | "manual" | "completed";

// One clock for every demonstration on the page.
const TICK = 200;
const listeners = new Set<(elapsed: number) => void>();
let clock = 0;
let last = 0;
// Whether the visitor's last interaction was the keyboard (browsers differ on
// :focus-visible after a click, so it's tracked directly).
let keyboard = false;
let tracking = false;
function track() {
  if (tracking) return;
  tracking = true;
  window.addEventListener("keydown", () => (keyboard = true), { capture: true, passive: true });
  window.addEventListener("pointerdown", () => (keyboard = false), { capture: true, passive: true });
}

function subscribe(listener: (elapsed: number) => void) {
  track();
  listeners.add(listener);
  if (!clock) {
    last = performance.now();
    clock = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      for (const fn of listeners) fn(elapsed);
    }, TICK);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.clearInterval(clock);
      clock = 0;
    }
  };
}

export function useAutoDemo<T extends HTMLElement>({
  durations,
  passes = 2,
  resumeAfter = 12_000,
}: {
  /** How long each state shows, in milliseconds (one entry per state). */
  durations: number[];
  /** How many times through before it rests on the last state. */
  passes?: number;
  /** How long a choice made by hand holds before the demonstration carries on. */
  resumeAfter?: number;
}) {
  const ref = useRef<T>(null);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<DemoState>("idle");
  const live = useRef({
    index: 0,
    visible: false,
    focused: false,
    paused: false,
    manualFor: 0,
    elapsed: 0,
    passes: 0,
    started: false,
  });
  const count = durations.length;
  const timings = useRef(durations);
  timings.current = durations;

  const go = useCallback((next: number) => {
    live.current.index = next;
    live.current.elapsed = 0;
    setIndex(next);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const s = live.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Most of it in view; for one taller than the screen (stacked on phones), half the screen.
        s.visible =
          entry.intersectionRatio >= 0.55 || entry.intersectionRect.height >= window.innerHeight * 0.5;
      },
      // Fine steps, so a tall demonstration is re-checked as it scrolls, not only at its edges.
      { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
    );
    observer.observe(el);
    // Keyboard focus inside holds it still (a mouse click on a control is a choice instead).
    const focus = () => {
      s.focused = keyboard && el.contains(document.activeElement);
    };
    const blur = () => window.setTimeout(focus);
    el.addEventListener("focusin", focus);
    el.addEventListener("focusout", blur);
    const unsubscribe = subscribe((elapsed) => {
      let next: DemoState;
      if (s.paused) next = "paused";
      else if (s.manualFor > 0) {
        s.manualFor -= elapsed;
        next = "manual";
      } else if (s.passes >= passes) next = "completed";
      else if (!s.visible || s.focused) next = s.started ? "paused" : "idle";
      else {
        s.started = true;
        next = "playing";
        s.elapsed += elapsed;
        if (s.elapsed >= (timings.current[s.index] ?? 3000)) {
          if (s.index + 1 < timings.current.length) go(s.index + 1);
          else {
            s.passes += 1;
            if (s.passes < passes) go(0);
            else s.elapsed = 0;
          }
        }
      }
      setState(next);
    });
    return () => {
      observer.disconnect();
      unsubscribe();
      el.removeEventListener("focusin", focus);
      el.removeEventListener("focusout", blur);
    };
  }, [go, passes]);

  /** A state chosen by hand: it holds, then the demonstration carries on from there. */
  const choose = useCallback(
    (i: number) => {
      live.current.manualFor = resumeAfter;
      live.current.passes = 0;
      go(Math.max(0, Math.min(count - 1, i)));
      setState("manual");
    },
    [count, go, resumeAfter],
  );

  /** The pause, play and replay button. */
  const toggle = useCallback(() => {
    const s = live.current;
    if (s.passes >= passes) {
      s.passes = 0;
      s.paused = false;
      s.manualFor = 0;
      go(0);
      return;
    }
    s.paused = !s.paused;
    s.manualFor = 0;
    setState(s.paused ? "paused" : "playing");
  }, [go, passes]);

  return { ref, index, state, choose, toggle };
}

/** Pause, play or replay a demonstration. Hidden with reduced motion, when nothing moves by itself. */
export function DemoControl({
  state,
  onToggle,
  className,
}: {
  state: DemoState;
  onToggle: () => void;
  className?: string;
}) {
  if (state === "idle") return null;
  const playing = state === "playing" || state === "manual";
  const label =
    state === "completed" ? "Replay demonstration" : playing ? "Pause demonstration" : "Play demonstration";
  const Icon = state === "completed" ? RotateCcw : playing ? Pause : Play;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      data-demo-control={state}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface/80 text-muted backdrop-blur transition-colors hover:border-product hover:text-text focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none",
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}
