"use client";

import { type Locale, interfaceCopy } from "@figbud/i18n";
import { cn } from "@figbud/ui";
import { Expand, Maximize2, Minimize2, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { DemoControl, useAutoDemo } from "./auto-demo";
import type { MediaInfo } from "./blocks";

/** One product screenshot with its tab and words. */
export interface ShowcaseView {
  label: string;
  title: string;
  body?: string | null;
  image_id: string;
  /** Added by the API from the media library; `null` when unavailable (previews). */
  media?: MediaInfo | null;
}

/** Product screenshots in a browser-style frame (owner's brief, 18 Nov 2026). */
export interface Showcase {
  title?: string | null;
  caption?: string | null;
  views: ShowcaseView[];
  rotate?: boolean;
  interval?: number;
  indicators?: { title: string; body?: string | null }[];
  preview?: boolean;
}

const MEDIA = "/media/";

/** `src`, `srcSet` and `sizes` for a screenshot shown about half the page wide. */
function sources(media: MediaInfo, base: string) {
  const url = (w?: number) => `${base}${media.id}${w ? `?w=${w}` : ""}`;
  return {
    src: url(media.widths.find((w) => w >= 960) ?? media.widths.at(-1)),
    srcSet: [...media.widths.map((w) => `${url(w)} ${w}w`), `${url()} ${media.width}w`].join(", "),
    sizes: "(min-width: 1280px) 760px, (min-width: 768px) 90vw, 100vw",
  };
}

/**
 * A reusable showcase of real product screens: tabs in a browser-style
 * frame, a short crossfade between views, the view's own title and sentence,
 * optional floating notes beside the frame, optional rotation on the shared
 * demonstration clock (paused off screen, under keyboard focus or after a
 * choice; still with reduced motion), and a larger preview in an in-app
 * dialog. Screenshots keep their colours in either theme and their shape:
 * the frame takes the first view's proportions, and the larger preview shows
 * each whole. Any product website can use it with its own images and words.
 */
export function ProductShowcase({
  showcase,
  locale = "en",
  mediaBase = MEDIA,
  eager = false,
}: {
  showcase: Showcase;
  locale?: string;
  mediaBase?: string;
  /** Loads the first screenshot first (the hero above the fold). */
  eager?: boolean;
}) {
  const uid = useId();
  const words = (interfaceCopy[locale as Locale] ?? interfaceCopy.en).showcase;
  const views = showcase.views;
  const rotate = Boolean(showcase.rotate) && views.length > 1;
  const seconds = Math.min(20, Math.max(5, showcase.interval ?? 8));
  const demo = useAutoDemo<HTMLDivElement>({
    // Without rotation nothing advances by itself; tabs still choose.
    durations: views.map(() => (rotate ? seconds * 1000 : 1e9)),
    passes: 2,
  });
  const active = Math.min(demo.index, views.length - 1);
  const view = views[active];
  const first = views.find((v) => v.media)?.media;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const [actualSize, setActualSize] = useState(false);

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKey = (event: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, Home: -active, End: views.length - 1 - active }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const rtl = document.documentElement.dir === "rtl" && event.key.startsWith("Arrow");
    const next = (active + (rtl ? -step : step) + views.length) % views.length;
    demo.choose(next);
    tabs.current[next]?.focus();
  };

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const reset = () => setActualSize(false);
    d.addEventListener("close", reset);
    return () => d.removeEventListener("close", reset);
  }, []);

  if (!view) return null;

  const tabList = (place: "frame" | "preview") => (
    <div
      role="tablist"
      aria-label={words.views}
      onKeyDown={onKey}
      className="flex min-w-0 [scrollbar-width:none] gap-1 overflow-x-auto"
    >
      {views.map((v, i) => (
        <button
          key={`${place}-${v.image_id}-${i}`}
          ref={place === "frame" ? (el) => void (tabs.current[i] = el) : undefined}
          type="button"
          role="tab"
          id={`${uid}-${place}-tab-${i}`}
          aria-selected={i === active}
          aria-controls={`${uid}-${place}-panel`}
          tabIndex={i === active ? 0 : -1}
          data-showcase-tab={i}
          onClick={() => demo.choose(i)}
          className={cn(
            "min-h-9 shrink-0 cursor-pointer rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-colors",
            i === active
              ? "bg-product text-product-ink shadow-sm"
              : "text-muted hover:bg-surface-2 hover:text-text",
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <div
      ref={demo.ref}
      data-showcase=""
      className="relative isolate"
      onMouseEnter={() => demo.hold(true)}
      onMouseLeave={() => demo.hold(false)}
    >
      {/* A soft glow in the product's colour behind the frame. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--product)_22%,transparent),transparent)] opacity-80 blur-2xl"
      />
      <div className="fb-rise overflow-hidden rounded-[1.25rem] border border-line bg-surface shadow-[var(--shadow-elevated)] [animation-duration:.8s]">
        {/* Browser-style header: window dots, the workspace name, the views. */}
        <div className="flex items-center gap-3 border-b border-line bg-surface-2/70 px-3 py-2 sm:px-4">
          <span aria-hidden className="hidden gap-1.5 sm:flex">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </span>
          {showcase.title && (
            <span className="hidden shrink-0 text-xs font-medium text-muted @md:inline">
              {showcase.title}
            </span>
          )}
          <div className="ms-auto min-w-0">{views.length > 1 && tabList("frame")}</div>
          {rotate && <DemoControl state={demo.state} onToggle={demo.toggle} className="size-8" />}
        </div>
        <div
          role={views.length > 1 ? "tabpanel" : undefined}
          id={`${uid}-frame-panel`}
          aria-labelledby={views.length > 1 ? `${uid}-frame-tab-${active}` : undefined}
          className="relative bg-[#f6f2ec]"
          // The first screenshot's shape reserves the space, so nothing shifts while it loads.
          style={{ aspectRatio: first ? `${first.width} / ${first.height}` : "16 / 10" }}
        >
          {views.map((v, i) =>
            v.media ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${v.image_id}-${i}`}
                {...sources(v.media, mediaBase)}
                alt={i === active ? v.media.alt : ""}
                aria-hidden={i === active ? undefined : true}
                width={v.media.width}
                height={v.media.height}
                loading={eager && i === 0 ? "eager" : "lazy"}
                fetchPriority={eager && i === 0 ? "high" : undefined}
                decoding="async"
                data-showcase-image={i}
                className={cn(
                  "absolute inset-0 size-full object-cover object-left-top transition-opacity duration-300 ease-out motion-reduce:transition-none",
                  i === active ? "opacity-100" : "opacity-0",
                )}
              />
            ) : (
              i === active && (
                <div
                  key={`${v.image_id}-${i}`}
                  className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted"
                >
                  Choose an image from the media library
                </div>
              )
            ),
          )}
          {/* The view's words, over the bottom of the screenshot. */}
          <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2 sm:inset-x-4 sm:bottom-4">
            <div
              key={active}
              data-showcase-label=""
              className="fb-rise max-w-sm rounded-2xl border border-line bg-bg/90 px-4 py-3 shadow-[var(--shadow-elevated)] backdrop-blur [animation-duration:.35s]"
            >
              <p className="text-sm font-semibold text-text">{view.title}</p>
              {view.body && <p className="mt-0.5 text-xs leading-snug text-muted">{view.body}</p>}
            </div>
            {showcase.preview !== false && view.media && (
              <button
                type="button"
                onClick={() => dialog.current?.showModal()}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-bg/90 px-3.5 text-xs font-medium text-text shadow-sm backdrop-blur transition-colors hover:border-product"
              >
                <Expand aria-hidden className="size-3.5" />
                {words.preview}
              </button>
            )}
          </div>
        </div>
      </div>
      {showcase.caption && <p className="mt-3 text-center text-xs text-subtle">{showcase.caption}</p>}

      {/* Floating notes beside the frame, on wide screens only; they never cover the screenshot's middle. */}
      {(showcase.indicators ?? []).slice(0, 3).map((note, i) => (
        <div
          key={note.title}
          aria-hidden
          data-showcase-note={i}
          className={cn(
            "fb-rise pointer-events-none absolute z-10 hidden max-w-[13rem] rounded-2xl border border-line bg-bg/95 px-3.5 py-2.5 shadow-[var(--shadow-elevated)] backdrop-blur @2xl:block",
            ["-start-10 top-[22%]", "-end-6 top-[48%]", "-start-6 bottom-[18%]"][i],
          )}
          style={{ animationDelay: `${0.35 + i * 0.15}s` }}
        >
          <p className="flex items-center gap-2 text-xs font-semibold text-text">
            <span className="size-1.5 rounded-full bg-product" />
            {note.title}
          </p>
          {note.body && <p className="mt-0.5 text-[0.7rem] leading-snug text-muted">{note.body}</p>}
        </div>
      ))}

      {/* The larger preview, in an in-app dialog (Escape closes it; focus returns). */}
      {showcase.preview !== false && (
        <dialog
          ref={dialog}
          aria-labelledby={`${uid}-preview-title`}
          onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
          className="fb-overlay m-auto max-h-[calc(100dvh-2rem)] w-[min(96rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-bg p-0 text-text shadow-[var(--shadow-elevated)] backdrop:bg-black/60"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            <h2 id={`${uid}-preview-title`} className="text-sm font-semibold">
              {view.title}
            </h2>
            {views.length > 1 && tabList("preview")}
            <div className="ms-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActualSize((v) => !v)}
                aria-pressed={actualSize}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text"
              >
                {actualSize ? (
                  <Minimize2 aria-hidden className="size-4" />
                ) : (
                  <Maximize2 aria-hidden className="size-4" />
                )}
                {actualSize ? words.fit : words.actual}
              </button>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                aria-label={words.close}
                className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
          </div>
          <div
            role={views.length > 1 ? "tabpanel" : undefined}
            id={`${uid}-preview-panel`}
            className="max-h-[calc(100dvh-7rem)] overflow-auto bg-[#f6f2ec]"
          >
            {view.media && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${mediaBase}${view.media.id}`}
                alt={view.media.alt}
                width={view.media.width}
                height={view.media.height}
                loading="lazy"
                decoding="async"
                className={cn("block h-auto", actualSize ? "max-w-none" : "mx-auto w-full")}
              />
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}
