"use client";

import { cn } from "@figbud/ui";
import { useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";

import { LocalTime } from "./local-time";

interface MemberSession {
  id: string;
  user_agent: string | null;
  method: string;
  created_at: string;
  last_seen_at: string;
}

const METHODS: Record<string, string> = {
  passkey: "a passkey",
  password: "a password and two-factor",
  invite: "an invitation and a new passkey",
};

/** A readable device name from the browser's user agent: browser on system. */
function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const system = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return system ? `${browser} on ${system}` : browser;
}

/**
 * Someone's signed-in devices, for owners (P13-B4): loaded when opened,
 * each one can be signed out on its own.
 */
export function MemberSessions({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<MemberSession[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    setMessage(null);
    if (!next) return;
    try {
      setSessions((await adminFetch<{ sessions: MemberSession[] }>(`team/${id}/sessions`)).sessions);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof AdminError ? err.message : "Something went wrong." });
    }
  }

  async function end(s: MemberSession) {
    setBusy(s.id);
    setMessage(null);
    try {
      await adminFetch(`team/${id}/sessions/${s.id}/revoke`, {});
      setSessions((list) => list?.filter((x) => x.id !== s.id) ?? null);
      setMessage({ tone: "ok", text: `${device(s.user_agent)} is signed out.` });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof AdminError ? err.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="min-h-11 rounded-xl px-3 text-sm font-medium text-accent hover:bg-accent-soft/60"
      >
        {open ? "Hide devices" : "Devices and sessions"}
        <span className="sr-only"> for {name}</span>
      </button>
      {open && sessions && (
        <ul aria-label={`${name}'s sessions`} className="mt-2 grid gap-2">
          {sessions.length === 0 && <li className="px-3 text-sm text-subtle">Not signed in anywhere.</li>}
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2"
            >
              <span className="min-w-0 text-sm">
                <span className="block font-medium text-text">{device(s.user_agent)}</span>
                <span className="text-muted">
                  Signed in with {METHODS[s.method] ?? s.method} · <LocalTime iso={s.created_at} />
                  {" · last active "}
                  <LocalTime iso={s.last_seen_at} />
                </span>
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => end(s)}
                className="min-h-11 rounded-xl px-3 text-sm font-medium text-danger hover:bg-surface disabled:opacity-50"
              >
                Sign out
                <span className="sr-only">
                  {" "}
                  {name} on {device(s.user_agent)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("mt-2 text-sm", message.tone === "error" ? "text-danger" : "text-success")}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
