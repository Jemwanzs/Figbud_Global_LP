"use client";

const format = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

/**
 * A moment in the admin's own time zone ("Mon, 3 Nov 2026, 09:00 EAT"). The
 * server may render it in another zone, so the browser's text wins quietly.
 */
export function LocalTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {format.format(new Date(iso))}
    </time>
  );
}

/** A `datetime-local` value (the admin's time zone) as an ISO instant, or null. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** `datetime-local` value for a moment `minutes` from now, rounded up to the next 5 minutes. */
export function localInputFromNow(minutes: number): string {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
