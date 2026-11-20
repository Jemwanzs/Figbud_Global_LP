"use client";

import { type ReactNode, createContext, useContext } from "react";

import { type DemoIdentities, type DemoPerson, demoPeople } from "./demo-identities";

const DemoPeopleContext = createContext<DemoPerson[] | null>(null);

/** The sample identities a page's illustrations use (P14-W10): published ones, or a draft in the Studio. */
export function DemoPeopleProvider({
  identities,
  slug,
  children,
}: {
  identities: DemoIdentities | null | undefined;
  /** The website, for its lead identity. */
  slug?: string;
  children: ReactNode;
}) {
  return (
    <DemoPeopleContext.Provider value={demoPeople(identities, slug)}>{children}</DemoPeopleContext.Provider>
  );
}

/** The people in order (at least five): the approved defaults outside a provider. */
export function useDemoPeople(): DemoPerson[] {
  return useContext(DemoPeopleContext) ?? demoPeople(null);
}

/** A round initials avatar, as the illustrations draw people (no portraits). */
export function DemoAvatar({ person, className }: { person: DemoPerson; className?: string }) {
  return (
    <span
      aria-hidden
      className={
        className ??
        "grid size-8 shrink-0 place-items-center rounded-full bg-product text-[0.7rem] font-semibold text-product-ink"
      }
    >
      {person.initials}
    </span>
  );
}

/** One sample person's name (or first name, short form or role), the `index`-th in order. */
export function DemoName({
  index = 0,
  form = "name",
  fallback,
}: {
  index?: number;
  form?: "name" | "short" | "first" | "initials" | "role";
  /** For a role an identity doesn't have. */
  fallback?: string;
}) {
  const person = useDemoPeople()[index]!;
  return <>{form === "role" ? (person.role ?? fallback ?? "") : person[form]}</>;
}
