import { buttonClasses } from "@figbud/ui";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import {
  type AdminSite,
  SiteMark,
  SiteStatusPill,
  categoryLabel,
  statusLabel,
} from "@/components/admin/site-labels";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Websites" };

export default function SitesPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Sites />
    </Suspense>
  );
}

async function Sites() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { data: sites } = await adminGet<AdminSite[]>("sites");
  const live =
    sites?.filter((s) => !s.archived_at && ["coming_soon", "beta", "active"].includes(s.status)).length ?? 0;

  return (
    <AdminShell user={user} active="/admin/sites">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text">
            Websites & products
          </h1>
          <p className="mt-2 text-muted">
            The FigBud Global website and every product website, managed in one place · {live} listed publicly
          </p>
        </div>
        {user.role === "owner" && (
          <Link href="/admin/sites/new" className={buttonClasses("primary", "md")}>
            <Plus aria-hidden className="size-4" />
            New website
          </Link>
        )}
      </div>

      {!sites ? (
        <p className="mt-10 text-muted">Websites could not be loaded. Please try again.</p>
      ) : (
        <ul className="mt-8 grid gap-5 md:grid-cols-2">
          {sites.map((site) => (
            <li key={site.id}>
              <Link
                href={`/admin/sites/${site.slug}`}
                className="flex h-full flex-col rounded-[var(--radius-panel)] border border-line bg-surface p-6 transition-colors hover:border-line-strong"
              >
                <div className="flex items-start gap-4">
                  <SiteMark slug={site.slug} name={site.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold text-text">{site.name}</p>
                    <p className="text-sm text-subtle">{categoryLabel(site.category)}</p>
                  </div>
                  {site.archived_at ? (
                    <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-subtle">
                      Archived
                    </span>
                  ) : (
                    <SiteStatusPill status={site.status} />
                  )}
                </div>
                {site.tagline && <p className="mt-4 text-muted">{site.tagline}</p>}
                <p className="mt-auto pt-5 text-sm text-subtle">
                  {site.primary_domain ?? "No domain yet"}
                  {site.pending_to_status && (
                    <span className="ms-2 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs text-warning">
                      Pending: {statusLabel(site.pending_to_status)}
                    </span>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
