"use client";

import type { Showcase } from "@figbud/site-kit";
import { buttonClasses, cn } from "@figbud/ui";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId } from "react";

import { MediaPicker } from "./media-picker";
import type { MediaItem } from "./page-types";

const input =
  "mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm font-normal text-text disabled:opacity-60";

/** A new showcase: one view with the library's first image, rotation off, the larger preview on. */
export function newShowcase(library: MediaItem[]): Showcase {
  return {
    title: "",
    caption: "Illustrative product preview",
    views: [{ label: "Overview", title: "", body: "", image_id: library[0]?.id ?? "" }],
    rotate: false,
    interval: 8,
    indicators: [],
    preview: true,
  };
}

/**
 * The hero's product screenshots (owner's brief, 18 Nov 2026): up to four
 * views (tab name, title, sentence, image from the media library), in
 * order; the frame's title and the note under it; rotation and its pace;
 * up to three floating notes; and the larger preview. Words are translated
 * with the page; the images' alt text comes from the library.
 */
export function ShowcaseFields({
  value,
  library,
  disabled,
  onChange,
}: {
  value: Showcase;
  library: MediaItem[];
  disabled: boolean;
  onChange: (showcase: Showcase) => void;
}) {
  const uid = useId();
  const set = (patch: Partial<Showcase>) => onChange({ ...value, ...patch });
  const views = value.views;
  const notes = value.indicators ?? [];
  const setView = (i: number, patch: Partial<Showcase["views"][number]>) =>
    set({ views: views.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const move = (i: number, by: -1 | 1) => {
    const next = [...views];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    set({ views: next });
  };
  const text = (label: string, val: string | null | undefined, max: number, on: (v: string) => void) => (
    <label className="block text-sm font-medium text-text">
      {label}
      <input
        value={val ?? ""}
        maxLength={max}
        disabled={disabled}
        onChange={(e) => on(e.target.value)}
        className={input}
      />
    </label>
  );

  return (
    <fieldset data-showcase-fields="" className="grid gap-4 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-medium text-text">Product screenshots</legend>
      <p className="text-xs text-subtle">
        Shown beside the words in a browser-style frame, one tab per view. Use screenshots without real names
        or figures; mark them as illustrative in the note under the frame.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {text("Frame title (optional)", value.title, 40, (v) => set({ title: v }))}
        {text("Note under the frame (optional)", value.caption, 80, (v) => set({ caption: v }))}
      </div>

      <ol className="grid gap-3">
        {views.map((view, i) => (
          <li
            key={i}
            data-showcase-view={i}
            className="grid gap-3 rounded-xl border border-line bg-surface-2/40 p-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text">{`View ${i + 1}`}</span>
              <span className="ms-auto flex gap-1">
                <button
                  type="button"
                  aria-label={`Move view ${i + 1} earlier`}
                  disabled={disabled || i === 0}
                  onClick={() => move(i, -1)}
                  className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:text-text disabled:opacity-40"
                >
                  <ArrowUp aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move view ${i + 1} later`}
                  disabled={disabled || i === views.length - 1}
                  onClick={() => move(i, 1)}
                  className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:text-text disabled:opacity-40"
                >
                  <ArrowDown aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove view ${i + 1}`}
                  disabled={disabled || views.length === 1}
                  onClick={() => set({ views: views.filter((_, j) => j !== i) })}
                  className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:text-danger disabled:opacity-40"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {text("Tab name", view.label, 24, (v) => setView(i, { label: v }))}
              {text("Title", view.title, 60, (v) => setView(i, { title: v }))}
            </div>
            {text("Sentence (optional)", view.body, 160, (v) => setView(i, { body: v }))}
            <MediaPicker
              label="Screenshot"
              hint="From this website's media library; its alt text describes the screen."
              value={view.image_id || null}
              media={library}
              disabled={disabled}
              onChange={(id) => id && setView(i, { image_id: id })}
            />
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={disabled || views.length >= 4 || !library.length}
        onClick={() =>
          set({ views: [...views, { label: "", title: "", body: "", image_id: library[0]?.id ?? "" }] })
        }
        className={cn(buttonClasses("secondary", "md"), "w-fit")}
      >
        <Plus aria-hidden className="size-4" />
        Add a view
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={Boolean(value.rotate)}
            disabled={disabled || views.length < 2}
            onChange={(e) => set({ rotate: e.target.checked })}
            className="size-4 accent-[var(--accent)]"
          />
          Move to the next view by itself
        </label>
        <label htmlFor={`${uid}-interval`} className="flex items-center gap-2 text-sm text-text">
          Each view for
          <select
            id={`${uid}-interval`}
            value={value.interval ?? 8}
            disabled={disabled || !value.rotate}
            onChange={(e) => set({ interval: Number(e.target.value) })}
            className="min-h-10 rounded-lg border border-line-strong bg-surface px-2 text-sm"
          >
            {[5, 6, 7, 8, 9, 10, 12, 15, 20].map((s) => (
              <option key={s} value={s}>{`${s} seconds`}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={value.preview !== false}
            disabled={disabled}
            onChange={(e) => set({ preview: e.target.checked })}
            className="size-4 accent-[var(--accent)]"
          />
          Visitors can open a larger preview
        </label>
      </div>
      <p className="-mt-1 text-xs text-subtle">
        Rotation pauses when someone chooses a view, while it&apos;s off screen or focused, and stays still
        for visitors who prefer less motion.
      </p>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium text-text">
          Floating notes (optional, up to three; wide screens)
        </legend>
        {notes.map((note, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <input
              aria-label={`Note ${i + 1} title`}
              value={note.title}
              maxLength={40}
              disabled={disabled}
              onChange={(e) =>
                set({ indicators: notes.map((n, j) => (j === i ? { ...n, title: e.target.value } : n)) })
              }
              className={cn(input, "mt-0")}
            />
            <input
              aria-label={`Note ${i + 1} text`}
              value={note.body ?? ""}
              maxLength={80}
              disabled={disabled}
              onChange={(e) =>
                set({ indicators: notes.map((n, j) => (j === i ? { ...n, body: e.target.value } : n)) })
              }
              className={cn(input, "mt-0")}
            />
            <button
              type="button"
              aria-label={`Remove note ${i + 1}`}
              disabled={disabled}
              onClick={() => set({ indicators: notes.filter((_, j) => j !== i) })}
              className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-danger"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={disabled || notes.length >= 3}
          onClick={() => set({ indicators: [...notes, { title: "", body: "" }] })}
          className="w-fit text-sm font-medium text-accent disabled:opacity-50"
        >
          + Add a note
        </button>
      </fieldset>
    </fieldset>
  );
}
