import { buttonClasses } from "@figbud/ui";
import { FileStack, Images, Palette, PanelsTopLeft, SearchCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { SiteForm } from "@/components/admin/site-form";
import { type AdminSite, SiteMark, SiteStatusPill, categoryLabel } from "@/components/admin/site-labels";
import { SiteLifecycle, type StatusRequest } from "@/components/admin/site-lifecycle";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { forSite } from "@/lib/admin-client";

export const metadata: Metadata = { title: "Website" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function SitePage({ params }: PageProps<"/admin/sites/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Site params={params} />
    </Suspense>
  );
}

async function Site({ params }: Pick<PageProps<"/admin/sites/[slug]">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const { status, data } = await adminGet<{ site: AdminSite; status_requests: StatusRequest[] }>(
    `sites/${slug}`,
  );
  if (status === 404) notFound();
  if (!data) return <AdminUnavailable />;
  const { site } = data;

  return (
    <AdminShell user={user} active="/admin/sites">
      <p className="text-sm text-subtle">
        <Link href="/admin/sites" className="hover:text-text">
          Websites
        </Link>{" "}
        / <span className="font-mono">{site.slug}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <SiteMark slug={site.slug} name={site.name} brand={site.brand} />
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text">{site.name}</h1>
        {site.archived_at ? (
          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-subtle">Archived</span>
        ) : (
          <SiteStatusPill status={site.status} />
        )}
        <Link
          href={`/admin/sites/${site.slug}/brand`}
          className={buttonClasses("secondary", "md", "sm:ms-auto")}
        >
          <Palette aria-hidden className="size-4" />
          Branding
        </Link>
        <Link href={`/admin/sites/${site.slug}/pages`} className={buttonClasses("secondary", "md")}>
          <FileStack aria-hidden className="size-4" />
          Pages
        </Link>
        <Link href={`/admin/sites/${site.slug}/media`} className={buttonClasses("secondary", "md")}>
          <Images aria-hidden className="size-4" />
          Media
        </Link>
        <Link href={`/admin/sites/${site.slug}/website`} className={buttonClasses("secondary", "md")}>
          <PanelsTopLeft aria-hidden className="size-4" />
          Navigation & forms
        </Link>
        <Link href={`/admin/sites/${site.slug}/seo`} className={buttonClasses("secondary", "md")}>
          <SearchCheck aria-hidden className="size-4" />
          SEO
        </Link>
      </div>
      <p className="mt-2 text-muted">
        {categoryLabel(site.category)}
        {site.primary_domain && ` · ${site.primary_domain}`}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="settings" className="fb-panel rounded-[var(--radius-panel)] p-6">
          <h2 id="settings" className="sr-only">
            Settings
          </h2>
          <SiteForm site={site} canEdit={user.role === "owner" && !site.archived_at} />
        </section>
        <aside aria-labelledby="lifecycle" className="fb-panel h-fit rounded-[var(--radius-panel)] p-6">
          <h2 id="lifecycle" className="font-semibold text-text">
            Marketing status
          </h2>
          <SiteLifecycle site={site} requests={data.status_requests} user={forSite(user, slug)} />
        </aside>
      </div>
    </AdminShell>
  );
}
