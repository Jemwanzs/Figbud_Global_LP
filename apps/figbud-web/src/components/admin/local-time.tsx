"use client";

import { DEFAULT_TIME_ZONE, formatMoment, isoToZonedInput, zoneName, zonedInputToIso } from "@figbud/ui";
import { type ReactNode, createContext, useCallback, useContext, useMemo } from "react";

/*
 * The Studio's display time zone (owner's brief, 14 Nov 2026): timestamps
 * are stored in UTC and shown in the signed-in person's zone, their own
 * choice or the organisation's (East Africa Time by default; Settings &
 * Security → Time zone). The server and the browser get the same zone, so
 * they render the same text.
 */

const TimeZoneContext = createContext<string>(DEFAULT_TIME_ZONE);

export function TimeZoneProvider({ zone, children }: { zone?: string | null; children: ReactNode }) {
  return <TimeZoneContext.Provider value={zone || DEFAULT_TIME_ZONE}>{children}</TimeZoneContext.Provider>;
}

/** The zone timestamps are shown in. */
export const useTimeZone = () => useContext(TimeZoneContext);

/** A moment in the display zone: "14 Nov 2026, 18:56 EAT", or its date there. */
export function LocalTime({ iso, dateOnly }: { iso: string; dateOnly?: boolean }) {
  const zone = useTimeZone();
  return <time dateTime={iso}>{formatMoment(iso, { timeZone: zone, dateOnly })}</time>;
}

/** Formats moments in the display zone, for text built in code. */
export function useMoment() {
  const zone = useTimeZone();
  return useCallback(
    (iso: string, options: { dateOnly?: boolean } = {}) => formatMoment(iso, { timeZone: zone, ...options }),
    [zone],
  );
}

/**
 * `datetime-local` inputs read and written in the display zone, so a time
 * typed as 18:00 means 18:00 there whatever the computer's own zone.
 */
export function useZonedInput() {
  const zone = useTimeZone();
  return useMemo(
    () => ({
      /** The zone's short name, for labels ("EAT"). */
      name: zoneName(zone),
      toInput: (iso?: string | null) => (iso ? isoToZonedInput(iso, zone) : ""),
      fromInput: (value: string) => zonedInputToIso(value, zone),
      /** `minutes` from now, rounded up to the next 5 minutes. */
      fromNow: (minutes: number) => {
        const date = new Date(Date.now() + minutes * 60_000);
        date.setUTCSeconds(0, 0);
        date.setUTCMinutes(Math.ceil(date.getUTCMinutes() / 5) * 5);
        return isoToZonedInput(date, zone);
      },
    }),
    [zone],
  );
}
