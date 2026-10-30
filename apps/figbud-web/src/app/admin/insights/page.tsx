import { buttonClasses, cn } from "@figbud/ui";
import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { ArticleStatus, type Status } from "@/components/admin/article-status";
import { forSite, hasRole } from "@/lib/admin-client";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Insights" };

interface Row {
  id: string;
  slug: string;
  locale: string;
  title: string;
  status: Status;
  version: number;
  published_at?: string;
  updated_at: string;
  category?: string;
  last_edited_by?: string;
  scheduled: boolean;
}

const TABS: { value?: Status; label: string }[] = [
  { label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "in_review", label: "In review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export default function InsightsPage({ searchParams }: PageProps<"/admin/insights">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Insights searchParams={searchParams} />
    </Suspense>
  );
}

async function Insights({ searchParams }: Pick<PageProps<"/admin/insights">, "searchParams">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const query = await searchParams;
  const status = TABS.find((t) => t.value && t.value === query.status)?.value;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const { data: rows } = await adminGet<Row[]>(`cms/articles${params.size ? `?${params}` : ""}`);
  const href = (next?: Status) => {
    const p = new URLSearchParams();
    if (next) p.set("status", next);
    if (q) p.set("q", q);
    return p.size ? `/admin/insights?${p}` : "/admin/insights";
  };

  return (
    <AdminShell user={user} active="/admin/insights">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Insights</h1>
          <p className="mt-2 text-muted">Blog & Insights articles, from first draft to published.</p>
        </div>
        {hasRole(forSite(user, "figbud"), "editor") && (
          <Link href="/admin/insights/new" className={buttonClasses("primary", "md")}>
            <Plus aria-hidden className="size-4" />
            New article
          </Link>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter by status">
          <ul className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <li key={tab.label}>
                <Link
                  href={href(tab.value)}
                  aria-current={tab.value === status ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full px-4 text-sm transition-colors",
                    tab.value === status
                      ? "bg-accent font-medium text-accent-ink"
                      : "border border-line text-muted hover:border-line-strong hover:text-text",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <form role="search" action="/admin/insights" className="relative w-full lg:max-w-xs">
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="insights-search" className="sr-only">
            Search articles by title
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-subtle"
          />
          <input
            id="insights-search"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by title"
            className="min-h-11 w-full rounded-full border border-line-strong bg-surface ps-11 pe-4 text-text placeholder:text-subtle"
          />
        </form>
      </div>

      {!rows ? (
        <p className="mt-10 text-muted">Articles could not be loaded. Please try again.</p>
      ) : rows.length === 0 ? (
        <div className="mt-10 rounded-[var(--radius-panel)] border border-dashed border-line-strong p-10 text-center">
          <p className="text-lg font-medium text-text">
            {q || status ? "No articles match" : "No articles yet"}
          </p>
          <p className="mt-2 text-muted">
            {q || status
              ? "Try another status or search."
              : "Start the first article; it stays private until a reviewer publishes it."}
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/insights/${row.id}`}
                className="flex flex-col gap-2 p-5 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-text">{row.title}</p>
                  <p className="mt-1 truncate text-sm text-subtle">
                    /{row.locale}/blog/{row.slug}
                    {row.category && ` · ${row.category}`}
                    {row.last_edited_by && ` · edited by ${row.last_edited_by}`}
                  </p>
                </div>
                <ArticleStatus status={row.status} scheduled={row.scheduled} />
                <time dateTime={row.updated_at} className="shrink-0 text-sm text-subtle">
                  {new Date(row.updated_at).toUTCString().slice(5, 16)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
