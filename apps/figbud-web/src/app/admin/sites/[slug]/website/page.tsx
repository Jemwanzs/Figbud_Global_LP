import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import type { AdminSite } from "@/components/admin/site-labels";
import { type WebsiteSettingsAdmin, WebsiteSettingsForm } from "@/components/admin/website-settings";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Navigation, footer & forms" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function WebsiteSettingsPage({ params }: PageProps<"/admin/sites/[slug]/website">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: Pick<PageProps<"/admin/sites/[slug]/website">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const [site, settings] = await Promise.all([
    adminGet<{ site: AdminSite }>(`sites/${slug}`),
    adminGet<WebsiteSettingsAdmin>(`sites/${slug}/settings`),
  ]);
  if (site.status === 404 || settings.status === 404) notFound();
  if (!site.data || !settings.data) return <AdminUnavailable />;
  const { name } = site.data.site;

  return (
    <AdminShell user={user} active="/admin/sites">
      <p className="text-sm text-subtle">
        <Link href="/admin/sites" className="hover:text-text">
          Websites
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}`} className="hover:text-text">
          {name}
        </Link>{" "}
        / Navigation, footer & forms
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">
        Navigation, footer & forms
      </h1>
      <p className="mt-2 max-w-3xl text-muted">
        What {name}&apos;s website shows around its pages, and whether it takes enquiries. Changes apply
        directly (no approval round), are recorded in the activity log, and reach the website within a few
        minutes.
      </p>
      <section
        aria-label="Website settings"
        className="fb-panel mt-8 max-w-4xl rounded-[var(--radius-panel)] p-6 sm:p-8"
      >
        <WebsiteSettingsForm slug={slug} name={name} data={settings.data} />
      </section>
    </AdminShell>
  );
}
