import { buttonClasses, cn } from "@figbud/ui";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ActivityChanges } from "@/components/admin/activity-changes";
import { AdminUnavailable } from "@/components/admin/admin-shell";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { describeAction } from "@/components/admin/audit-labels";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Activity" };

interface Entry {
  id: string;
  action: string;
  actor_email?: string | null;
  site_name?: string | null;
  has_changes?: boolean;
  created_at: string;
}

export default function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Activity searchParams={searchParams} />
    </Suspense>
  );
}

async function Activity({ searchParams }: Pick<PageProps<"/admin/activity">, "searchParams">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  if (user.role !== "owner") {
    return (
      <>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Activity</h1>
        <p className="mt-2 text-muted">Only owners can see the activity log.</p>
      </>
    );
  }
  const query = await searchParams;
  const site = typeof query.site === "string" ? query.site.slice(0, 60) : null;
  const before = typeof query.before === "string" ? query.before.slice(0, 40) : null;
  const params = new URLSearchParams();
  if (site) params.set("site", site);
  if (before) params.set("before", before);
  const [log, sites] = await Promise.all([
    adminGet<Entry[]>(`audit${params.size ? `?${params}` : ""}`),
    adminGet<{ slug: string; name: string; archived_at?: string | null }[]>("sites"),
  ]);
  if (!log.data) return <AdminUnavailable />;
  const entries = log.data;
  const last = entries.at(-1);
  const older = new URLSearchParams();
  if (site) older.set("site", site);
  if (last) older.set("before", last.created_at);

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-text sm:text-4xl">Activity</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Who did what, newest first. To undo a change, restore an earlier version on that item&apos;s own
        screen.
      </p>

      <nav aria-label="Filter by website" className="mt-6 flex flex-wrap gap-2">
        {[
          { slug: null as string | null, name: "All activity" },
          ...(sites.data ?? []).filter((s) => !s.archived_at),
        ].map((option) => (
          <Link
            key={option.slug ?? "all"}
            href={option.slug ? `/admin/activity?site=${encodeURIComponent(option.slug)}` : "/admin/activity"}
            aria-current={site === option.slug ? "true" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors",
              site === option.slug
                ? "border-accent bg-accent-soft font-medium text-text"
                : "border-line text-muted hover:border-line-strong hover:text-text",
            )}
          >
            {option.name}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <p className="mt-8 text-muted">No activity here yet.</p>
      ) : (
        <ol className="fb-panel mt-6 divide-y divide-line rounded-[var(--radius-panel)] px-5 sm:px-6">
          {entries.map((entry) => (
            <li key={entry.id} className="py-4 text-sm">
              <p className="text-text">
                {describeAction(entry.action)}
                {entry.site_name && <span className="text-muted"> · {entry.site_name}</span>}
              </p>
              <p className="mt-0.5 break-words text-subtle">
                {entry.actor_email ?? "System"} ·{" "}
                <time dateTime={entry.created_at}>
                  {new Date(entry.created_at).toUTCString().slice(5, 22)} UTC
                </time>
              </p>
              {entry.has_changes && <ActivityChanges id={entry.id} />}
            </li>
          ))}
        </ol>
      )}

      {entries.length === 200 && last && (
        <Link href={`/admin/activity?${older}`} className={buttonClasses("secondary", "md", "mt-6")}>
          Older activity
          <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
        </Link>
      )}
    </>
  );
}
