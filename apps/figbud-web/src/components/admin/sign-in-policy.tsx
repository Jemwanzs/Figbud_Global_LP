"use client";

import { cn } from "@figbud/ui";
import { KeyRound } from "lucide-react";
import { useState } from "react";

import { AdminError, type AdminUser, ROLE_LABELS, adminFetch } from "@/lib/admin-client";
import { sameValue } from "@/lib/form-state";

import { ActionButton } from "./action-button";

export interface SignInPolicy {
  password_sign_in: boolean;
  passkey_sign_in: boolean;
  passkey_only_roles: AdminUser["role"][];
  idle_minutes: number | null;
  /** Roles whose password sign-in also needs an authenticator code. */
  two_factor_roles: AdminUser["role"][];
}

export interface PolicyPerson {
  id: string;
  name: string;
  email: string;
  role: AdminUser["role"];
  passkeys: number;
  password: boolean;
  two_factor: boolean;
}

export interface SignInPolicyData {
  policy: SignInPolicy;
  people: PolicyPerson[];
  passwords_available: boolean;
  idle_choices: number[];
  updated_at: string | null;
  updated_by: string | null;
}

const ROLES: AdminUser["role"][] = ["owner", "reviewer", "editor", "viewer"];

const duration = (minutes: number) =>
  minutes < 60 ? `${minutes} minutes` : minutes === 60 ? "1 hour" : `${minutes / 60} hours`;

/** The same rule as the API (`policy.rs`, `way_in`): a way in that the policy allows. */
function wayIn(policy: SignInPolicy, person: PolicyPerson, codesWork: boolean) {
  const passkey = person.passkeys > 0 && policy.passkey_sign_in;
  const password =
    person.password &&
    policy.password_sign_in &&
    !policy.passkey_only_roles.includes(person.role) &&
    (person.two_factor ? codesWork : !policy.two_factor_roles.includes(person.role));
  return passkey || password;
}

/**
 * The organisation's sign-in policy (P13-B4). Before saving, it shows who
 * would have no way in under the change; owners can never be left without
 * one (the API refuses it too), and sessions started a way that's turned
 * off end at once.
 */
export function SignInPolicyEditor({ data }: { data: SignInPolicyData }) {
  const [saved, setSaved] = useState(data.policy);
  const [draft, setDraft] = useState(data.policy);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const changed = !sameValue(draft, saved);
  const stranded = data.people.filter((p) => !wayIn(draft, p, data.passwords_available));
  const ownersStranded = stranded.filter((p) => p.role === "owner");
  const noWay = !draft.password_sign_in && !draft.passkey_sign_in;

  const set = (patch: Partial<SignInPolicy>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setMessage(null);
  };
  const toggleRole = (role: AdminUser["role"]) =>
    set({
      passkey_only_roles: draft.passkey_only_roles.includes(role)
        ? draft.passkey_only_roles.filter((r) => r !== role)
        : ROLES.filter((r) => r === role || draft.passkey_only_roles.includes(r)),
    });
  const toggleTwoFactor = (role: AdminUser["role"]) =>
    set({
      two_factor_roles: draft.two_factor_roles.includes(role)
        ? draft.two_factor_roles.filter((r) => r !== role)
        : ROLES.filter((r) => r === role || draft.two_factor_roles.includes(r)),
    });

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminFetch<{
        policy: SignInPolicy;
        sessions_ended: number;
        without_a_way_in: string[];
      }>("sign-in-policy", draft);
      setSaved(result.policy);
      setDraft(result.policy);
      const ended = result.sessions_ended
        ? ` ${result.sessions_ended} session(s) started a way that's now off and have ended.`
        : "";
      setMessage({ tone: "ok", text: `Sign-in policy saved. It applies now.${ended}` });
    } catch (err) {
      setMessage({
        tone: "error",
        text:
          err instanceof AdminError && err.status === 403
            ? "Please confirm it's you first, in Settings → Security & Authentication, then try again."
            : err instanceof AdminError
              ? (err.fields[0]?.message ?? err.message)
              : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  }

  const box = "size-5 shrink-0 accent-[var(--action)]";
  return (
    <section aria-labelledby="sign-in-policy" className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong"
        >
          <KeyRound className="size-5" />
        </span>
        <div>
          <h2 id="sign-in-policy" className="font-display text-xl font-semibold text-text">
            Sign-in policy
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            A passkey is already two factors: the device plus its PIN or fingerprint. A password can also ask
            for an authenticator code, for the roles you choose. For the strongest protection, a role can be
            required to use passkeys, which can&apos;t be phished. Passwords are stored only as secure hashes.
          </p>
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className="text-sm font-medium text-text">Ways to sign in</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm text-text">
            <input
              type="checkbox"
              className={box}
              checked={draft.passkey_sign_in}
              onChange={(e) => set({ passkey_sign_in: e.target.checked })}
            />
            Passkeys
          </label>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm text-text">
            <input
              type="checkbox"
              className={box}
              checked={draft.password_sign_in}
              onChange={(e) => set({ password_sign_in: e.target.checked })}
            />
            Password with two-factor
          </label>
        </div>
        {!data.passwords_available && (
          <p className="mt-2 text-xs text-subtle">
            Authenticator codes can&apos;t be checked on this server yet (it needs its secrets key), so
            passwords only work for roles that don&apos;t need two-factor.
          </p>
        )}
      </fieldset>

      <fieldset className="mt-6" disabled={!draft.password_sign_in}>
        <legend className="text-sm font-medium text-text">Roles that must use a passkey</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ROLES.map((role) => (
            <label
              key={role}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm text-text has-[:disabled]:opacity-60"
            >
              <input
                type="checkbox"
                className={box}
                checked={draft.passkey_only_roles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              {ROLE_LABELS[role]}
              <span className="sr-only"> must use a passkey</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6" disabled={!draft.password_sign_in}>
        <legend className="text-sm font-medium text-text">Roles that need two-factor with a password</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ROLES.map((role) => (
            <label
              key={role}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm text-text has-[:disabled]:opacity-60"
            >
              <input
                type="checkbox"
                className={box}
                checked={draft.two_factor_roles.includes(role)}
                onChange={() => toggleTwoFactor(role)}
              />
              {ROLE_LABELS[role]}
              <span className="sr-only"> needs two-factor</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-subtle">
          Recommended for owners and reviewers. Their recovery links always need two-factor.
        </p>
      </fieldset>

      <label className="mt-6 grid max-w-xs gap-1 text-sm font-medium text-text">
        Sign out after inactivity
        <select
          value={draft.idle_minutes ?? ""}
          onChange={(e) => set({ idle_minutes: e.target.value ? Number(e.target.value) : null })}
          className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm font-normal text-text"
        >
          <option value="">Never (sessions last until they expire)</option>
          {data.idle_choices.map((m) => (
            <option key={m} value={m}>
              After {duration(m)}
            </option>
          ))}
        </select>
      </label>

      {changed && (
        <div data-testid="policy-impact" className="mt-6 rounded-xl bg-surface-2 p-4 text-sm">
          {stranded.length === 0 ? (
            <p className="text-text">Everyone keeps a way to sign in.</p>
          ) : (
            <>
              <p className="font-medium text-text">
                {stranded.length === 1
                  ? "1 person would have no way to sign in:"
                  : `${stranded.length} people would have no way to sign in:`}
              </p>
              <ul className="mt-2 grid gap-1 text-muted">
                {stranded.map((p) => (
                  <li key={p.id}>
                    {p.name} ({ROLE_LABELS[p.role]}, {p.email})
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-muted">
                {ownersStranded.length
                  ? "Owners must keep a way in, so this can't be saved."
                  : "They can be sent a new invitation to set up a passkey."}
              </p>
            </>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ActionButton
          ready={changed && !noWay && ownersStranded.length === 0}
          busy={busy}
          hint={
            !changed
              ? "No changes"
              : noWay
                ? "Keep at least one way to sign in"
                : ownersStranded.length
                  ? "An owner would have no way in"
                  : undefined
          }
          onClick={save}
        >
          Save sign-in policy
        </ActionButton>
        {data.updated_by && <span className="text-xs text-subtle">Last changed by {data.updated_by}</span>}
      </div>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("mt-3 text-sm", message.tone === "error" ? "text-danger" : "text-success")}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
