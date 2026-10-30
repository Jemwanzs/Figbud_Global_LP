"use client";

import { cn } from "@figbud/ui";
import { Globe2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { type AdminUser, AdminError, ROLE_LABELS, adminFetch } from "@/lib/admin-client";
import { sameValue } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import {
  type AccessValue,
  type SiteOption,
  SiteAccessPicker,
  accessBody,
  accessProblem,
} from "./site-access-picker";

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: AdminUser["role"];
  all_sites: boolean;
  sites: { site: string; name: string; role: AdminUser["role"] }[];
  last_login_at: string | null;
  disabled_at: string | null;
}

const toValue = (m: TeamMember): AccessValue => ({
  all: m.all_sites,
  sites: Object.fromEntries(m.sites.map((s) => [s.site, s.role])),
});

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Owners decide which websites each person works on (P7-F1). */
export function TeamManager({
  members,
  sites,
  me,
}: {
  members: TeamMember[];
  sites: SiteOption[];
  me: string;
}) {
  return (
    <ul className="space-y-4" aria-label="Team">
      {members.map((member) => (
        <Member key={member.id} member={member} sites={sites} self={member.id === me} />
      ))}
    </ul>
  );
}

function Member({ member, sites, self }: { member: TeamMember; sites: SiteOption[]; self: boolean }) {
  const [saved, setSaved] = useState<TeamMember>(member);
  const [value, setValue] = useState<AccessValue>(toValue(member));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const changed = !sameValue(value, toValue(saved));
  const problem = accessProblem(value);
  const editable = saved.role !== "owner" && !saved.disabled_at;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminFetch<{ all_sites: boolean; sites: TeamMember["sites"] }>(
        `team/${saved.id}/access`,
        accessBody(value),
      );
      const next = { ...saved, all_sites: result.all_sites, sites: result.sites };
      setSaved(next);
      setValue(toValue(next));
      setMessage({ tone: "ok", text: "Access saved. It applies from their next click." });
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      aria-label={saved.name}
      className={cn("fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6", saved.disabled_at && "opacity-60")}
    >
      <div className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong"
        >
          {initials(saved.name) || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text">
            {saved.name}
            {self && <span className="text-subtle"> (you)</span>}
          </p>
          <p className="truncate text-sm text-muted">{saved.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-text">
              <ShieldCheck aria-hidden className="size-3.5 text-accent" />
              {ROLE_LABELS[saved.role]}
            </span>
            {saved.disabled_at ? (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-muted">Disabled</span>
            ) : saved.all_sites ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-muted">
                <Globe2 aria-hidden className="size-3.5" />
                All websites
              </span>
            ) : (
              saved.sites.map((s) => (
                <span key={s.site} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-muted">
                  {s.name} · {ROLE_LABELS[s.role]}
                </span>
              ))
            )}
          </div>
        </div>
        {editable && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="min-h-11 rounded-xl px-3 text-sm font-medium text-accent hover:bg-accent-soft/60"
          >
            {open ? "Close" : "Change access"}
            <span className="sr-only"> for {saved.name}</span>
          </button>
        )}
      </div>
      {open && editable && (
        <div className="mt-5 space-y-4 border-t border-line pt-5">
          <SiteAccessPicker role={saved.role} sites={sites} value={value} onChange={setValue} />
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton
              ready={changed && problem === null}
              busy={busy}
              hint={!changed ? "No changes" : (problem ?? undefined)}
              onClick={save}
            >
              Save access
            </ActionButton>
          </div>
        </div>
      )}
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("mt-3 text-sm", message.tone === "error" ? "text-danger" : "text-success")}
        >
          {message.text}
        </p>
      )}
    </li>
  );
}
