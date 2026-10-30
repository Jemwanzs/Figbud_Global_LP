import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { type SeoReport, SeoWorkspace } from "@/components/admin/seo-workspace";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "SEO & search visibility" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function SeoPage({ params }: PageProps<"/admin/sites/[slug]/seo">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Seo params={params} />
    </Suspense>
  );
}

async function Seo({ params }: Pick<PageProps<"/admin/sites/[slug]/seo">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const { status, data } = await adminGet<SeoReport>(`sites/${slug}/seo`);
  if (status === 404) notFound();
  if (!data) return <AdminUnavailable />;
  return (
    <AdminShell user={user} active="/admin/seo">
      <p className="text-sm text-subtle">
        <Link href="/admin/seo" className="hover:text-text">
          SEO
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}`} className="hover:text-text">
          {data.site.name}
        </Link>
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">
        {data.site.name}: SEO & search visibility
      </h1>
      <p className="mt-2 max-w-3xl text-muted">
        This website&apos;s own search identity and a health check of its published pages. Page titles,
        descriptions, sharing images and indexing are set on each page (Pages → a page → Search); changes
        there go through the usual approval.
      </p>
      <div className="mt-8">
        <SeoWorkspace report={data} />
      </div>
    </AdminShell>
  );
}
