import { ArrowRight, FileText, Globe, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
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

const ACTIONS: Record<string, string> = {
  "admin.login": "Signed in",
  "admin.logout": "Signed out",
  "admin.login_failed": "Failed sign-in",
  "admin.user_created": "Joined with a passkey",
  "admin.passkey_added": "Added a passkey",
  "admin.invite_created": "Created an invite",
  "cms.article_created": "Started an article",
  "cms.article_updated": "Saved an article",
  "cms.article_submitted": "Submitted an article for review",
  "cms.article_published": "Published an article",
  "cms.article_archived": "Archived an article",
  "cms.article_restored": "Restored an article",
  "cms.category_created": "Added a topic",
  "cms.author_created": "Added an author",
  "enquiry.status_changed": "Updated an enquiry",
  "enquiry.exported": "Exported enquiries",
  "site.created": "Created a website",
  "site.updated": "Updated website settings",
  "site.archived": "Archived a website",
  "site.restored": "Restored a website",
  "site.status_requested": "Requested a website status change",
  "site.status_approved": "Approved a website status change",
  "site.status_rejected": "Rejected a website status change",
  "site.status_cancelled": "Cancelled a website status change",
  "brand.seeded": "Installed the official brand",
  "brand.icons_seeded": "Generated website icons",
  "brand.ziwa_identity_seeded": "Published the approved Ziwa LMS identity",
  "brand.ziwa_final_identity_seeded": "Published the final Ziwa LMS identity (orange, yellow and brown)",
  "brand.draft_saved": "Saved a brand draft",
  "site.settings_updated": "Changed a website's navigation or footer",
  "site.enquiries_closed": "Stopped taking enquiries for a website",
  "site.enquiries_opened": "Started taking enquiries for a website again",
  "privacy.updated": "Changed privacy and cookie settings",
  "media.uploaded": "Uploaded an image",
  "media.updated": "Changed an image's name or alt text",
  "media.archived": "Archived an image",
  "media.restored": "Restored an image",
  "brand.submitted": "Submitted a brand for approval",
  "brand.published": "Published a brand",
  "brand.rejected": "Sent a brand back for changes",
  "brand.cancelled": "Withdrew a brand change",
  "brand.version_restored": "Restored a brand version",
  "brand.asset_uploaded": "Uploaded a brand asset",
  "brand.asset_archived": "Archived a brand asset",
  "brand.asset_restored": "Restored a brand asset",
  "page.created": "Created a page",
  "page.draft_saved": "Saved a page draft",
  "page.duplicated": "Duplicated a page",
  "page.reordered": "Reordered pages",
  "page.submitted": "Submitted a page for approval",
  "page.published": "Published a page",
  "page.rejected": "Sent a page back for changes",
  "page.cancelled": "Withdrew a page change",
  "page.archived": "Archived a page",
  "page.restored": "Restored a page",
  "page.version_restored": "Restored a page version",
};

/** A readable label for any action, including ones added after this list. */
function describeAction(action: string) {
  if (ACTIONS[action]) return ACTIONS[action];
  const words = action.replace(/[._]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
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
  const [articles, audit, enquiries, sites] = await Promise.all([
    adminGet<{ status: string }[]>("cms/articles"),
    user.role === "owner" ? adminGet<AuditEntry[]>("audit") : Promise.resolve({ data: undefined }),
    adminGet<{ total: number }>("enquiries?status=new"),
    adminGet<{ status: string; archived_at?: string | null; pending_to_status?: string | null }[]>("sites"),
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
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
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
            <InviteAdminForm />
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
