import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { PlatformsSettingsForm } from "@/components/admin/platforms-settings";
import type { AdminSite } from "@/components/admin/site-labels";
import type { WebsiteSettingsAdmin } from "@/components/admin/website-settings";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { getPublicProducts } from "@/lib/products";

export const metadata: Metadata = { title: "Our Platforms" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function PlatformsPage({ params }: PageProps<"/admin/sites/[slug]/platforms">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Platforms params={params} />
    </Suspense>
  );
}

async function Platforms({ params }: Pick<PageProps<"/admin/sites/[slug]/platforms">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const [site, settings, products] = await Promise.all([
    adminGet<{ site: AdminSite }>(`sites/${slug}`),
    adminGet<WebsiteSettingsAdmin>(`sites/${slug}/settings`),
    getPublicProducts(),
  ]);
  if (site.status === 404 || settings.status === 404) notFound();
  if (!site.data || !settings.data) return <AdminUnavailable />;
  // Our Platforms is the corporate home page's product showcase.
  if (!settings.data.corporate) notFound();
  const { name } = site.data.site;

  return (
    <>
      <p className="text-sm text-subtle">
        <Link href="/admin/sites" className="hover:text-text">
          Websites
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}`} className="hover:text-text">
          {name}
        </Link>{" "}
        / Our Platforms
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">Our Platforms</h1>
      <p className="mt-2 max-w-3xl text-muted">
        How the home page&apos;s product showcase moves. Changes apply directly (no approval round), are
        recorded in the activity log, and show on the home page at once. The cards themselves come from the
        product registry and each product&apos;s branding.
      </p>
      <section
        aria-label="Our Platforms settings"
        className="fb-panel mt-8 max-w-4xl rounded-[var(--radius-panel)] p-6 sm:p-8"
      >
        <PlatformsSettingsForm
          slug={slug}
          data={settings.data}
          products={products.map((p) => ({ slug: p.slug, name: p.name }))}
        />
      </section>
    </>
  );
}
