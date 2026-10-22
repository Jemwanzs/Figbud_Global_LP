"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { type ComponentProps, type ReactNode, useLayoutEffect, useRef } from "react";

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

/**
 * Fades and lifts content into place the first time it scrolls into view.
 *
 * Progressive enhancement: the server HTML is always fully visible, so the LCP
 * never waits for hydration and nothing is lost without JavaScript. After
 * hydration only content still below the fold is hidden, then revealed with a
 * native Web Animation when it enters the viewport.
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
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already on screen: never hide content the visitor can see.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    el.style.opacity = "0";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
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
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.style.opacity = "";
    };
  }, [delay, y]);

  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  );
}
