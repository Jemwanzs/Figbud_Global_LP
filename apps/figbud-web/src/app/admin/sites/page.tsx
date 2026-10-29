import { buttonClasses } from "@figbud/ui";
import { ArrowUpRight, FileStack, Globe, Palette, Plus, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import {
  type AdminSite,
  SiteMark,
  SiteStatusPill,
  categoryLabel,
  hasPublishedLogo,
  statusLabel,
} from "@/components/admin/site-labels";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { websiteOrigin } from "@/lib/site";

export const metadata: Metadata = { title: "Websites" };

export default function SitesPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Sites />
    </Suspense>
  );
}

/** Where the website can be opened: its custom domain, else the URL it is served at today. */
function destination(site: AdminSite): { url: string; kind: "custom" | "railway" | "website" } | null {
  if (site.primary_domain) return { url: `https://${site.primary_domain}`, kind: "custom" };
  const origin = websiteOrigin(site.slug);
  if (!origin) return null;
  return { url: origin, kind: origin.includes(".up.railway.app") ? "railway" : "website" };
}

const host = (url: string) => url.replace(/^https?:\/\//, "");

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
        <ul className="mt-8 grid gap-5 md:grid-cols-2" aria-label="Websites">
          {sites.map((site) => {
            const target = destination(site);
            return (
              <li key={site.id}>
                <article
                  aria-labelledby={`site-${site.id}`}
                  className="relative flex h-full flex-col rounded-[var(--radius-panel)] border border-line bg-surface p-6 transition-colors focus-within:border-line-strong hover:border-line-strong"
                >
                  <div className="flex items-start gap-4">
                    <SiteMark slug={site.slug} name={site.name} brand={site.brand} />
                    <div className="min-w-0 flex-1">
                      <h2 id={`site-${site.id}`} className="truncate text-lg font-semibold text-text">
                        {/* The whole card opens the website's settings. */}
                        <Link
                          href={`/admin/sites/${site.slug}`}
                          className="rounded-sm after:absolute after:inset-0 after:rounded-[var(--radius-panel)]"
                        >
                          {site.name}
                        </Link>
                      </h2>
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

                  <dl className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-subtle">Custom domain</dt>
                      <dd className="mt-0.5 text-text">{site.primary_domain ?? "No custom domain"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-subtle">Website</dt>
                      <dd className="mt-0.5 truncate text-text">
                        {target
                          ? `${host(target.url)}${target.kind === "railway" ? " (Railway URL)" : ""}`
                          : "No website destination yet"}
                      </dd>
                    </div>
                  </dl>
                  {site.workspace && (
                    <dl
                      aria-label={`${site.name} workspace`}
                      className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-4 text-sm"
                    >
                      {site.kind === "product" && (
                        <>
                          <div className="flex items-baseline gap-1.5">
                            <dt className="text-subtle">Live pages</dt>
                            <dd className="font-medium text-text">
                              {site.workspace.live_pages} of {site.workspace.pages}
                            </dd>
                          </div>
                          <div className="flex items-baseline gap-1.5">
                            <dt className="text-subtle">Sections</dt>
                            <dd className="font-medium text-text">{site.workspace.sections}</dd>
                          </div>
                        </>
                      )}
                      <div className="flex items-baseline gap-1.5">
                        <dt className="text-subtle">Awaiting approval</dt>
                        <dd
                          className={
                            site.workspace.pending > 0 ? "font-medium text-warning" : "font-medium text-text"
                          }
                        >
                          {site.workspace.pending}
                        </dd>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <dt className="text-subtle">Last published</dt>
                        <dd className="font-medium text-text">
                          {site.workspace.last_published
                            ? new Date(site.workspace.last_published).toUTCString().slice(5, 16)
                            : "Never"}
                        </dd>
                      </div>
                    </dl>
                  )}
                  {(!hasPublishedLogo(site.brand) || site.pending_to_status) && (
                    <p className="mt-3 flex flex-wrap gap-2 text-xs">
                      {!hasPublishedLogo(site.brand) && (
                        <span className="rounded-full border border-line px-2 py-0.5 text-subtle">
                          Temporary icon · no approved logo yet
                        </span>
                      )}
                      {site.pending_to_status && (
                        <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-warning">
                          Pending: {statusLabel(site.pending_to_status)}
                        </span>
                      )}
                    </p>
                  )}

                  <div className="relative z-10 mt-auto flex flex-wrap gap-2 pt-5">
                    <Link
                      href={`/admin/sites/${site.slug}`}
                      className={buttonClasses("secondary", "md", "px-4")}
                    >
                      <Settings2 aria-hidden className="size-4" />
                      Manage<span className="sr-only"> {site.name}</span>
                    </Link>
                    <Link
                      href={`/admin/sites/${site.slug}/brand`}
                      className={buttonClasses("ghost", "md", "px-4")}
                    >
                      <Palette aria-hidden className="size-4" />
                      Branding<span className="sr-only"> for {site.name}</span>
                    </Link>
                    <Link
                      href={`/admin/sites/${site.slug}/pages`}
                      className={buttonClasses("ghost", "md", "px-4")}
                    >
                      <FileStack aria-hidden className="size-4" />
                      Pages<span className="sr-only"> of {site.name}</span>
                    </Link>
                    {target && (
                      <a
                        href={target.url}
                        target="_blank"
                        rel="noopener"
                        className={buttonClasses("ghost", "md", "px-4")}
                      >
                        <Globe aria-hidden className="size-4" />
                        Open website<span className="sr-only"> {site.name} (opens in a new tab)</span>
                        <ArrowUpRight aria-hidden className="size-3.5" />
                      </a>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
