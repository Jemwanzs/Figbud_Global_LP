/**
 * Sample identities (owner's brief, 20 Nov 2026, P14-W10): the fictional
 * people every website's illustrations and demonstrations use, managed once
 * in the Studio (Marketing → Sample identities, saved with FigBud Global's
 * settings). Plain data and functions, usable on the server; the
 * demonstrations read them through `useDemoPeople` (demo-people.tsx).
 *
 * Only fictional marketing content: real people, customers, testimonials
 * and records never come from here.
 */

export interface DemoIdentity {
  id: string;
  /** In full: "Libbie Sonia". */
  name: string;
  /** Unset: the first word of the name. */
  first_name?: string | null;
  /** Unset: from the name. */
  initials?: string | null;
  /** A fictional job role, where an illustration shows one. */
  role?: string | null;
  active?: boolean;
}

export interface DemoIdentities {
  people: DemoIdentity[];
  /** The identity that leads on each website, by slug. */
  leads?: Record<string, string>;
}

/**
 * The owner's approved names, in the approved rotation (Libbie, Bright,
 * James, Titus, Derick), then Fortune Bright. "Bright" is also a first name
 * on its own.
 */
export const DEFAULT_DEMO_IDENTITIES: DemoIdentities = {
  people: [
    { id: "libbie", name: "Libbie Sonia", role: "Finance · accounts lead", active: true },
    { id: "bright", name: "Bright", role: "Operations manager", active: true },
    { id: "james", name: "James Bright", role: "HR officer", active: true },
    { id: "titus", name: "Titus", role: "Sales executive", active: true },
    { id: "derick", name: "Derick", role: "Payroll specialist", active: true },
    { id: "fortune", name: "Fortune Bright", role: "Team lead", active: true },
  ],
  leads: {},
};

/** A person as illustrations show them. */
export interface DemoPerson {
  id: string;
  /** "Libbie Sonia". */
  name: string;
  /** "Libbie". */
  first: string;
  /** "Libbie S.", or the single name ("Titus"). */
  short: string;
  /** "LS". */
  initials: string;
  role: string | null;
}

export function toPerson(p: DemoIdentity): DemoPerson {
  const words = p.name.trim().split(/\s+/);
  const first = p.first_name?.trim() || words[0] || p.name;
  const last = words.length > 1 ? words[words.length - 1] : null;
  return {
    id: p.id,
    name: p.name,
    first,
    short: last ? `${first} ${last[0]}.` : first,
    initials: (
      p.initials?.trim() ||
      words
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
    ).toUpperCase(),
    role: p.role ?? null,
  };
}

/**
 * The people a website's illustrations use, in order: its lead first, then
 * the others as published. Always at least the approved defaults, so an
 * illustration never runs out of names.
 */
export function demoPeople(identities: DemoIdentities | null | undefined, slug?: string): DemoPerson[] {
  const active = (identities?.people ?? []).filter((p) => p.active !== false);
  const list = active.length ? active : DEFAULT_DEMO_IDENTITIES.people;
  const lead = slug ? identities?.leads?.[slug] : undefined;
  const ordered = lead ? [...list.filter((p) => p.id === lead), ...list.filter((p) => p.id !== lead)] : list;
  const people = ordered.map(toPerson);
  // Illustrations need up to five; repeat the list rather than invent anyone.
  while (people.length < 5) people.push(...ordered.map(toPerson));
  return people;
}
