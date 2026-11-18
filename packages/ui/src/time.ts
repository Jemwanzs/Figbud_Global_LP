/*
 * Showing moments in time (owner's brief, 14 Nov 2026). Timestamps are
 * stored and sent in UTC; they are shown in a display time zone, East Africa
 * Time (`Africa/Nairobi`) unless the Studio's organisation or a person chose
 * another, with the zone named beside them ("14 Nov 2026, 18:56 EAT"). The
 * same zone is given on the server and in the browser, so both render the
 * same text. Calendar dates such as a quotation's validity are not moments
 * and are never converted.
 */

export const DEFAULT_TIME_ZONE = "Africa/Nairobi";

/** The zones the Studio offers; must match `TIME_ZONES` in services/api/src/admin/time_zone.rs. */
export const TIME_ZONES = [
  { zone: "Africa/Nairobi", label: "East Africa Time (Nairobi)" },
  { zone: "Africa/Kampala", label: "East Africa Time (Kampala)" },
  { zone: "Africa/Dar_es_Salaam", label: "East Africa Time (Dar es Salaam)" },
  { zone: "Africa/Kigali", label: "Central Africa Time (Kigali)" },
  { zone: "Africa/Addis_Ababa", label: "East Africa Time (Addis Ababa)" },
  { zone: "Africa/Lagos", label: "West Africa Time (Lagos)" },
  { zone: "Africa/Accra", label: "Greenwich Mean Time (Accra)" },
  { zone: "Africa/Johannesburg", label: "South Africa Time (Johannesburg)" },
  { zone: "Africa/Cairo", label: "Eastern European Time (Cairo)" },
  { zone: "Africa/Casablanca", label: "Morocco (Casablanca)" },
  { zone: "UTC", label: "Coordinated Universal Time (UTC)" },
  { zone: "Europe/London", label: "United Kingdom (London)" },
  { zone: "Europe/Paris", label: "Central European Time (Paris)" },
  { zone: "Europe/Berlin", label: "Central European Time (Berlin)" },
  { zone: "Asia/Dubai", label: "Gulf Time (Dubai)" },
  { zone: "Asia/Riyadh", label: "Arabia Time (Riyadh)" },
  { zone: "Asia/Kolkata", label: "India Time (Kolkata)" },
  { zone: "Asia/Singapore", label: "Singapore Time" },
  { zone: "Asia/Shanghai", label: "China Time (Shanghai)" },
  { zone: "America/New_York", label: "Eastern Time (New York)" },
  { zone: "America/Chicago", label: "Central Time (Chicago)" },
  { zone: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
] as const;

const known = (zone: string | null | undefined) =>
  zone && TIME_ZONES.some((z) => z.zone === zone) ? zone : DEFAULT_TIME_ZONE;

const formats = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string, dateOnly: boolean, withZone: boolean) {
  const key = `${zone}|${dateOnly}|${withZone}`;
  let f = formats.get(key);
  if (!f) {
    // en-KE: "14 Nov 2026, 18:56", and "EAT" by name for Nairobi.
    f = new Intl.DateTimeFormat("en-KE", {
      timeZone: zone,
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }),
      ...(withZone && !dateOnly ? { timeZoneName: "short" as const } : {}),
    });
    formats.set(key, f);
  }
  return f;
}

/**
 * A moment as "14 Nov 2026, 18:56 EAT" in `timeZone`, or its calendar date
 * there ("15 Nov 2026" when 22:30 UTC is after midnight in Nairobi).
 */
export function formatMoment(
  iso: string | Date,
  options: { timeZone?: string | null; dateOnly?: boolean; withZone?: boolean } = {},
): string {
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatter(known(options.timeZone), options.dateOnly ?? false, options.withZone ?? true).format(date);
}

/** The short name of a zone at a moment ("EAT", "GMT", "GMT+1"). */
export function zoneName(timeZone?: string | null, at: Date = new Date()): string {
  const part = formatter(known(timeZone), false, true)
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

/** The wall-clock parts of a moment in a zone. */
function partsIn(zone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** How far ahead of UTC a zone is at a moment, in minutes. */
function offsetMinutes(zone: string, date: Date): number {
  const p = partsIn(zone, date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** A `datetime-local` value ("2026-11-14T18:56"), read in `timeZone`, as a UTC ISO instant; null if empty or invalid. */
export function zonedInputToIso(value: string, timeZone?: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const zone = known(timeZone);
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  // The zone's offset at that wall time (checked again, for daylight-saving changes).
  let instant = wall - offsetMinutes(zone, new Date(wall)) * 60_000;
  instant = wall - offsetMinutes(zone, new Date(instant)) * 60_000;
  return new Date(instant).toISOString();
}

/** A moment as a `datetime-local` value in `timeZone`. */
export function isoToZonedInput(iso: string | Date, timeZone?: string | null): string {
  const date = iso instanceof Date ? iso : new Date(iso);
  const p = partsIn(known(timeZone), date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
