import type { CSSProperties } from "react";

/**
 * Style for a part of a `RevealGroup` (motion.tsx): its place in the sequence
 * and where it travels from. Plain (not a client module), so server
 * components can call it.
 */
export const revealOrder = (order: number, from?: { x?: string; y?: string }): CSSProperties =>
  ({
    "--reveal-order": order,
    ...(from?.x && { "--reveal-x": from.x }),
    ...(from?.y && { "--reveal-y": from.y }),
  }) as CSSProperties;
