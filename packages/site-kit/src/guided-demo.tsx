"use client";

import { cn } from "@figbud/ui";
import { type CSSProperties, type ReactNode, createContext, useContext, useSyncExternalStore } from "react";

import { type DemoState, useAutoDemo } from "./auto-demo";
import { useScrollStory } from "./scroll-engine";

/*
 * Smart scroll storytelling (owner's brief, 12 Nov 2026): a demonstration
 * with steps stays in view while scrolling moves it through them, forwards
 * and back, then the page carries on. It reuses the scroll stories' engine
 * (`useScrollStory`: passive listeners, sticky positioning, a runway sized to
 * the steps), so the browser's own scrolling is never intercepted and nothing
 * is locked. Choosing a step scrolls to it (the choice stands); "Skip" leaves
 * the demonstration. On phones, with reduced motion, or when an editor turns
 * it off, the demonstration plays by itself as before (`useAutoDemo`).
 */

const WIDE = "(min-width: 64rem)";
const QUIET = "(prefers-reduced-motion: reduce)";
function subscribe(onChange: () => void) {
  const queries = [window.matchMedia(WIDE), window.matchMedia(QUIET)];
  for (const q of queries) q.addEventListener("change", onChange);
  return () => {
    for (const q of queries) q.removeEventListener("change", onChange);
  };
}
/** Wide screens without reduced motion: where guided scrolling runs. */
function useGuidable() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches && !window.matchMedia(QUIET).matches,
    () => false,
  );
}

type Guide = { step: number; goTo: (i: number) => void } | null;
const GuideContext = createContext<Guide>(null);

/**
 * Wraps a demonstration (with its heading) so scrolling guides it through
 * `steps` steps on wide screens. Elsewhere it renders the content unchanged.
 */
export function GuidedDemo({
  steps,
  enabled = true,
  label,
  children,
}: {
  steps: number;
  enabled?: boolean;
  /** What the demonstration shows, for the skip control. */
  label: string;
  children: ReactNode;
}) {
  const guidable = useGuidable();
  const story = useScrollStory(steps);
  if (!enabled || steps < 2) return <>{children}</>;
  // The same markup before and after the page loads, and on every screen:
  // CSS (`.fb-guided*`, wide screens without reduced motion) pins it, sizes
  // its scrolling and shows its controls, so nothing shifts or remounts as
  // the page becomes interactive. JavaScript only follows the scroll.
  return (
    <div
      ref={story.root}
      data-guided={guidable ? "" : undefined}
      data-step={guidable ? story.step : undefined}
      style={{ "--story-progress": 0, "--story-steps": steps } as CSSProperties}
      className="fb-guided relative"
    >
      <div className="fb-guided-pin">
        <GuideContext.Provider value={guidable ? { step: story.step, goTo: story.goTo } : null}>
          {children}
        </GuideContext.Provider>
        <div className="fb-guided-controls mt-4 items-center gap-4">
          {/* Where the demonstration is: it fills as the steps go by. */}
          <span aria-hidden className="relative h-1 flex-1 overflow-hidden rounded-full bg-line">
            <span
              className="absolute inset-y-0 start-0 rounded-full bg-product transition-[width] duration-[var(--motion-base)]"
              style={{ width: `${((story.step + 1) / steps) * 100}%` }}
            />
          </span>
          <span className="text-xs text-subtle tabular-nums">{`${story.step + 1} / ${steps}`}</span>
          <button
            type="button"
            onClick={story.leave}
            // The visible words first (label in name), then which demonstration.
            aria-label={`Skip this demonstration: ${label.replace(/[.!?]+$/, "")}`}
            className={cn(
              "min-h-9 rounded-full px-3 text-xs text-muted underline-offset-4 hover:text-text hover:underline",
              "focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none",
            )}
          >
            Skip this demonstration
          </button>
        </div>
      </div>
      {/* The scrolling the steps take; the panel releases right after the last one. */}
      <div data-runway="" aria-hidden className="fb-guided-runway" />
    </div>
  );
}

/**
 * A demonstration's state: driven by scrolling inside a `GuidedDemo` on wide
 * screens, by its own clock elsewhere. Same shape as `useAutoDemo`.
 */
export function useDemo<T extends HTMLElement>(durations: number[]) {
  const guide = useContext(GuideContext);
  // While guided, the clock stays out of it.
  const demo = useAutoDemo<T>({ durations, passes: guide ? 0 : 2 });
  if (!guide) return demo;
  const step = Math.min(durations.length - 1, Math.max(0, guide.step));
  return {
    ...demo,
    index: step,
    state: "guided" as DemoState,
    choose: guide.goTo,
    toggle: () => {},
    hold: () => {},
  };
}
