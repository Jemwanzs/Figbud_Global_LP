"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { type KeyboardEvent, useRef, useSyncExternalStore } from "react";

import { cn } from "./cn";

export type Theme = "dark" | "light";
/** What the visitor chose: a fixed theme, or whatever their device prefers. */
export type ThemePreference = Theme | "system";
export const THEME_STORAGE_KEY = "fb-theme";

/**
 * Inline, render-blocking script that applies the theme before first paint
 * (no flash). The saved preference wins; without one (or with "system") the
 * device setting decides, and changes to it apply live. `data-theme` holds the
 * theme in use, `data-theme-preference` the visitor's choice.
 */
export const themeInitScript = `(function(){try{var d=document.documentElement,m=matchMedia("(prefers-color-scheme: light)"),p=localStorage.getItem("${THEME_STORAGE_KEY}");if(p!=="light"&&p!=="dark")p="system";var a=function(){var q=d.dataset.themePreference;d.dataset.theme=q==="system"?(m.matches?"light":"dark"):q};d.dataset.themePreference=p;a();m.addEventListener("change",a)}catch(e){}})()`;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-theme-preference"],
  });
  return () => observer.disconnect();
}

const getTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
const getPreference = (): ThemePreference => {
  const value = document.documentElement.dataset.themePreference;
  return value === "light" || value === "dark" ? value : "system";
};

/** Sets and remembers the visitor's choice; "system" follows the device. */
export function setThemePreference(next: ThemePreference) {
  const root = document.documentElement;
  root.dataset.themePreference = next;
  root.dataset.theme =
    next === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this visit.
  }
}

/** The theme in use and the visitor's preference (the server renders dark until hydration). */
export function useTheme(): { theme: Theme; preference: ThemePreference } {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark" as const);
  const preference = useSyncExternalStore(subscribe, getPreference, () => "system" as const);
  return { theme, preference };
}

export interface ThemeLabels {
  /** The group's name, e.g. "Theme". */
  label: string;
  light: string;
  dark: string;
  system: string;
}

const OPTIONS = [
  { value: "light", Icon: Sun },
  { value: "dark", Icon: Moon },
  { value: "system", Icon: Monitor },
] as const;

/**
 * Light / Dark / System switch: three icon buttons forming one radio group
 * (arrow keys move between them, the chosen one is announced).
 */
export function ThemeToggle({ labels, className }: { labels: ThemeLabels; className?: string }) {
  const { preference } = useTheme();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const rtl = document.documentElement.dir === "rtl";
    const forward = ["ArrowDown", rtl ? "ArrowLeft" : "ArrowRight"];
    const back = ["ArrowUp", rtl ? "ArrowRight" : "ArrowLeft"];
    const step = forward.includes(event.key) ? 1 : back.includes(event.key) ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + OPTIONS.length) % OPTIONS.length;
    setThemePreference(OPTIONS[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={labels.label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-line bg-surface/60 p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, Icon }, index) => {
        const checked = preference === value;
        return (
          <button
            key={value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={labels[value]}
            title={labels[value]}
            tabIndex={checked ? 0 : -1}
            onClick={() => setThemePreference(value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-full transition-colors duration-200",
              "focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none",
              checked ? "bg-surface-3 text-text shadow-sm" : "text-subtle hover:text-text",
            )}
          >
            <Icon aria-hidden className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
