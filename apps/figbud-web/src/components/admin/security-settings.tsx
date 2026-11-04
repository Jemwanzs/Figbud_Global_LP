"use client";

import { cn } from "@figbud/ui";
import {
  CheckCircle2,
  Copy,
  Download,
  Fingerprint,
  History,
  KeyRound,
  LaptopMinimal,
  Lock,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";

import {
  AdminError,
  adminFetch,
  assertPasskey,
  createPasskey,
  describePasskeyError,
  supportsPasskeys,
} from "@/lib/admin-client";

import { ActionButton } from "./action-button";
import { LocalTime } from "./local-time";
import { PasswordField } from "./password-field";

export interface SecurityOverview {
  /** Whether two-factor can be used on this server (its encryption key is set). */
  available: boolean;
  /** Identity checked recently, which sensitive changes need. */
  verified: boolean;
  password: { set: boolean; set_at: string | null };
  two_factor: { enabled: boolean; confirmed_at: string | null; recovery_codes_left: number };
  passkeys: { id: string; label: string; created_at: string; last_used_at: string | null }[];
  sessions: {
    id: string;
    current: boolean;
    user_agent: string | null;
    method: string;
    created_at: string;
    last_seen_at: string;
  }[];
  activity: { id: string; action: string; detail: Record<string, unknown>; created_at: string }[];
}

type Ceremony = { challenge_id: string; options: { publicKey: Record<string, unknown> } };
type TwoFactorSetup = { secret: string; url: string; qr: { size: number; modules: string } };

const ACTIVITY: Record<string, string> = {
  "admin.login": "Signed in",
  "admin.logout": "Signed out",
  "admin.login_failed": "Failed sign-in attempt",
  "admin.user_created": "Joined with a passkey",
  "admin.passkey_added": "Added a passkey",
  "admin.passkey_removed": "Removed a passkey",
  "admin.password_created": "Created a password",
  "admin.password_changed": "Changed password",
  "admin.password_removed": "Removed password",
  "admin.password_reset": "Reset password with a recovery link",
  "admin.password_reset_requested": "Requested a password reset",
  "admin.password_locked": "Password sign-in paused after repeated failures",
  "admin.two_factor_enabled": "Turned on two-factor",
  "admin.two_factor_replaced": "Replaced authenticator app",
  "admin.two_factor_removed": "Turned off two-factor",
  "admin.recovery_codes_replaced": "Created new recovery codes",
  "admin.session_revoked": "Signed out a device",
  "admin.sessions_revoked": "Signed out other devices",
  "admin.invite_created": "Created an invite",
  "admin.recovery_link_created": "Created a recovery link for someone",
  "admin.access_changed": "Changed someone's website access",
};
const METHODS: Record<string, string> = {
  passkey: "passkey",
  password: "password and two-factor",
  recovery_code: "password and recovery code",
  two_factor: "two-factor code",
  identity_check: "identity check",
};

/** "Chrome on Windows" from a browser's user agent. */
export function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  return os ? `${browser} on ${os}` : browser;
}

/** A QR code as plain shapes: dark on white in both themes, so every camera can read it. */
function QrCode({ size, modules }: TwoFactorSetup["qr"]) {
  let path = "";
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) if (modules[y * size + x] === "1") path += `M${x} ${y}h1v1h-1z`;
  return (
    <svg
      role="img"
      aria-label="QR code for your authenticator app"
      viewBox={`-3 -3 ${size + 6} ${size + 6}`}
      shapeRendering="crispEdges"
      className="size-48 shrink-0 rounded-xl"
    >
      <rect x="-3" y="-3" width={size + 6} height={size + 6} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

function Section({
  title,
  icon,
  status,
  children,
}: {
  title: string;
  icon: ReactNode;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
          {icon}
        </span>
        <h2 className="font-semibold text-text">{title}</h2>
        {status && <span className="ms-auto">{status}</span>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

const On = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
    <CheckCircle2 aria-hidden className="size-3.5" />
    {children}
  </span>
);
const Off = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">{children}</span>
);

/** Studio → Settings → Security & Authentication (P13-A): each person's own sign-in methods and devices. */
export function SecuritySettings({ data, email }: { data: SecurityOverview; email: string }) {
  const router = useRouter();
  const uid = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Identity check.
  const [checkPassword, setCheckPassword] = useState("");
  const [checkCode, setCheckCode] = useState("");

  // Two-factor setup and recovery codes.
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  // Password and passkeys.
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [label, setLabel] = useState("");

  const locked = !data.verified;
  const onlyPasskey = data.passkeys.length === 1 && !data.password.set;
  const others = data.sessions.filter((s) => !s.current);

  /** Runs an action with one busy state and message; refreshes what's on screen afterwards. */
  async function run(name: string, action: () => Promise<string | void>) {
    setBusy(name);
    setMessage(null);
    setFieldError(null);
    try {
      const text = await action();
      if (text) setMessage({ tone: "ok", text });
      router.refresh();
    } catch (err) {
      if (err instanceof AdminError && err.status === 403) router.refresh();
      if (err instanceof AdminError && err.fields[0]) setFieldError(err.fields[0].message);
      else setMessage({ tone: "error", text: describePasskeyError(err) });
    } finally {
      setBusy(null);
    }
  }

  const confirmWithPasskey = () =>
    run("check-passkey", async () => {
      const start = await adminFetch<Ceremony>("security/verify/passkey/start", {});
      const credential = await assertPasskey(start.options);
      await adminFetch("security/verify/passkey/finish", { challenge_id: start.challenge_id, credential });
      return "Thanks, that's confirmed for the next 10 minutes.";
    });

  const confirmWithPassword = () =>
    run("check-password", async () => {
      await adminFetch("security/verify/password", { password: checkPassword, code: checkCode });
      setCheckPassword("");
      setCheckCode("");
      return "Thanks, that's confirmed for the next 10 minutes.";
    });

  const startSetup = () =>
    run("setup", async () => {
      setCodes(null);
      setSetupCode("");
      setSetup(await adminFetch<TwoFactorSetup>("security/two-factor/start", {}));
    });

  const confirmSetup = () =>
    run("confirm", async () => {
      const done = await adminFetch<{ recovery_codes: string[] }>("security/two-factor/confirm", {
        code: setupCode,
      });
      setSetup(null);
      setSetupCode("");
      setCodes(done.recovery_codes);
      return "Two-factor is on. Save your recovery codes now.";
    });

  const newCodes = () =>
    run("codes", async () => {
      if (!window.confirm("Create new recovery codes? Your current ones stop working.")) return;
      const done = await adminFetch<{ recovery_codes: string[] }>("security/recovery-codes", {});
      setCodes(done.recovery_codes);
      return "New recovery codes created. Save them now.";
    });

  const removeTwoFactor = () =>
    run("remove-2fa", async () => {
      if (!window.confirm("Turn off two-factor?")) return;
      await adminFetch("security/two-factor/remove", {});
      return "Two-factor is off.";
    });

  const savePassword = () =>
    run("password", async () => {
      if (password !== repeat) {
        setFieldError("The two passwords don't match.");
        return;
      }
      await adminFetch("security/password", { password });
      setPassword("");
      setRepeat("");
      return data.password.set
        ? "Password changed. Your other devices were signed out."
        : "Password created. You can now sign in with it and your authenticator app on any device.";
    });

  const removePassword = () =>
    run("remove-password", async () => {
      if (!window.confirm("Remove your password? You'll sign in with a passkey only.")) return;
      await adminFetch("security/password/remove", {});
      return "Password removed.";
    });

  const addPasskey = () =>
    run("add-passkey", async () => {
      if (!supportsPasskeys()) throw new AdminError("This browser doesn't support passkeys.", 0);
      const start = await adminFetch<Ceremony>("security/passkeys/start", {});
      const credential = await createPasskey(start.options);
      await adminFetch("security/passkeys/finish", {
        challenge_id: start.challenge_id,
        credential,
        label,
      });
      setLabel("");
      return "Passkey added to this device.";
    });

  const removePasskey = (id: string, name: string) =>
    run(`passkey-${id}`, async () => {
      if (!window.confirm(`Remove the passkey "${name}"?`)) return;
      await adminFetch(`security/passkeys/${id}/remove`, {});
      return "Passkey removed.";
    });

  const revoke = (id: string) =>
    run(`session-${id}`, async () => {
      await adminFetch(`security/sessions/${id}/revoke`, {});
      return "That device was signed out.";
    });

  const revokeOthers = () =>
    run("others", async () => {
      await adminFetch("security/sessions/revoke-others", {});
      return "Your other devices were signed out.";
    });

  const copyCodes = async () => {
    await navigator.clipboard.writeText((codes ?? []).join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  const downloadCodes = () => {
    const text = `FigBud Studio recovery codes for ${email}\nEach code works once.\n\n${(codes ?? []).join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "figbud-studio-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const inputClass =
    "mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-base text-text";

  return (
    <div className="mt-8 max-w-4xl space-y-6">
      {message && (
        <p
          role={message.tone === "ok" ? "status" : "alert"}
          className={cn("text-sm", message.tone === "ok" ? "text-success" : "text-danger")}
        >
          {message.text}
        </p>
      )}

      {!data.available && (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          Passwords and two-factor aren&apos;t available on this server yet. Passkeys work as usual.
        </p>
      )}

      {locked && (
        <section
          aria-labelledby={`${uid}-check`}
          className="rounded-[var(--radius-panel)] border border-accent/40 bg-accent-soft/30 p-5 sm:p-7"
        >
          <h2 id={`${uid}-check`} className="font-semibold text-text">
            Confirm it&apos;s you
          </h2>
          <p className="mt-1 text-sm text-muted">
            Changing how you sign in needs a recent check. Viewing and signing out devices doesn&apos;t.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {data.passkeys.length > 0 && (
              <ActionButton
                ready
                busy={busy === "check-passkey"}
                variant={data.password.set ? "secondary" : "primary"}
                icon={<KeyRound aria-hidden className="size-4" />}
                onClick={confirmWithPasskey}
              >
                Confirm with passkey
              </ActionButton>
            )}
          </div>
          {data.password.set && (
            <form
              className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void confirmWithPassword();
              }}
            >
              <PasswordField
                id={`${uid}-check-password`}
                label="Your password"
                value={checkPassword}
                onChange={setCheckPassword}
                autoComplete="current-password"
              />
              <div>
                <label htmlFor={`${uid}-check-code`} className="block text-sm font-medium text-text">
                  Authenticator code
                </label>
                <input
                  id={`${uid}-check-code`}
                  value={checkCode}
                  onChange={(e) => setCheckCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className={inputClass}
                />
              </div>
              <div>
                <ActionButton
                  type="submit"
                  ready={Boolean(checkPassword && checkCode)}
                  busy={busy === "check-password"}
                >
                  Confirm with password
                </ActionButton>
              </div>
            </form>
          )}
        </section>
      )}

      <Section
        title="Two-factor authentication"
        icon={<ShieldCheck className="size-5" />}
        status={data.two_factor.enabled ? <On>On</On> : <Off>Off</Off>}
      >
        <p className="text-sm text-muted">
          A 6-digit code from an authenticator app such as Google Authenticator, Microsoft Authenticator or
          1Password. It&apos;s required with a password.
        </p>
        {data.two_factor.enabled && (
          <p className="mt-2 text-sm text-text">
            {data.two_factor.recovery_codes_left} recovery{" "}
            {data.two_factor.recovery_codes_left === 1 ? "code" : "codes"} left.
          </p>
        )}

        {setup && (
          <div className="mt-5 rounded-2xl border border-line p-4 sm:p-5">
            <div className="flex flex-col gap-5 sm:flex-row">
              <QrCode {...setup.qr} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">1. Scan this in your authenticator app</p>
                <p className="mt-1 text-sm text-muted">On this phone? Open it directly, or type the key.</p>
                <p className="mt-2">
                  <a href={setup.url} className="text-sm font-medium text-accent-strong underline">
                    Open in authenticator app
                  </a>
                </p>
                <p className="mt-3 text-xs text-subtle">Setup key</p>
                <p data-testid="totp-secret" className="font-mono text-sm break-all text-text select-all">
                  {setup.secret}
                </p>
                <form
                  className="mt-4"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    void confirmSetup();
                  }}
                >
                  <label htmlFor={`${uid}-setup`} className="block text-sm font-medium text-text">
                    2. Enter the 6-digit code it shows
                  </label>
                  <input
                    id={`${uid}-setup`}
                    value={setupCode}
                    onChange={(e) => setSetupCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    aria-invalid={Boolean(fieldError) || undefined}
                    className={cn(inputClass, "max-w-48 font-mono tracking-[0.2em]")}
                  />
                  {fieldError && <p className="mt-2 text-sm text-danger">{fieldError}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton type="submit" ready={setupCode.length === 6} busy={busy === "confirm"}>
                      Turn on two-factor
                    </ActionButton>
                    <ActionButton ready variant="ghost" onClick={() => setSetup(null)}>
                      Cancel
                    </ActionButton>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {codes && (
          <div className="mt-5 rounded-2xl border border-accent/40 p-4 sm:p-5" data-testid="recovery-codes">
            <p className="flex items-center gap-2 font-medium text-text">
              <ShieldAlert aria-hidden className="size-5 text-warning" />
              Save these recovery codes now
            </p>
            <p className="mt-1 text-sm text-muted">
              They&apos;re your way in if you lose your authenticator app. Each works once, and they
              won&apos;t be shown again.
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-sm text-text">
              {codes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton
                ready
                variant="secondary"
                icon={<Copy aria-hidden className="size-4" />}
                onClick={copyCodes}
              >
                {copied ? "Copied" : "Copy"}
              </ActionButton>
              <ActionButton
                ready
                variant="secondary"
                icon={<Download aria-hidden className="size-4" />}
                onClick={downloadCodes}
              >
                Download
              </ActionButton>
              <ActionButton ready variant="ghost" onClick={() => setCodes(null)}>
                I&apos;ve saved them
              </ActionButton>
            </div>
          </div>
        )}

        {!setup && (
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              ready={!locked && data.available}
              busy={busy === "setup"}
              variant={data.two_factor.enabled ? "secondary" : "primary"}
              onClick={startSetup}
            >
              {data.two_factor.enabled ? "Replace authenticator" : "Set up two-factor"}
            </ActionButton>
            {data.two_factor.enabled && (
              <ActionButton ready={!locked} busy={busy === "codes"} variant="secondary" onClick={newCodes}>
                New recovery codes
              </ActionButton>
            )}
            {data.two_factor.enabled && !data.password.set && (
              <ActionButton
                ready={!locked}
                busy={busy === "remove-2fa"}
                variant="ghost"
                onClick={removeTwoFactor}
              >
                Turn off
              </ActionButton>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Password"
        icon={<Lock className="size-5" />}
        status={data.password.set ? <On>Set</On> : <Off>Not set</Off>}
      >
        <p className="text-sm text-muted">
          Sign in from any authorised phone or computer, even without a passkey on it. Two-factor is always
          required with it.
        </p>
        {data.password.set_at && (
          <p className="mt-2 text-sm text-subtle">
            Last changed <LocalTime iso={data.password.set_at} />
          </p>
        )}
        {data.two_factor.enabled ? (
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void savePassword();
            }}
          >
            <PasswordField
              id={`${uid}-password`}
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              describedBy={`${uid}-password-hint`}
              invalid={Boolean(fieldError) && !setup}
            />
            <PasswordField
              id={`${uid}-repeat`}
              label="Repeat new password"
              value={repeat}
              onChange={setRepeat}
              autoComplete="new-password"
            />
            <p id={`${uid}-password-hint`} className="text-sm text-subtle sm:col-span-2">
              At least 12 characters. A short phrase is easiest to remember.
            </p>
            {fieldError && !setup && <p className="text-sm text-danger sm:col-span-2">{fieldError}</p>}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <ActionButton
                type="submit"
                ready={!locked && Boolean(password && repeat)}
                busy={busy === "password"}
              >
                {data.password.set ? "Change password" : "Create password"}
              </ActionButton>
              {data.password.set && data.passkeys.length > 0 && (
                <ActionButton
                  ready={!locked}
                  busy={busy === "remove-password"}
                  variant="ghost"
                  onClick={removePassword}
                >
                  Remove password
                </ActionButton>
              )}
            </div>
          </form>
        ) : (
          <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-muted">
            Set up two-factor first: a password alone can&apos;t open the Studio.
          </p>
        )}
      </Section>

      <Section
        title="Passkeys"
        icon={<Fingerprint className="size-5" />}
        status={<Off>{data.passkeys.length === 1 ? "1 passkey" : `${data.passkeys.length} passkeys`}</Off>}
      >
        <p className="text-sm text-muted">Your fingerprint, face or screen lock on a device you trust.</p>
        {data.passkeys.length > 0 && (
          <ul className="mt-4 divide-y divide-line">
            {data.passkeys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-text">{key.label}</p>
                  <p className="text-xs text-subtle">
                    Added <LocalTime iso={key.created_at} />
                    {key.last_used_at && (
                      <>
                        {" · last used "}
                        <LocalTime iso={key.last_used_at} />
                      </>
                    )}
                  </p>
                </div>
                <ActionButton
                  ready={!locked && !onlyPasskey}
                  busy={busy === `passkey-${key.id}`}
                  variant="ghost"
                  hint={onlyPasskey ? "Your only way in" : undefined}
                  aria-label={`Remove passkey ${key.label}`}
                  onClick={() => removePasskey(key.id, key.label)}
                >
                  Remove
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void addPasskey();
          }}
        >
          <div className="min-w-56 flex-1">
            <label htmlFor={`${uid}-label`} className="block text-sm font-medium text-text">
              Name this device
            </label>
            <input
              id={`${uid}-label`}
              value={label}
              maxLength={60}
              placeholder="Work laptop"
              onChange={(e) => setLabel(e.target.value)}
              className={inputClass}
            />
          </div>
          <ActionButton type="submit" ready={!locked} busy={busy === "add-passkey"} variant="secondary">
            Register this device
          </ActionButton>
        </form>
      </Section>

      <Section title="Active sessions and devices" icon={<LaptopMinimal className="size-5" />}>
        <ul className="divide-y divide-line">
          {data.sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium text-text">
                  {describeDevice(s.user_agent)}
                  {s.current && (
                    <span className="ms-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-strong">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-xs text-subtle">
                  Signed in with {METHODS[s.method] ?? s.method} · <LocalTime iso={s.created_at} />
                  {" · last active "}
                  <LocalTime iso={s.last_seen_at} />
                </p>
              </div>
              {!s.current && (
                <ActionButton
                  ready
                  busy={busy === `session-${s.id}`}
                  variant="secondary"
                  aria-label={`Sign out ${describeDevice(s.user_agent)}`}
                  onClick={() => revoke(s.id)}
                >
                  Sign out
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
        {others.length > 0 && (
          <div className="mt-4">
            <ActionButton ready busy={busy === "others"} variant="secondary" onClick={revokeOthers}>
              Sign out all other devices
            </ActionButton>
          </div>
        )}
      </Section>

      <Section title="Security activity" icon={<History className="size-5" />}>
        {data.activity.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <ol className="divide-y divide-line" data-testid="security-activity">
            {data.activity.map((a) => {
              const method = typeof a.detail.method === "string" ? METHODS[a.detail.method] : undefined;
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5"
                >
                  <span className="text-sm text-text">
                    {ACTIVITY[a.action] ?? a.action.replace(/^admin\./, "").replace(/_/g, " ")}
                    {method && <span className="text-muted"> · {method}</span>}
                  </span>
                  <span className="text-xs text-subtle">
                    <LocalTime iso={a.created_at} />
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </div>
  );
}
