"use client";

import { LazyMotion, MotionConfig, domAnimation, m, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

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

/** Fades and lifts content into place the first time it scrolls into view. */
export function Reveal({
  delay = 0,
  y = 24,
  children,
  ...props
}: { delay?: number; y?: number; children: ReactNode } & HTMLMotionProps<"div">) {
  return (
    <m.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.8, ease: EASE_OUT_EXPO, delay }}
      {...props}
    >
      {children}
    </m.div>
  );
}
