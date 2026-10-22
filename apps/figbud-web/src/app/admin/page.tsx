import { FigBudWordmark } from "@figbud/ui";
import { FileText, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { AuthCard } from "@/components/admin/auth-card";
import { InviteAdminForm } from "@/components/admin/invite-admin-form";
import { SignOutButton } from "@/components/admin/sign-out-button";
import type { AdminUser } from "@/lib/admin-client";
import { adminGet, currentAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Overview" };

interface AuditEntry {
  id: string;
  action: string;
  actor_email?: string;
  detail: Record<string, unknown>;
  created_at: string;
}

const ACTIONS: Record<string, string> = {
  "admin.login": "Signed in",
  "admin.logout": "Signed out",
  "admin.login_failed": "Failed sign-in",
  "admin.user_created": "Joined with a passkey",
  "admin.passkey_added": "Added a passkey",
  "admin.invite_created": "Created an invite",
};

const ROLE_LABELS: Record<AdminUser["role"], string> = {
  owner: "Owner",
  reviewer: "Reviewer",
  editor: "Editor",
  viewer: "Viewer",
};

export default function AdminHomePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Dashboard />
    </Suspense>
  );
}

/** Reads the session cookie, so it renders per request inside the boundary above. */
async function Dashboard() {
  const user = await currentAdmin();
  if (user === null) redirect("/admin/login");
  if (user === "unavailable") {
    return (
      <AuthCard
        title="Admin is temporarily unavailable"
        lead="We couldn't reach the admin service. Please try again in a moment."
      >
        <Link href="/admin" className="font-medium text-accent hover:underline">
          Try again
        </Link>
      </AuthCard>
    );
  }
  const audit = user.role === "owner" ? (await adminGet<AuditEntry[]>("audit")).data : undefined;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <FigBudWordmark />
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-subtle">Admin</span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text sm:text-4xl">
          Welcome, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-2 text-muted">
          Signed in as {user.email} · {ROLE_LABELS[user.role]}
        </p>

        <section aria-labelledby="workspaces" className="mt-10">
          <h2 id="workspaces" className="sr-only">
            Workspaces
          </h2>
          <div className="grid gap-5 md:grid-cols-2">
            <Workspace
              icon={<FileText aria-hidden className="size-5" />}
              title="Insights"
              body="Write, review and schedule Blog & Insights articles. The editor and approval flow arrive next; published articles already appear on the site."
            />
            <Workspace
              icon={<Inbox aria-hidden className="size-5" />}
              title="Enquiries"
              body="Every demo request, waitlist sign-up and enquiry is stored safely. The inbox to review and follow them up arrives next."
            />
          </div>
        </section>

        {user.role === "owner" && (
          <div className="mt-10 grid gap-5 lg:grid-cols-5">
            <section
              aria-labelledby="team"
              className="fb-panel rounded-[var(--radius-panel)] p-6 sm:p-8 lg:col-span-3"
            >
              <h2 id="team" className="text-lg font-semibold text-text">
                Invite an admin
              </h2>
              <p className="mt-1 mb-6 text-sm text-muted">
                Invitees create a passkey on their own device. Re-inviting an existing admin adds a passkey
                for a new device.
              </p>
              <InviteAdminForm />
            </section>
            <section
              aria-labelledby="activity"
              className="fb-panel rounded-[var(--radius-panel)] p-6 sm:p-8 lg:col-span-2"
            >
              <h2 id="activity" className="text-lg font-semibold text-text">
                Recent activity
              </h2>
              {audit && audit.length > 0 ? (
                <ol className="mt-4 divide-y divide-line">
                  {audit.slice(0, 12).map((entry) => (
                    <li key={entry.id} className="py-3 text-sm">
                      <p className="text-text">{ACTIONS[entry.action] ?? entry.action}</p>
                      <p className="mt-0.5 text-subtle">
                        {entry.actor_email ?? "System"} ·{" "}
                        <time dateTime={entry.created_at}>
                          {new Date(entry.created_at).toUTCString().slice(5, 22)} UTC
                        </time>
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-4 text-sm text-muted">No activity yet.</p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function Workspace({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <article className="rounded-[var(--radius-panel)] border border-line bg-surface p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
          {icon}
        </span>
        <h3 className="text-lg font-semibold text-text">{title}</h3>
        <span className="ms-auto rounded-full border border-line px-2.5 py-0.5 text-xs text-subtle">
          Coming next
        </span>
      </div>
      <p className="mt-4 leading-relaxed text-muted">{body}</p>
    </article>
  );
}
