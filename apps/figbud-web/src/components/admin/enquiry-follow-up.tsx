"use client";

import { cn } from "@figbud/ui";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { adminFetch, describePasskeyError } from "@/lib/admin-client";

import { ActionButton } from "./action-button";
import { LocalTime } from "./local-time";

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export const BOOKING_STATUSES: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const BOOKING_STYLES: Record<BookingStatus, string> = {
  pending: "border-warning/40 bg-warning/10 text-warning",
  confirmed: "border-accent/40 bg-accent-soft text-accent-strong",
  completed: "border-success/30 bg-success/10 text-success",
  cancelled: "border-line bg-surface-2 text-subtle",
  no_show: "border-danger/30 bg-danger/10 text-danger",
};

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        BOOKING_STYLES[status],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {BOOKING_STATUSES[status] ?? status}
    </span>
  );
}

/** The moves the API allows from each status (`bookings::can_move`). */
export const NEXT_MOVES: Record<BookingStatus, { to: BookingStatus; label: string }[]> = {
  pending: [
    { to: "confirmed", label: "Confirm" },
    { to: "cancelled", label: "Cancel" },
  ],
  confirmed: [
    { to: "completed", label: "Mark completed" },
    { to: "no_show", label: "Mark no-show" },
    { to: "cancelled", label: "Cancel" },
  ],
  completed: [],
  cancelled: [],
  no_show: [],
};

type Message = { tone: "ok" | "error"; text: string } | null;

function Note({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      role={message.tone === "error" ? "alert" : "status"}
      className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}
    >
      {message.text}
    </p>
  );
}

/** Who follows the enquiry up. */
export function AssigneeForm({
  id,
  assigned,
  people,
}: {
  id: string;
  assigned: string | null;
  people: { id: string; name: string }[];
}) {
  const router = useRouter();
  const uid = useId();
  const [value, setValue] = useState(assigned ?? "");
  const [saved, setSaved] = useState(assigned ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
          await adminFetch(`enquiries/${id}/assignee`, { user_id: value || null });
          setSaved(value);
          setMessage({ tone: "ok", text: value ? "Assigned." : "Unassigned." });
          router.refresh();
        } catch (err) {
          setMessage({ tone: "error", text: describePasskeyError(err) });
        } finally {
          setBusy(false);
        }
      }}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label htmlFor={`${uid}-assignee`} className="block text-sm font-medium text-text">
          Assigned to
        </label>
        <select
          id={`${uid}-assignee`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-text"
        >
          <option value="">Nobody yet</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <ActionButton type="submit" ready={value !== saved} busy={busy} hint="Nothing to save">
        Save
      </ActionButton>
      <Note message={message} />
    </form>
  );
}

/** A follow-up note, kept in the enquiry's history. */
export function NoteForm({ id }: { id: string }) {
  const router = useRouter();
  const uid = useId();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
          await adminFetch(`enquiries/${id}/notes`, { note });
          setNote("");
          setMessage({ tone: "ok", text: "Note added to the history." });
          router.refresh();
        } catch (err) {
          setMessage({ tone: "error", text: describePasskeyError(err) });
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-3"
    >
      <label htmlFor={`${uid}-note`} className="block text-sm font-medium text-text">
        Add a note
      </label>
      <textarea
        id={`${uid}-note`}
        rows={3}
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Called; sending the onboarding pack…"
        className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-text"
      />
      <ActionButton type="submit" ready={note.trim().length > 0} busy={busy} hint="Write a note first">
        Add note
      </ActionButton>
      <Note message={message} />
    </form>
  );
}

export interface BookingInfo {
  id: string;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  status: BookingStatus;
}

/** Free slots from the website's availability, for moving a booking. */
function ReschedulePicker({ product, onPick }: { product: string; onPick: (iso: string) => void }) {
  const uid = useId();
  const [days, setDays] = useState<{ date: string; slots: string[] }[] | null>(null);
  const [zone, setZone] = useState("Africa/Nairobi");
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    adminFetch<{ preview: { date: string; slots: string[] }[]; availability: { time_zone: string } }>(
      `enquiries/availability/${product}`,
    )
      .then((data) => {
        setDays(data.preview);
        setZone(data.availability.time_zone);
      })
      .catch((err) => setError(describePasskeyError(err)));
  }, [product]);
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!days) return <p className="text-sm text-subtle">Loading free times…</p>;
  if (!days.length)
    return <p className="text-sm text-subtle">No free times: check Demo availability for this website.</p>;
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor={`${uid}-slot`} className="block text-sm font-medium text-text">
          New time ({zone})
        </label>
        <select
          id={`${uid}-slot`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-text"
        >
          <option value="">Choose a free time</option>
          {days.flatMap((d) =>
            d.slots.map((s) => (
              <option key={s} value={s}>
                {time(s)}
              </option>
            )),
          )}
        </select>
      </div>
      <ActionButton
        type="button"
        ready={Boolean(value)}
        busy={false}
        hint="Choose a time"
        onClick={() => onPick(value)}
      >
        Move booking
      </ActionButton>
    </div>
  );
}

/** A booking's time and its next steps: confirm, reschedule, cancel, outcome. */
export function BookingActions({
  booking,
  product,
  canEdit,
  compact = false,
}: {
  booking: BookingInfo;
  product: string;
  canEdit: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const run = async (label: string, path: string, body: unknown, done: string) => {
    setBusy(label);
    setMessage(null);
    try {
      await adminFetch(path, body);
      setMessage({ tone: "ok", text: done });
      setMoving(false);
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: describePasskeyError(err) });
    } finally {
      setBusy(null);
    }
  };
  const moves = NEXT_MOVES[booking.status] ?? [];
  const upcoming = booking.status === "pending" || booking.status === "confirmed";
  return (
    <div className={cn("space-y-3", compact && "text-sm")} data-booking={booking.id}>
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-text">
            <LocalTime iso={booking.starts_at} />
          </p>
          <BookingStatusPill status={booking.status} />
        </div>
      )}
      {!compact && <p className="text-xs text-subtle">Offered in {booking.time_zone}.</p>}
      {canEdit && (moves.length > 0 || upcoming) && (
        <div className="flex flex-wrap gap-2">
          {moves.map((m) => (
            <button
              key={m.to}
              type="button"
              disabled={busy !== null}
              onClick={() =>
                run(
                  m.to,
                  `enquiries/bookings/${booking.id}/status`,
                  { status: m.to },
                  `Booking ${BOOKING_STATUSES[m.to].toLowerCase()}.`,
                )
              }
              className={cn(
                "inline-flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium transition-colors disabled:opacity-60",
                m.to === "confirmed" || m.to === "completed"
                  ? "border-accent bg-accent text-accent-ink hover:brightness-110"
                  : m.to === "cancelled" || m.to === "no_show"
                    ? "border-line text-danger hover:border-danger/40"
                    : "border-line text-text hover:border-line-strong",
              )}
            >
              {busy === m.to ? "Saving…" : m.label}
            </button>
          ))}
          {upcoming && (
            <button
              type="button"
              aria-expanded={moving}
              onClick={() => setMoving((v) => !v)}
              className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line px-3.5 text-sm font-medium text-text hover:border-line-strong"
            >
              Reschedule
            </button>
          )}
        </div>
      )}
      {moving && (
        <ReschedulePicker
          product={product}
          onPick={(iso) =>
            run("move", `enquiries/bookings/${booking.id}/reschedule`, { starts_at: iso }, "Booking moved.")
          }
        />
      )}
      <Note message={message} />
    </div>
  );
}
