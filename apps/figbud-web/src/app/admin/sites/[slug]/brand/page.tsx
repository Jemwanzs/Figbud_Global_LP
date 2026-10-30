import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { BrandStudio } from "@/components/admin/brand-studio";
import type { BrandStudioData } from "@/components/admin/brand-types";
import type { AdminSite } from "@/components/admin/site-labels";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { forSite } from "@/lib/admin-client";

export const metadata: Metadata = { title: "Branding" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function BrandPage({ params }: PageProps<"/admin/sites/[slug]/brand">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Brand params={params} />
    </Suspense>
  );
}

async function Brand({ params }: Pick<PageProps<"/admin/sites/[slug]/brand">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const [site, brand] = await Promise.all([
    adminGet<{ site: AdminSite }>(`sites/${slug}`),
    adminGet<BrandStudioData>(`sites/${slug}/brand`),
  ]);
  if (site.status === 404) notFound();
  if (!site.data || !brand.data) return <AdminUnavailable />;
  const { name, tagline } = site.data.site;

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
        / Branding
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text">{name} branding</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Logos, colours and icons for this website. Its header, footer, product cards and icons use the
        published version; changes here stay in the draft until they are approved.
      </p>
      <div className="mt-6">
        <BrandStudio
          slug={slug}
          siteName={name}
          tagline={tagline}
          user={forSite(user, slug)}
          initial={brand.data}
        />
      </div>
    </AdminShell>
  );
}
