import { ArrowRight, Cookie, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Settings</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Your account, and settings that apply to every FigBud website.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        <li>
          <Link
            href="/admin/settings/security"
            className="group flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong"
          >
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"
            >
              <ShieldCheck className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold text-text">
                Security & Authentication
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-sm text-muted">
                Your password, passkeys, two-factor and recovery codes, the devices you&apos;re signed in on
                and your security activity.
              </span>
            </span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/settings/privacy"
            className="group flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong"
          >
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"
            >
              <Cookie className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold text-text">
                Privacy & Cookies
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-sm text-muted">
                Cookie banner, categories, retention, policy links, analytics and marketing integrations,
                consent report.
              </span>
            </span>
          </Link>
        </li>
        {user.role === "owner" && (
          <li>
            <Link
              href="/admin/settings/team"
              className="group flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong"
            >
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"
              >
                <Users className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold text-text">
                  Users & access
                  <ArrowRight
                    aria-hidden
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
                <span className="mt-1 block text-sm text-muted">
                  Everyone in the Studio, their roles, and which websites each person works on.
                </span>
              </span>
            </Link>
          </li>
        )}
      </ul>
    </>
  );
}
