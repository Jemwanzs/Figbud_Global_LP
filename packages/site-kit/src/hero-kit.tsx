"use client";

import { cn } from "@figbud/ui";
import { useEffect, useRef, useState } from "react";

/*
 * Hero Design Studio (P12): the shared vocabulary of hero designs. Settings
 * mirror services/api/src/heroes.rs; every design reads the same settings
 * object, and the Studio's preview renders the very components websites do.
 */

export type HeroDesign =
  "ecosystem" | "cinematic" | "universe" | "edition" | "workforce" | "payroll" | "journey" | "chapters";

export interface HeroConfig {
  eyebrow?: string | null;
  headline?: string | null;
  headline_accent?: string | null;
  lead?: string | null;
  primary_label?: string | null;
  primary_href?: string | null;
  secondary_label?: string | null;
  secondary_href?: string | null;
  motion: boolean;
  speed: "slow" | "normal" | "fast";
  intensity: "subtle" | "standard" | "bold";
  height: "auto" | "tall" | "screen";
  align: "start" | "center";
  accent: "brand" | "blue" | "violet" | "neutral";
  mobile_layout: "stacked" | "compact";
  background_image_id?: string | null;
}

export interface HeroVariant {
  id: string;
  design: HeroDesign;
  name: string;
  config: HeroConfig;
}

/** The live hero: `GET /v1/sites/{slug}/hero`. */
export interface PublishedHero {
  variant_id: string;
  design: HeroDesign;
  name: string;
  config: HeroConfig;
}

export const DEFAULT_HERO_CONFIG: HeroConfig = {
  motion: true,
  speed: "normal",
  intensity: "standard",
  height: "auto",
  align: "start",
  accent: "brand",
  mobile_layout: "stacked",
};

type Field = keyof HeroConfig;
const TEXT: Field[] = ["eyebrow", "headline", "headline_accent", "lead"];
const CTA: Field[] = ["primary_label", "primary_href", "secondary_label", "secondary_href"];
const LOOK: Field[] = ["motion", "speed", "intensity", "height", "accent", "mobile_layout"];

/** Each design's description and the settings it exposes (its structure stays fixed). */
export const HERO_DESIGNS: Record<HeroDesign, { name: string; summary: string; fields: Field[] }> = {
  ecosystem: {
    name: "Connected Ecosystem",
    summary: "The current production hero: headline, CTAs and the live ecosystem visualisation.",
    fields: [...TEXT, ...CTA, "motion"],
  },
  cinematic: {
    name: "Beyond the Ordinary",
    summary: "Cinematic dimensional shapes, light and depth with a concise headline.",
    fields: [...TEXT, ...CTA, ...LOOK, "align", "background_image_id"],
  },
  universe: {
    name: "The FigBud Universe",
    summary: "Product panels unfold in perspective, connect, and settle into an interactive showcase.",
    fields: [...TEXT, ...CTA, ...LOOK],
  },
  edition: {
    name: "The FigBud Edition",
    summary:
      "Editorial: an oversized headline, a numbered index of the platforms and layered product sheets.",
    fields: [...TEXT, ...CTA, "motion", "speed", "height"],
  },
  workforce: {
    name: "Your Workforce, Connected",
    summary: "HR and payroll messaging with an interactive dashboard preview.",
    fields: [...TEXT, ...CTA, ...LOOK, "align"],
  },
  payroll: {
    name: "Payroll in Motion",
    summary: "An illustrative payroll run: prepare, validate, approve, disburse, report.",
    fields: [...TEXT, ...CTA, ...LOOK],
  },
  journey: {
    name: "The Employee Journey",
    summary: "Layered lifecycle cards: recruit, onboard, manage, grow, exit.",
    fields: [...TEXT, ...CTA, ...LOOK],
  },
  chapters: {
    name: "People, in Chapters",
    summary: "Editorial: an oversized headline, a numbered index of the modules and layered record sheets.",
    fields: [...TEXT, ...CTA, "motion", "speed", "height"],
  },
};

/** Seconds multiplier for a design's own timings. */
export const heroPace = (c: HeroConfig) => (c.speed === "slow" ? 1.5 : c.speed === "fast" ? 0.7 : 1);
/** Depth multiplier for movement and light. */
export const heroDepth = (c: HeroConfig) =>
  c.intensity === "subtle" ? 0.5 : c.intensity === "bold" ? 1.5 : 1;

export const heroHeight = (c: HeroConfig) =>
  c.height === "screen" ? "lg:min-h-[calc(100dvh-5rem)]" : c.height === "tall" ? "lg:min-h-[78dvh]" : "";

/** Whether to animate: the setting, and never against the visitor's reduced-motion preference. */
export function useHeroMotion(config: HeroConfig) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return config.motion && !reduced;
}

/** Whether `ref` is on screen (animations pause off screen to save battery). */
export function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => setOn(Boolean(e?.isIntersecting)), {
      threshold: 0.05,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, on };
}

/**
 * Pointer parallax for fine pointers: writes --px / --py (−1…1) on the
 * element, in one animation frame at most. Off for touch and reduced motion.
 */
export function usePointerParallax<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect();
        el.style.setProperty("--px", (((event.clientX - box.left) / box.width) * 2 - 1).toFixed(3));
        el.style.setProperty("--py", (((event.clientY - box.top) / box.height) * 2 - 1).toFixed(3));
      });
    };
    const leave = () => {
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [enabled]);
  return ref;
}

/** Steps through `count` stages while `running`; visitors can choose a stage, which pauses it. */
export function useStages(count: number, seconds: number, running: boolean) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!running || held || count < 2) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % count), seconds * 1000);
    return () => window.clearTimeout(id);
  }, [index, running, held, count, seconds]);
  return {
    index,
    choose: (i: number) => {
      setHeld(true);
      setIndex(i);
    },
    hold: setHeld,
  };
}

/** A number that eases to its new value (payroll figures between stages). */
export function useTween(target: number, run: boolean, ms = 700) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (!run) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(origin + (target - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run, ms]);
  return value;
}

/** Shared CTA pair for hero designs. */
export function HeroActions({
  primary,
  secondary,
  center,
}: {
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  center?: boolean;
}) {
  return (
    <div
      className={cn("mt-8 flex flex-col gap-3 sm:flex-row sm:items-center", center && "sm:justify-center")}
    >
      <a
        href={primary.href}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-product px-6 font-medium text-product-ink shadow-[0_14px_36px_-16px_var(--product)] transition-[transform,box-shadow] duration-[var(--motion-base)] hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-18px_var(--product)]"
      >
        {primary.label}
        <span aria-hidden>→</span>
      </a>
      {secondary && (
        <a
          href={secondary.href}
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong bg-surface/60 px-6 font-medium text-text backdrop-blur transition-colors hover:border-product/60"
        >
          {secondary.label}
        </a>
      )}
    </div>
  );
}
