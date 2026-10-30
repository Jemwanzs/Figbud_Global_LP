"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { cn } from "./cn";

export type Theme = "dark" | "light";
export const THEME_STORAGE_KEY = "fb-theme";

/**
 * Inline, render-blocking script that applies the theme before first paint
 * (no flash). Dark is the default for every first-time visitor, whatever the
 * device prefers; a theme the visitor picked is remembered. Older saved
 * values ("system") fall back to dark. `data-theme` holds the theme in use.
 */
export const themeInitScript = `(function(){try{document.documentElement.dataset.theme=localStorage.getItem("${THEME_STORAGE_KEY}")==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}})()`;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const getTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

/** Applies and remembers the visitor's theme. */
export function setTheme(next: Theme) {
  // Colours change at once: hover and focus transitions would otherwise
  // animate every surface and text colour through the old theme.
  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(freeze);
  document.documentElement.dataset.theme = next;
  // Apply the new colours before transitions come back.
  void window.getComputedStyle(document.body).color;
  requestAnimationFrame(() => requestAnimationFrame(() => freeze.remove()));
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this visit.
  }
}

/** The theme in use (the server renders dark, the default, until hydration). */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => "dark" as const);
}

export interface ThemeLabels {
  /** Announced while the dark theme is on, e.g. "Switch to light theme". */
  toLight: string;
  /** Announced while the light theme is on, e.g. "Switch to dark theme". */
  toDark: string;
}

/**
 * One button that flips between the dark and light themes: a sun while dark
 * is on (click for light), a moon while light is on. The icons follow
 * `data-theme` through CSS, so the right one shows before hydration.
 */
export function ThemeToggle({ labels, className }: { labels: ThemeLabels; className?: string }) {
  const theme = useTheme();
  const label = theme === "dark" ? labels.toLight : labels.toDark;
  const icon =
    "absolute size-4 transition-[opacity,rotate,scale] duration-300 ease-out motion-reduce:transition-none";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={cn(
        "group relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface/60 text-muted",
        "transition-colors duration-200 hover:border-line-strong hover:bg-surface-2 hover:text-text",
        "focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none",
        className,
      )}
    >
      <Sun
        aria-hidden
        data-theme-icon="sun"
        className={cn(
          icon,
          "group-hover:rotate-45 [[data-theme=light]_&]:scale-50 [[data-theme=light]_&]:-rotate-90 [[data-theme=light]_&]:opacity-0",
        )}
      />
      <Moon
        aria-hidden
        data-theme-icon="moon"
        className={cn(
          icon,
          "scale-50 rotate-90 opacity-0 [[data-theme=light]_&]:scale-100 [[data-theme=light]_&]:rotate-0 [[data-theme=light]_&]:opacity-100 [[data-theme=light]_&]:group-hover:-rotate-12",
        )}
      />
    </button>
  );
}
