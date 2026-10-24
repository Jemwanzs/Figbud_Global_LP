"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";

/**
 * Description cards on product links: shown on hover and keyboard focus (CSS),
 * and on touch screens, which have no hover, the first tap shows the card and
 * the next one follows the link. Tapping elsewhere or Escape closes it.
 */
export function useRevealOnTap<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!open && window.matchMedia("(hover: none)").matches) {
      event.preventDefault();
      setOpen(true);
    }
  };

  return { ref, open, onClick };
}
