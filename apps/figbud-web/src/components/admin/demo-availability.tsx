"use client";

import { TIME_ZONES, cn } from "@figbud/ui";
import { Plus, X } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";

import { ActionButton } from "./action-button";

export interface Window {
  day: number;
  start: string;
  end: string;
}

export interface Availability {
  enabled: boolean;
  time_zone: string;
  slot_minutes: number;
  buffer_minutes: number;
  notice_hours: number;
  days_ahead: number;
  daily_limit: number | null;
  hours: Window[];
  closed_dates: string[];
  note: string | null;
}

export interface AvailabilityData {
  availability: Availability;
  version: number;
  can_edit: boolean;
  time_zones: string[];
  slot_lengths: number[];
  preview: { date: string; slots: string[] }[];
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-text";

const zoneLabel = (zone: string) => TIME_ZONES.find((z) => z.zone === zone)?.label ?? zone;

/**
 * Studio → Leads & Enquiries → Demo availability (P8-M8): a website's
 * weekly hours in its own zone, demo length, buffer, notice, how far ahead,
 * daily limit and closed dates. Checked by the API; reviewers and owners save.
 */
export function DemoAvailabilityEditor({
  slug,
  name,
  data,
}: {
  slug: string;
  name: string;
  data: AvailabilityData;
}) {
  const uid = useId();
  const [saved, setSaved] = useState(data);
  const [form, setForm] = useState<Availability>(data.availability);
  const [closedDate, setClosedDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const disabled = !saved.can_edit;
  const dirty = JSON.stringify(form) !== JSON.stringify(saved.availability);
  const set = <K extends keyof Availability>(key: K, value: Availability[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const windows = (day: number) => form.hours.map((w, i) => ({ ...w, i })).filter((w) => w.day === day);
  const setWindow = (i: number, patch: Partial<Window>) =>
    set(
      "hours",
      form.hours.map((w, j) => (j === i ? { ...w, ...patch } : w)),
    );

  const save = async () => {
    setBusy(true);
    setMessage(null);
    setFieldErrors({});
    try {
      const next = await adminFetch<AvailabilityData>(`enquiries/availability/${slug}`, {
        availability: { ...form, note: form.note?.trim() || null },
        version: saved.version,
      });
      setSaved(next);
      setForm(next.availability);
      setMessage({
        tone: "ok",
        text: next.availability.enabled
          ? `Saved. ${name} takes bookings; its websites update within a few minutes.`
          : `Saved. Booking is off for ${name}.`,
      });
    } catch (err) {
      if (err instanceof AdminError) {
        setFieldErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])));
        setMessage({ tone: "error", text: err.message });
      } else {
        setMessage({ tone: "error", text: "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  };

  const preview = useMemo(
    () =>
      saved.preview.slice(0, 7).map((d) => ({
        date: new Intl.DateTimeFormat("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${d.date}T12:00:00Z`)),
        count: d.slots.length,
        first: new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: saved.availability.time_zone,
        }).format(new Date(d.slots[0])),
      })),
    [saved],
  );
  const error = (field: string) =>
    fieldErrors[field] ? <p className="mt-1.5 text-sm text-danger">{fieldErrors[field]}</p> : null;

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]" data-availability={slug}>
      <div className="space-y-6">
        {disabled && (
          <p className="rounded-xl border border-line bg-surface-2 p-4 text-sm text-muted">
            Reviewers and owners change availability. You can see what visitors are offered.
          </p>
        )}
        <section className="fb-panel flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-panel)] p-6">
          <div className="max-w-xl">
            <p id={`${uid}-on`} className="font-medium text-text">
              {form.enabled ? `${name} takes demo bookings` : `Booking is off for ${name}`}
            </p>
            <p className="mt-1 text-sm text-muted">
              While off, &quot;Book a demo&quot; buttons open the demo request form instead, and the team
              arranges a time. Calendar sync and meeting links need an integration, which isn&apos;t set up.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.enabled}
            aria-labelledby={`${uid}-on`}
            disabled={disabled}
            onClick={() => set("enabled", !form.enabled)}
            className={cn(
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
              form.enabled ? "border-accent bg-accent" : "border-line-strong bg-surface-3",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none",
                form.enabled ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1",
              )}
            />
          </button>
        </section>

        <section className="fb-panel grid gap-4 rounded-[var(--radius-panel)] p-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <label htmlFor={`${uid}-zone`} className="block text-sm font-medium text-text">
              Time zone
            </label>
            <select
              id={`${uid}-zone`}
              value={form.time_zone}
              disabled={disabled}
              onChange={(e) => set("time_zone", e.target.value)}
              className={inputClass}
            >
              {saved.time_zones.map((z) => (
                <option key={z} value={z}>
                  {zoneLabel(z)}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-subtle">
              The hours below are in this zone; visitors also see their own time.
            </p>
            {error("time_zone")}
          </div>
          <div>
            <label htmlFor={`${uid}-length`} className="block text-sm font-medium text-text">
              Demo length
            </label>
            <select
              id={`${uid}-length`}
              value={form.slot_minutes}
              disabled={disabled}
              onChange={(e) => set("slot_minutes", Number(e.target.value))}
              className={inputClass}
            >
              {saved.slot_lengths.map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </div>
          <NumberField
            id={`${uid}-buffer`}
            label="Buffer between demos (minutes)"
            value={form.buffer_minutes}
            min={0}
            max={60}
            disabled={disabled}
            onChange={(v) => set("buffer_minutes", v)}
            error={error("buffer_minutes")}
          />
          <NumberField
            id={`${uid}-notice`}
            label="Minimum notice (hours)"
            value={form.notice_hours}
            min={0}
            max={168}
            disabled={disabled}
            onChange={(v) => set("notice_hours", v)}
            error={error("notice_hours")}
          />
          <NumberField
            id={`${uid}-ahead`}
            label="Offer up to (days ahead)"
            value={form.days_ahead}
            min={1}
            max={60}
            disabled={disabled}
            onChange={(v) => set("days_ahead", v)}
            error={error("days_ahead")}
          />
          <div>
            <label htmlFor={`${uid}-limit`} className="block text-sm font-medium text-text">
              Most demos a day <span className="font-normal text-subtle">(optional)</span>
            </label>
            <input
              id={`${uid}-limit`}
              type="number"
              min={1}
              max={40}
              value={form.daily_limit ?? ""}
              disabled={disabled}
              onChange={(e) => set("daily_limit", e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
            />
            {error("daily_limit")}
          </div>
        </section>

        <section aria-labelledby={`${uid}-hours`} className="fb-panel rounded-[var(--radius-panel)] p-6">
          <h2 id={`${uid}-hours`} className="font-semibold text-text">
            Weekly hours
          </h2>
          <p className="mt-1 text-sm text-muted">
            Demos start on the hour grid of each window: length plus buffer.
          </p>
          {error("hours")}
          <ul className="mt-4 divide-y divide-line">
            {DAYS.map((label, d) => {
              const day = d + 1;
              const own = windows(day);
              return (
                <li
                  key={label}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start"
                  data-weekday={day}
                >
                  <p className="w-28 shrink-0 pt-2.5 text-sm font-medium text-text">{label}</p>
                  <div className="flex-1 space-y-2">
                    {own.length === 0 && <p className="pt-2.5 text-sm text-subtle">Closed</p>}
                    {own.map((w) => (
                      <div key={w.i} className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          aria-label={`${label}: from`}
                          value={w.start}
                          disabled={disabled}
                          onChange={(e) => setWindow(w.i, { start: e.target.value })}
                          className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-text tabular-nums"
                        />
                        <span className="text-subtle">to</span>
                        <input
                          type="time"
                          aria-label={`${label}: until`}
                          value={w.end === "24:00" ? "23:59" : w.end}
                          disabled={disabled}
                          onChange={(e) => setWindow(w.i, { end: e.target.value })}
                          className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-text tabular-nums"
                        />
                        {!disabled && (
                          <button
                            type="button"
                            onClick={() =>
                              set(
                                "hours",
                                form.hours.filter((_, j) => j !== w.i),
                              )
                            }
                            aria-label={`Remove ${label} ${w.start}–${w.end}`}
                            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-subtle hover:bg-surface-2 hover:text-text"
                          >
                            <X aria-hidden className="size-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() =>
                        set("hours", [
                          ...form.hours,
                          own.length
                            ? { day, start: "14:00", end: "17:00" }
                            : { day, start: "09:00", end: "12:00" },
                        ])
                      }
                      className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 self-start rounded-full border border-line px-3 text-sm text-muted hover:border-line-strong hover:text-text"
                    >
                      <Plus aria-hidden className="size-4" />
                      Add hours
                      <span className="sr-only"> on {label}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby={`${uid}-closed`} className="fb-panel rounded-[var(--radius-panel)] p-6">
          <h2 id={`${uid}-closed`} className="font-semibold text-text">
            Closed dates
          </h2>
          <p className="mt-1 text-sm text-muted">
            Public holidays, team days off. No demos are offered on these dates.
          </p>
          {!disabled && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <input
                type="date"
                aria-label="Closed date"
                value={closedDate}
                onChange={(e) => setClosedDate(e.target.value)}
                className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-text"
              />
              <button
                type="button"
                disabled={!closedDate || form.closed_dates.includes(closedDate)}
                onClick={() => {
                  set("closed_dates", [...form.closed_dates, closedDate].sort());
                  setClosedDate("");
                }}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line px-4 text-sm text-text hover:border-line-strong disabled:opacity-50"
              >
                <Plus aria-hidden className="size-4" />
                Add date
              </button>
            </div>
          )}
          {form.closed_dates.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {form.closed_dates.map((d) => (
                <li
                  key={d}
                  className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-sm"
                >
                  <span className="tabular-nums">{d}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "closed_dates",
                          form.closed_dates.filter((x) => x !== d),
                        )
                      }
                      aria-label={`Remove ${d}`}
                      className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-subtle hover:text-text"
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {error("closed_dates")}
        </section>

        <section className="fb-panel rounded-[var(--radius-panel)] p-6">
          <label htmlFor={`${uid}-note`} className="block font-semibold text-text">
            Note beside the times <span className="font-normal text-subtle">(optional)</span>
          </label>
          <textarea
            id={`${uid}-note`}
            rows={2}
            maxLength={200}
            value={form.note ?? ""}
            disabled={disabled}
            placeholder="Demos are online; we'll send the meeting details when we confirm."
            onChange={(e) => set("note", e.target.value)}
            className={cn(inputClass, "py-2.5")}
          />
          {error("note")}
        </section>

        {!disabled && (
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton ready={dirty} busy={busy} hint="Nothing to save" onClick={save}>
              Save availability
            </ActionButton>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setForm(saved.availability);
                  setFieldErrors({});
                  setMessage(null);
                }}
                className="text-sm text-muted hover:text-text"
              >
                Discard changes
              </button>
            )}
          </div>
        )}
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}
          >
            {message.text}
          </p>
        )}
      </div>

      <aside aria-labelledby={`${uid}-preview`} className="fb-panel h-fit rounded-[var(--radius-panel)] p-6">
        <h2 id={`${uid}-preview`} className="font-semibold text-text">
          What visitors see now
        </h2>
        {!saved.availability.enabled ? (
          <p className="mt-2 text-sm text-muted">Booking is off: the demo request form instead.</p>
        ) : preview.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No free times in the coming days.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm" data-preview="">
            {preview.map((d) => (
              <li key={d.date} className="flex justify-between gap-3">
                <span className="text-text">{d.date}</span>
                <span className="text-subtle tabular-nums">
                  {d.count} {d.count === 1 ? "time" : "times"} from {d.first}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-subtle">The saved settings, without times already booked.</p>
      </aside>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  disabled,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
  error: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputClass}
      />
      {error}
    </div>
  );
}
