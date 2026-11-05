import { ArrowRight, CircleCheck, FileText, Globe, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { describeAction } from "@/components/admin/audit-labels";
import { InviteAdminForm } from "@/components/admin/invite-admin-form";
import { ROLE_LABELS } from "@/lib/admin-client";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Overview" };

interface AuditEntry {
  id: string;
  action: string;
  actor_email?: string;
  site_name?: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export default function AdminHomePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Dashboard />
    </Suspense>
  );
}

/** Reads the session cookie, so it renders per request inside the boundary above. */
async function Dashboard() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const [articles, audit, enquiries, sites, approvals] = await Promise.all([
    adminGet<{ status: string }[]>("cms/articles"),
    user.role === "owner" ? adminGet<AuditEntry[]>("audit") : Promise.resolve({ data: undefined }),
    adminGet<{ total: number }>("enquiries?status=new"),
    adminGet<
      {
        slug: string;
        name: string;
        status: string;
        archived_at?: string | null;
        pending_to_status?: string | null;
      }[]
    >("sites"),
    adminGet<{ waiting_for_you: number }>("approvals"),
  ]);
  const liveSites = sites.data?.filter(
    (s) => !s.archived_at && ["coming_soon", "beta", "active"].includes(s.status),
  );
  const pendingSites = sites.data?.filter((s) => s.pending_to_status).length;
  const newEnquiries = enquiries.data?.total;
  const count = (status: string) => articles.data?.filter((a) => a.status === status).length ?? 0;

  return (
    <AdminShell user={user} active="/admin">
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
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/admin/approvals"
            className="group rounded-[var(--radius-panel)] border border-line bg-surface p-6 transition-colors hover:border-line-strong sm:p-8"
          >
            <WorkspaceHeading icon={<CircleCheck aria-hidden className="size-5" />} title="Approvals">
              <ArrowRight
                aria-hidden
                className="ms-auto size-5 text-subtle transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
              />
            </WorkspaceHeading>
            <p className="mt-4 leading-relaxed text-muted">
              Everything waiting for a second person, across every website.
            </p>
            <p className="mt-5 text-sm">
              <span className="font-semibold text-text">{approvals.data?.waiting_for_you ?? "–"}</span>{" "}
              <span className="text-subtle">waiting for you</span>
            </p>
          </Link>
          <Link
            href="/admin/sites"
            className="group rounded-[var(--radius-panel)] border border-line bg-surface p-6 transition-colors hover:border-line-strong sm:p-8"
          >
            <WorkspaceHeading icon={<Globe aria-hidden className="size-5" />} title="Websites">
              <ArrowRight
                aria-hidden
                className="ms-auto size-5 text-subtle transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
              />
            </WorkspaceHeading>
            <p className="mt-4 leading-relaxed text-muted">
              The corporate website and every product website: settings and marketing status.
            </p>
            <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {[
                ["Listed", liveSites?.length ?? "–"],
                ["Awaiting approval", pendingSites ?? "–"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-2">
                  <dt className="text-subtle">{label}</dt>
                  <dd className="font-semibold text-text">{value}</dd>
                </div>
              ))}
            </dl>
          </Link>
          <Link
            href="/admin/insights"
            className="group rounded-[var(--radius-panel)] border border-line bg-surface p-6 transition-colors hover:border-line-strong sm:p-8"
          >
            <WorkspaceHeading icon={<FileText aria-hidden className="size-5" />} title="Insights">
              <ArrowRight
                aria-hidden
                className="ms-auto size-5 text-subtle transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
              />
            </WorkspaceHeading>
            <p className="mt-4 leading-relaxed text-muted">
              Write, review and schedule Blog & Insights articles.
            </p>
            <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {[
                ["Drafts", count("draft")],
                ["In review", count("in_review")],
                ["Published", count("published")],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-2">
                  <dt className="text-subtle">{label}</dt>
                  <dd className="font-semibold text-text">{value}</dd>
                </div>
              ))}
            </dl>
          </Link>
          <Link
            href="/admin/enquiries?status=new"
            className="group rounded-[var(--radius-panel)] border border-line bg-surface p-6 transition-colors hover:border-line-strong sm:p-8"
          >
            <WorkspaceHeading icon={<Inbox aria-hidden className="size-5" />} title="Enquiries">
              <ArrowRight
                aria-hidden
                className="ms-auto size-5 text-subtle transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
              />
            </WorkspaceHeading>
            <p className="mt-4 leading-relaxed text-muted">
              Demo requests, waitlist sign-ups and messages from the website, ready to follow up.
            </p>
            <p className="mt-5 text-sm">
              <span className="font-semibold text-text">{newEnquiries ?? "–"}</span>{" "}
              <span className="text-subtle">new, waiting for a reply</span>
            </p>
          </Link>
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
              Invitees create a passkey on their own device. Re-inviting an existing admin adds a passkey for
              a new device.
            </p>
            <InviteAdminForm
              sites={(sites.data ?? [])
                .filter((s) => !s.archived_at)
                .map((s) => ({ site: s.slug, name: s.name }))}
            />
          </section>
          <section
            aria-labelledby="activity"
            className="fb-panel rounded-[var(--radius-panel)] p-6 sm:p-8 lg:col-span-2"
          >
            <h2 id="activity" className="text-lg font-semibold text-text">
              Recent activity
            </h2>
            {audit.data && audit.data.length > 0 ? (
              <ol className="mt-4 divide-y divide-line">
                {audit.data.slice(0, 12).map((entry) => (
                  <li key={entry.id} className="py-3 text-sm">
                    <p className="text-text">
                      {describeAction(entry.action)}
                      {entry.site_name && <span className="text-muted"> · {entry.site_name}</span>}
                    </p>
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
            <Link
              href="/admin/activity"
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              All activity and changes
              <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </Link>
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function WorkspaceHeading({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-text">{title}</h3>
      {children}
    </div>
  );
}
