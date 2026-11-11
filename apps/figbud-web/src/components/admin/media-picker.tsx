"use client";

import { cn } from "@figbud/ui";
import { ImagePlus, Search, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";

import { type MediaItem, STUDIO_MEDIA_BASE } from "./page-types";

/** Smaller than this, a logo looks soft on the websites (it still can be used). */
const MIN_WIDTH = 160;

/** Why an image may not suit a logo, if it may not. */
export function logoAdvice(item: MediaItem): string | null {
  if (!item.content_type.startsWith("image/")) return "This file isn't an image.";
  if (item.content_type !== "image/svg+xml" && item.width < MIN_WIDTH)
    return `This image is ${item.width}×${item.height} px: it may look soft. A logo at least ${MIN_WIDTH} px wide (or an SVG) looks sharp.`;
  return null;
}

/**
 * Chooses an image from the corporate media library (owner's brief, 12 Nov
 * 2026): thumbnails with search, the choice shown at once on light and dark
 * backgrounds, Replace and Remove. Clicking the preview opens the library.
 * Images keep their proportions and colours.
 */
export function MediaPicker({
  label,
  hint,
  value,
  media,
  disabled,
  error,
  onChange,
}: {
  label: string;
  hint: string;
  value: string | null;
  media: MediaItem[];
  disabled: boolean;
  error?: string;
  onChange: (id: string | null) => void;
}) {
  const uid = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const chosen = media.find((m) => m.id === value) ?? null;
  const missing = Boolean(value) && !chosen;
  const advice = chosen ? logoAdvice(chosen) : null;
  const items = media.filter(
    (m) => !m.archived_at && `${m.label} ${m.alt_text}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const open = () => {
    setQuery("");
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  const src = (m: MediaItem) => `${STUDIO_MEDIA_BASE}${m.id}`;

  return (
    <div>
      <p id={`${uid}-label`} className="block text-sm font-medium text-text">
        {label}
      </p>
      <p className="mt-0.5 text-xs text-subtle">{hint}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={open}
          aria-labelledby={`${uid}-label`}
          aria-describedby={`${uid}-state`}
          className="group focus-visible:outline-focus grid w-full max-w-sm grid-cols-2 overflow-hidden rounded-xl border border-line-strong text-start transition-colors hover:border-accent focus-visible:outline-2 disabled:opacity-60 sm:w-auto"
        >
          {chosen ? (
            // The logo on a light and on a dark tile, as websites in either theme show it.
            (["#ffffff", "#141012"] as const).map((bg) => (
              <span
                key={bg}
                className="flex h-20 w-full min-w-32 items-center justify-center p-3"
                style={{ background: bg }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Studio-only private image proxy */}
                <img
                  src={src(chosen)}
                  alt={bg === "#ffffff" ? chosen.alt_text : ""}
                  className="max-h-full max-w-full object-contain"
                />
              </span>
            ))
          ) : (
            <span className="col-span-2 flex h-20 items-center justify-center gap-2 bg-surface-2 px-6 text-sm text-muted group-hover:text-text">
              <ImagePlus aria-hidden className="size-4" />
              Choose from the media library
            </span>
          )}
        </button>
        {chosen && !disabled && (
          <span className="flex gap-2">
            <button
              type="button"
              onClick={open}
              className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium text-text hover:bg-surface-2"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-text"
            >
              Remove
            </button>
          </span>
        )}
      </div>
      <p
        id={`${uid}-state`}
        className={cn("mt-1.5 text-sm", error || missing || advice ? "text-warning" : "text-subtle")}
      >
        {error ??
          (missing
            ? "The chosen image is no longer in the media library: choose another."
            : (advice ??
              (chosen ? `${chosen.label} · ${chosen.width}×${chosen.height} px` : "No image chosen.")))}
      </p>

      <dialog
        ref={dialog}
        aria-labelledby={`${uid}-title`}
        onClick={(e) => e.target === e.currentTarget && close()}
        className="fb-overlay m-auto w-[min(56rem,calc(100vw-2rem))] rounded-2xl border border-line bg-bg p-0 text-text shadow-[var(--shadow-elevated)] backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <h2 id={`${uid}-title`} className="font-semibold">
            {label}: choose an image
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-text"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="p-4">
          <label className="relative block">
            <span className="sr-only">Search the media library</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or description"
              className="min-h-11 w-full rounded-xl border border-line-strong bg-surface ps-10 pe-4 text-text"
            />
          </label>
          {items.length ? (
            <ul className="mt-4 grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
              {items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    aria-pressed={m.id === value}
                    onClick={() => {
                      onChange(m.id);
                      close();
                    }}
                    className={cn(
                      "focus-visible:outline-focus grid w-full gap-2 rounded-xl border p-2 text-start transition-colors hover:border-accent focus-visible:outline-2",
                      m.id === value ? "border-action bg-surface-2" : "border-line",
                    )}
                  >
                    <span className="flex h-24 items-center justify-center rounded-lg bg-[repeating-conic-gradient(var(--surface-2)_0_25%,var(--surface)_0_50%)] bg-[length:16px_16px] p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Studio-only private image proxy */}
                      <img
                        src={src(m)}
                        alt=""
                        loading="lazy"
                        className="max-h-full max-w-full object-contain"
                      />
                    </span>
                    <span className="line-clamp-2 text-xs text-text">{m.label}</span>
                    <span className="text-xs text-subtle">
                      {m.width}×{m.height}
                      {logoAdvice(m) ? " · small" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-muted">
              {media.length ? "No image matches that search." : "The media library has no images yet."}
            </p>
          )}
          <p className="mt-4 text-sm text-subtle">
            Not there?{" "}
            <Link href="/admin/sites/figbud/media" className="text-accent underline underline-offset-2">
              Upload to the FigBud Global media library
            </Link>
            , then come back.
          </p>
        </div>
      </dialog>
    </div>
  );
}
