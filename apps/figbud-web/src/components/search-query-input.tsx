"use client";

import { type InputHTMLAttributes, useEffect, useRef } from "react";

/**
 * The site search box. The page's results stream in after it, so the box is
 * rendered once, outside them: anything typed before the page finishes
 * loading is kept. Once loaded, an empty box shows the current query.
 */
export function SearchQueryInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue">) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q")?.trim().slice(0, 100);
    if (q && ref.current && !ref.current.value) ref.current.value = q;
  }, []);
  return <input ref={ref} {...props} />;
}
