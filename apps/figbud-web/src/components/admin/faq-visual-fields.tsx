"use client";

import type { FaqScene, FaqShowcaseConfig } from "@figbud/site-kit";
import { useId } from "react";

import { MediaPicker } from "./media-picker";
import type { MediaItem } from "./page-types";

const input =
  "mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm font-normal text-text disabled:opacity-60";

export const FAQ_SCENES: Record<FaqScene, string> = {
  employee_access: "Employee self-service (desktop and phone browser)",
  branches: "Branches into one HR workspace",
  payroll: "Kenyan payroll: gross to net (illustrative)",
  workflows: "Approval workflow (request to completion)",
};

export interface FaqVisualItem {
  id?: string;
  question: string;
  answer: string;
  scene?: FaqScene | null;
  labels?: string[];
  image_id?: string | null;
}

/** A stable id for a question, so its visual never depends on its wording. */
export const newQuestionId = () => `q-${crypto.randomUUID().slice(0, 8)}`;

/** Every question gets an id once the visual is on (older questions had none). */
export function withIds<T extends { id?: string }>(items: T[]): T[] {
  return items.map((item) => (item.id ? item : { ...item, id: newQuestionId() }));
}

/**
 * An FAQ's product visual (owner's briefs, 19 Nov 2026, P14-W5): on or off,
 * pace, autoplay while no question is open, and the workflow scene's button.
 */
export function FaqShowcaseFields({
  value,
  disabled,
  onChange,
}: {
  value: FaqShowcaseConfig | null | undefined;
  disabled: boolean;
  onChange: (value: FaqShowcaseConfig | null) => void;
}) {
  const uid = useId();
  const on = Boolean(value?.enabled !== false && value);
  const set = (patch: Partial<FaqShowcaseConfig>) => onChange({ enabled: true, ...value, ...patch });
  return (
    <fieldset className="rounded-xl border border-line p-3" data-faq-visual-settings="">
      <legend className="px-1 text-xs font-medium text-muted">Product visual</legend>
      <label className="flex min-h-11 items-center gap-3 text-sm text-text">
        <input
          type="checkbox"
          checked={on}
          disabled={disabled}
          onChange={(e) =>
            onChange(e.target.checked ? { enabled: true, speed: "normal", autoplay: false } : null)
          }
          className="size-5 accent-[var(--color-accent)]"
        />
        Show a product visual beside the questions
      </label>
      {on && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label htmlFor={`${uid}-speed`} className="block text-sm font-medium text-text">
            Animation pace
            <select
              id={`${uid}-speed`}
              value={value?.speed ?? "normal"}
              disabled={disabled}
              onChange={(e) => set({ speed: e.target.value as FaqShowcaseConfig["speed"] })}
              className={input}
            >
              <option value="calm">Calm</option>
              <option value="normal">Normal</option>
              <option value="lively">Lively</option>
            </select>
          </label>
          <label className="flex min-h-11 items-end gap-3 pb-2 text-sm text-text">
            <input
              type="checkbox"
              checked={Boolean(value?.autoplay)}
              disabled={disabled}
              onChange={(e) => set({ autoplay: e.target.checked })}
              className="size-5 accent-[var(--color-accent)]"
            />
            Show the scenes in turn while no question is open
          </label>
          <label className="block text-sm font-medium text-text">
            Workflow scene button (optional)
            <input
              value={value?.cta?.label ?? ""}
              maxLength={40}
              disabled={disabled}
              placeholder="Book a personalised demo"
              onChange={(e) =>
                set({
                  cta: e.target.value
                    ? { label: e.target.value, href: value?.cta?.href ?? "#book-demo" }
                    : null,
                })
              }
              className={input}
            />
          </label>
          {value?.cta && (
            <label htmlFor={`${uid}-cta`} className="block text-sm font-medium text-text">
              It opens
              <select
                id={`${uid}-cta`}
                value={value.cta.href}
                disabled={disabled}
                onChange={(e) => set({ cta: { label: value.cta!.label, href: e.target.value } })}
                className={input}
              >
                <option value="#book-demo">Demo booking</option>
                <option value="#start-now">Start Now</option>
                <option value="/contact">The contact page</option>
              </select>
            </label>
          )}
          <p className="text-xs text-subtle sm:col-span-2">
            Each question chooses its scene below. Scenes are illustrations with sample data, marked
            &quot;Illustrative&quot;; a question can show an approved screenshot instead. Motion stays still
            for visitors who prefer less of it.
          </p>
        </div>
      )}
    </fieldset>
  );
}

/** One question's scene, labels and screenshot. */
export function FaqItemVisualFields({
  item,
  library,
  disabled,
  onChange,
}: {
  item: FaqVisualItem;
  library: MediaItem[];
  disabled: boolean;
  onChange: (item: FaqVisualItem) => void;
}) {
  const uid = useId();
  const labels = item.labels ?? [];
  return (
    <div className="grid gap-3 rounded-xl bg-surface-2/60 p-3" data-faq-item-visual={item.id ?? ""}>
      <label htmlFor={`${uid}-scene`} className="block text-sm font-medium text-text">
        Visual for this question
        <select
          id={`${uid}-scene`}
          value={item.scene ?? ""}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...item,
              scene: (e.target.value || null) as FaqScene | null,
              ...(e.target.value ? {} : { image_id: null, labels: [] }),
            })
          }
          className={input}
        >
          <option value="">The connected workspace (default)</option>
          {Object.entries(FAQ_SCENES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {item.scene && (
        <>
          <label className="block text-sm font-medium text-text">
            Floating labels (up to four, comma-separated; empty for the scene&apos;s own)
            <input
              value={labels.join(", ")}
              disabled={disabled}
              placeholder="Payslips, Leave Requests, Employee Profile, Browser Access"
              onChange={(e) =>
                onChange({
                  ...item,
                  labels: e.target.value
                    .split(",")
                    .map((l) => l.trim().slice(0, 32))
                    .filter(Boolean)
                    .slice(0, 4),
                })
              }
              className={input}
            />
          </label>
          <MediaPicker
            label="Screenshot instead of the illustration (optional)"
            hint="An approved screenshot from this website's media library, never real customer data."
            value={item.image_id ?? null}
            media={library}
            disabled={disabled}
            onChange={(id) => onChange({ ...item, image_id: id ?? null })}
          />
        </>
      )}
    </div>
  );
}
