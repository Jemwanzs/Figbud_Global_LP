"use client";

import { useEffect, useRef, useState } from "react";

/*
 * The scroll engine shared by the scroll stories, the module showcase, the
 * module tour and guided demonstrations (UI-MO6, UI-SS3): which step the
 * pinned stretch is at, one step at a time, with passive listeners and one
 * write per frame. On its own so that pages load only what they show (P2-18).
 */

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
