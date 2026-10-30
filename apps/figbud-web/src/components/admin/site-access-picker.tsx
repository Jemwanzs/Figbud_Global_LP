"use client";

import { cn } from "@figbud/ui";
import { useId } from "react";

import { type AdminUser, ROLE_LABELS, hasRole } from "@/lib/admin-client";

export interface SiteOption {
  site: string;
  name: string;
  archived?: boolean;
}

/** Every website, or selected websites with a role on each (`slug -> role`). */
export interface AccessValue {
  all: boolean;
  sites: Record<string, AdminUser["role"]>;
}

const SITE_ROLES = ["viewer", "editor", "reviewer"] as const;

/** The value as the API takes it (`/v1/admin/team/{id}/access` and invites). */
export function accessBody(value: AccessValue) {
  return {
    all_sites: value.all,
    sites: value.all ? [] : Object.entries(value.sites).map(([site, role]) => ({ site, role })),
  };
}

/** Why the value can't be saved yet, or null. */
export function accessProblem(value: AccessValue): string | null {
  return !value.all && Object.keys(value.sites).length === 0 ? "Choose at least one website" : null;
}

/**
 * Per-website permissions (P7-F1): every website with the Studio role, or
 * selected websites, each with a role no higher than the Studio role.
 */
export function SiteAccessPicker({
  role,
  sites,
  value,
  onChange,
  legend = "Website access",
}: {
  role: AdminUser["role"];
  sites: SiteOption[];
  value: AccessValue;
  onChange: (value: AccessValue) => void;
  legend?: string;
}) {
  const uid = useId();
  if (role === "owner")
    return (
      <p className="rounded-xl border border-line bg-surface-2/60 p-3.5 text-sm text-muted">
        Owners always have every website.
      </p>
    );
  const roles = SITE_ROLES.filter((r) => hasRole({ role }, r));
  return (
    <fieldset>
      <legend className="text-sm font-medium text-text">{legend}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {(
          [
            [true, "All websites", "Their Studio role on every website, including new ones"],
            [false, "Selected websites", "Only the websites you choose, with a role on each"],
          ] as const
        ).map(([all, label, hint]) => (
          <label
            key={label}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
              value.all === all ? "border-accent bg-accent-soft/60" : "border-line hover:border-line-strong",
            )}
          >
            <input
              type="radio"
              name={`${uid}-scope`}
              checked={value.all === all}
              onChange={() => onChange({ ...value, all })}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text">{label}</span>
              <span className="block text-sm text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </div>
      {!value.all && (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line" aria-label="Websites">
          {sites.map((site) => {
            const current = value.sites[site.site];
            return (
              <li
                key={site.site}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-2.5"
              >
                <label htmlFor={`${uid}-${site.site}`} className="min-w-0 text-sm text-text">
                  {site.name}
                  {site.archived && <span className="text-subtle"> · archived</span>}
                </label>
                <select
                  id={`${uid}-${site.site}`}
                  value={current ?? ""}
                  onChange={(e) => {
                    const next = { ...value.sites };
                    if (e.target.value) next[site.site] = e.target.value as AdminUser["role"];
                    else delete next[site.site];
                    onChange({ ...value, sites: next });
                  }}
                  className={cn(
                    "min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm",
                    current ? "text-text" : "text-muted",
                  )}
                >
                  <option value="">No access</option>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
