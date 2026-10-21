"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { cn } from "./cn";

export type Theme = "dark" | "light";
export const THEME_STORAGE_KEY = "fb-theme";

/**
 * Inline, render-blocking script that applies the saved theme before first
 * paint (no flash). Dark is the default regardless of OS preference.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){}})()`;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function getTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerTheme(): Theme {
  return "dark";
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
  const setTheme = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies for this visit.
    }
  };
  return [theme, setTheme];
}

export function ThemeToggle({
  labels,
  className,
}: {
  labels: { toLight: string; toDark: string };
  className?: string;
}) {
  const [theme, setTheme] = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? labels.toLight : labels.toDark;
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors",
        "hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none",
        className,
      )}
    >
      <Sun
        aria-hidden
        className={cn(
          "absolute size-[18px] transition-all duration-300 ease-out-expo",
          isDark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
      />
      <Moon
        aria-hidden
        className={cn(
          "absolute size-[18px] transition-all duration-300 ease-out-expo",
          isDark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0",
        )}
      />
    </button>
  );
}
