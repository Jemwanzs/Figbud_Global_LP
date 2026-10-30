"use client";

import { LOCALE_COOKIE, type Locale, localeInfo, localizePath, locales } from "@figbud/i18n";
import { InverseTheme, cn } from "@figbud/ui";
import { Check, ChevronDown, Globe } from "lucide-react";
import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";

import { useDismiss } from "./use-dismiss";

export interface LanguageLabels {
  /** e.g. "Language" */
  label: string;
  /** Shown next to draft locales, e.g. "In review" */
  inReview: string;
}

function rememberLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/** Locale menu that keeps the visitor on the same page in another language. */
export function LanguageSwitcher({
  locale,
  pathname,
  labels,
  className,
}: {
  locale: Locale;
  /** Current path without the locale prefix. */
  pathname: string;
  labels: LanguageLabels;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        <Globe aria-hidden className="size-[18px]" />
        {/* Visible code first so the accessible name contains it (WCAG 2.5.3). */}
        <span>{localeInfo[locale].short}</span>
        <span className="sr-only">
          {" "}
          — {labels.label}: {localeInfo[locale].label}
        </span>
        <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      <div id={listId} hidden={!open} className="absolute end-0 top-full z-50 w-56 pt-2">
        {/* Dropdowns use the opposite theme (InverseTheme). */}
        <InverseTheme className="fb-panel fb-rise rounded-2xl p-1.5 text-text shadow-[var(--shadow-elevated)] [animation-duration:.3s]">
          <ul>
            {locales.map((code) => {
              const info = localeInfo[code];
              return (
                <li key={code}>
                  <Link
                    href={localizePath(code, pathname)}
                    hrefLang={info.tag}
                    lang={info.tag}
                    aria-current={code === locale ? "true" : undefined}
                    onClick={() => {
                      rememberLocale(code);
                      close();
                    }}
                    className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text aria-[current]:text-text"
                  >
                    <span className="flex-1">{info.label}</span>
                    {info.status === "draft" && (
                      <span className="text-[0.7rem] text-subtle">{labels.inReview}</span>
                    )}
                    {code === locale && <Check aria-hidden className="size-4 text-accent" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </InverseTheme>
      </div>
    </div>
  );
}
