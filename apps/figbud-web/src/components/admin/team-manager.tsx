"use client";

import { cn, useConfirm } from "@figbud/ui";
import { Globe2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { type AdminUser, AdminError, ROLE_LABELS, adminFetch } from "@/lib/admin-client";
import { sameValue } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { AreasEditor, type StudioRoleOption } from "./areas-editor";
import { MemberSessions } from "./member-sessions";
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
  has_password?: boolean;
  has_two_factor?: boolean;
  passkeys?: number;
  /** Studio areas (P13-B3); null: every area within their role. */
  modules?: AdminUser["modules"];
  /** The named Studio role their areas come from. */
  studio_role_id?: string | null;
  studio_role?: string | null;
}

const ROLES: AdminUser["role"][] = ["owner", "reviewer", "editor", "viewer"];

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

/**
 * Users & access: everyone's role, websites and sign-in methods, with owner
 * controls (P7-F1; owner's brief, 12 Nov 2026), filtered by role, website and
 * status. The API enforces every rule; this only offers what it allows.
 */
export function TeamManager({
  members,
  sites,
  me,
  roles = [],
}: {
  members: TeamMember[];
  sites: SiteOption[];
  me: string;
  /** Saved Studio roles (P13-B3). */
  roles?: StudioRoleOption[];
}) {
  const [role, setRole] = useState("");
  const [site, setSite] = useState("");
  const [status, setStatus] = useState("");
  const shown = members.filter(
    (m) =>
      (!role || m.role === role) &&
      (!site || m.all_sites || m.role === "owner" || m.sites.some((s) => s.site === site)) &&
      (!status || (status === "suspended") === Boolean(m.disabled_at)),
  );
  const select = "min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text";
  return (
    <>
      <div role="group" aria-label="Filter people" className="mb-5 flex flex-wrap gap-3">
        <label className="grid gap-1 text-xs text-muted">
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)} className={select}>
            <option value="">Any role</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Website
          <select value={site} onChange={(e) => setSite(e.target.value)} className={select}>
            <option value="">Any website</option>
            {sites
              .filter((s) => !s.archived)
              .map((s) => (
                <option key={s.site} value={s.site}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={select}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <p aria-live="polite" className="self-end pb-3 text-xs text-subtle">
          {`${shown.length} of ${members.length}`}
        </p>
      </div>
      <ul className="space-y-4" aria-label="Team">
        {shown.map((member) => (
          <Member key={member.id} member={member} sites={sites} self={member.id === me} roles={roles} />
        ))}
      </ul>
    </>
  );
}

function Member({
  member,
  sites,
  self,
  roles,
}: {
  member: TeamMember;
  sites: SiteOption[];
  self: boolean;
  roles: StudioRoleOption[];
}) {
  const confirm = useConfirm();
  const [saved, setSaved] = useState<TeamMember>(member);
  const [value, setValue] = useState<AccessValue>(toValue(member));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<{ recovery_url: string; hours: number } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const changed = !sameValue(value, toValue(saved));
  const problem = accessProblem(value);
  const editable = saved.role !== "owner" && !saved.disabled_at;
  const [nextRole, setNextRole] = useState<AdminUser["role"]>(member.role);

  /** Owner controls: each is checked again by the API (last owner, recent verification). */
  async function manage<T>(path: string, body: Record<string, unknown>, done: (r: T) => string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminFetch<T>(`team/${saved.id}/${path}`, body);
      setMessage({ tone: "ok", text: done(result) });
    } catch (err) {
      setMessage({
        tone: "error",
        text:
          err instanceof AdminError && err.status === 403
            ? "Please confirm it's you first, in Settings → Security & Authentication, then try again."
            : err instanceof AdminError
              ? err.message
              : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  }
  const changeRole = () =>
    manage("role", { role: nextRole }, () => {
      setSaved((s) => ({ ...s, role: nextRole, all_sites: nextRole === "owner" ? true : s.all_sites }));
      return `Role changed to ${ROLE_LABELS[nextRole]}. It applies from their next click.`;
    });
  const suspend = async () =>
    (await confirm({
      title: `Suspend ${saved.name}?`,
      body: "They're signed out of every device at once and can't sign in until reactivated. Their work and history stay.",
      confirmLabel: "Suspend",
      tone: "danger",
    })) &&
    manage("suspend", {}, () => {
      setSaved((s) => ({ ...s, disabled_at: new Date().toISOString() }));
      return "Suspended and signed out everywhere.";
    });
  const reactivate = () =>
    manage("reactivate", {}, () => {
      setSaved((s) => ({ ...s, disabled_at: null }));
      return "Reactivated. They can sign in again.";
    });
  const signOut = async () =>
    (await confirm({
      title: `Sign ${saved.name} out of every device?`,
      body: "Every open session ends now. They can sign in again straight away.",
      confirmLabel: "Sign out everywhere",
      tone: "warning",
    })) &&
    manage("sessions/revoke", {}, (r: { sessions_ended: number }) =>
      r.sessions_ended ? `Signed out of ${r.sessions_ended} session(s).` : "They had no open sessions.",
    );

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

  async function createRecoveryLink() {
    setBusy(true);
    setMessage(null);
    try {
      setRecovery(
        await adminFetch<{ recovery_url: string; hours: number }>(`team/${saved.id}/recovery-link`, {}),
      );
    } catch (err) {
      setMessage({
        tone: "error",
        text:
          err instanceof AdminError && err.status === 403
            ? "Please confirm it's you first, in Settings → Security & Authentication."
            : err instanceof AdminError
              ? err.message
              : "Something went wrong.",
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
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-muted">Suspended</span>
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
            {saved.has_two_factor && (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-muted">Two-factor on</span>
            )}
            {saved.has_password && (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-muted">Password</span>
            )}
            {Boolean(saved.passkeys) && (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-muted">
                {saved.passkeys === 1 ? "1 passkey" : `${saved.passkeys} passkeys`}
              </span>
            )}
            <span className="text-subtle">
              {saved.last_login_at
                ? `Last sign-in ${new Date(saved.last_login_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                : "Never signed in"}
            </span>
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
      {!self && (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
          {!saved.disabled_at && (
            <>
              <label className="grid gap-1 text-xs text-muted">
                Studio role
                <select
                  value={nextRole}
                  disabled={busy}
                  onChange={(e) => setNextRole(e.target.value as AdminUser["role"])}
                  className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <ActionButton
                variant="secondary"
                ready={nextRole !== saved.role}
                busy={busy}
                onClick={changeRole}
              >
                Change role
                <span className="sr-only"> for {saved.name}</span>
              </ActionButton>
              <button
                type="button"
                disabled={busy}
                onClick={signOut}
                className="min-h-11 rounded-xl px-3 text-sm font-medium text-text hover:bg-surface-2"
              >
                Sign out everywhere
                <span className="sr-only"> ({saved.name})</span>
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={saved.disabled_at ? reactivate : suspend}
            className={cn(
              "min-h-11 rounded-xl px-3 text-sm font-medium hover:bg-surface-2",
              saved.disabled_at ? "text-accent" : "text-danger",
            )}
          >
            {saved.disabled_at ? "Reactivate" : "Suspend"}
            <span className="sr-only"> {saved.name}</span>
          </button>
        </div>
      )}
      {!self && !saved.disabled_at && <MemberSessions id={saved.id} name={saved.name} />}
      {!self && !saved.disabled_at && saved.has_two_factor && (
        <div className="mt-4 border-t border-line pt-4">
          <button
            type="button"
            onClick={createRecoveryLink}
            disabled={busy}
            className="min-h-11 rounded-xl px-3 text-sm font-medium text-accent hover:bg-accent-soft/60"
          >
            Create password recovery link
            <span className="sr-only"> for {saved.name}</span>
          </button>
          {recovery && (
            <div className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">
              <p className="text-muted">
                Share this with {saved.name} directly. It works once and expires in {recovery.hours} hours.
                They&apos;ll still need their authenticator app.
              </p>
              <p data-testid="recovery-url" className="mt-2 font-mono text-xs break-all text-text select-all">
                {recovery.recovery_url}
              </p>
            </div>
          )}
        </div>
      )}
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
          <AreasEditor
            id={saved.id}
            name={saved.name}
            role={saved.role}
            initial={saved.modules ?? null}
            initialRole={saved.studio_role_id ?? null}
            roles={roles}
          />
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
