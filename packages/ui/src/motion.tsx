"use client";

import { Pause, Play } from "lucide-react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import {
  Children,
  type CSSProperties,
  type ComponentProps,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "./cn";

/**
 * Loads Motion's lightweight DOM feature set once and honours the visitor's
 * reduced-motion preference everywhere below it.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The one scroll trigger behind every reveal (UI-MO1). Progressive
 * enhancement: it arms only after hydration, with motion allowed, for content
 * still below the fold, so server HTML, the LCP and no-JS visits always show
 * the final state. `show` runs once, when the element is meaningfully visible.
 * Returns the cleanup, or null when nothing was armed.
 */
export function armReveal(el: Element, show: () => void): (() => void) | null {
  if (reducedMotion()) return null;
  // Already on screen: never hide content the visitor can see.
  if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return null;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      show();
    },
    { rootMargin: "0px 0px -12% 0px" },
  );
  observer.observe(el);
  return () => observer.disconnect();
}

/**
 * Fades and lifts content into place the first time it scrolls into view,
 * with a native Web Animation (see `armReveal`).
 */
export function Reveal({
  delay = 0,
  y = 24,
  children,
  ...props
}: { delay?: number; y?: number; children: ReactNode } & ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = armReveal(el, () => {
      el.style.opacity = "";
      el.animate(
        [
          { opacity: 0, transform: `translateY(${y}px)` },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: 800,
          delay: delay * 1000,
          easing: `cubic-bezier(${EASE_OUT_EXPO.join(",")})`,
          fill: "backwards",
        },
      );
    });
    if (!stop) return;
    el.style.opacity = "0";
    return () => {
      stop();
      el.style.opacity = "";
    };
  }, [delay, y]);

  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  );
}

/**
 * Reveals its parts in sequence when it scrolls into view, each group on its
 * own (a philosophy row, a capability). Mark parts with `fb-reveal-item`
 * (fade and travel), `fb-reveal-line` (an accent line drawn from the start),
 * `fb-reveal-roll` (a number rolling up) or `fb-reveal-glow` (a one-off glow),
 * and order them with `revealOrder()`. All motion is CSS (site-kit styles).
 */
export function RevealGroup({ children, ...props }: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = armReveal(el, () => {
      el.dataset.reveal = "shown";
    });
    if (!stop) return;
    el.dataset.reveal = "waiting";
    return () => {
      stop();
      delete el.dataset.reveal;
    };
  }, []);

  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  );
}

/**
 * A number that counts up from zero the first time it scrolls into view.
 * The server renders the final, correctly formatted value (also what screen
 * readers get); an invisible copy reserves its width so nothing shifts.
 * `format` takes Intl.NumberFormat options: currencies such as KES, percent,
 * compact notation (1.2M) and fixed decimals.
 */
export function CountUp({
  value,
  locale,
  format,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  locale: string;
  format?: Intl.NumberFormatOptions;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const final = `${prefix}${new Intl.NumberFormat(locale, format).format(value)}${suffix}`;
  const options = JSON.stringify(format ?? {});

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = new Intl.NumberFormat(locale, JSON.parse(options) as Intl.NumberFormatOptions);
    const show = (n: number) => {
      el.textContent = `${prefix}${fmt.format(n)}${suffix}`;
    };
    let frame = 0;
    const stop = armReveal(el, () => {
      const start = performance.now();
      const duration = 1600;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        // Ease-out: quick at first, settling exactly on the value.
        show(t === 1 ? value : value * (1 - Math.pow(1 - t, 3)));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    if (!stop) return;
    show(0);
    return () => {
      stop();
      cancelAnimationFrame(frame);
      show(value);
    };
  }, [value, locale, options, prefix, suffix]);

  return (
    <span className={cn("relative inline-grid tabular-nums", className)}>
      {/* Number formatting can differ slightly between the server's and the browser's Intl data. */}
      <span aria-hidden className="invisible col-start-1 row-start-1" suppressHydrationWarning>
        {final}
      </span>
      <span ref={ref} aria-hidden className="col-start-1 row-start-1" suppressHydrationWarning>
        {final}
      </span>
      <span className="sr-only" suppressHydrationWarning>
        {final}
      </span>
    </span>
  );
}

/**
 * A slow, seamless right-to-left row (logos). Items repeat until the row is
 * wide enough, and a second identical half follows so the loop never jumps;
 * repeats are hidden from assistive technology and keyboard focus. Hover,
 * keyboard focus and the pause button stop it (WCAG 2.2.2). With reduced
 * motion it becomes a still row that scrolls sideways. Fewer than `minItems`
 * items show as a still, centred row.
 */
export function Marquee({
  children,
  label,
  labels,
  duration,
  minItems = 3,
  className,
  itemClassName,
}: {
  children: ReactNode;
  /** What the row shows, for assistive technology. */
  label: string;
  labels: { pause: string; play: string };
  /** Seconds per loop; defaults to --motion-marquee. */
  duration?: number;
  minItems?: number;
  className?: string;
  itemClassName?: string;
}) {
  const [paused, setPaused] = useState(false);
  const items = Children.toArray(children);
  if (items.length < minItems) {
    return (
      <ul aria-label={label} className={cn("flex flex-wrap justify-center gap-4 sm:gap-6", className)}>
        {items.map((item, i) => (
          <li key={i} className={itemClassName}>
            {item}
          </li>
        ))}
      </ul>
    );
  }
  const repeats = Math.max(1, Math.ceil(8 / items.length));
  const half = (copy: boolean) =>
    Array.from({ length: repeats }, (_, r) =>
      items.map((item, i) => {
        const hidden = copy || r > 0;
        return (
          <li
            key={`${r}-${i}`}
            aria-hidden={hidden || undefined}
            inert={hidden || undefined}
            className={cn("shrink-0", hidden && "fb-marquee-copy", itemClassName)}
          >
            {item}
          </li>
        );
      }),
    );

  return (
    <div className={className}>
      <div
        className="fb-marquee py-2"
        data-paused={paused || undefined}
        style={duration ? ({ "--marquee-duration": `${duration}s` } as CSSProperties) : undefined}
      >
        <div className="fb-marquee-track">
          <ul aria-label={label} className="flex gap-4 pe-4 sm:gap-6 sm:pe-6">
            {half(false)}
          </ul>
          <ul aria-hidden inert className="fb-marquee-copy flex gap-4 pe-4 sm:gap-6 sm:pe-6">
            {half(true)}
          </ul>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        className="mx-auto mt-3 flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs text-subtle transition-colors hover:text-text motion-reduce:hidden"
      >
        {paused ? <Play aria-hidden className="size-3.5" /> : <Pause aria-hidden className="size-3.5" />}
        {paused ? labels.play : labels.pause}
      </button>
    </div>
  );
}
