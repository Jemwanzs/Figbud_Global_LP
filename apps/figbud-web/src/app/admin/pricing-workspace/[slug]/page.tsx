import type { ProductSlug } from "@figbud/brand";
import { ProductIdentity } from "@figbud/site-kit";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { PricingCalculator } from "@/components/admin/pricing/pricing-calculator";
import type { PricingAdmin } from "@/components/admin/pricing/pricing-types";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { getBrands } from "@/lib/products";

export const metadata: Metadata = { title: "Pricing calculator" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

/**
 * The calculator on its own (opened in a new tab from the Pricing Studio):
 * no Studio navigation, the product's branding, signed-in access only.
 */
export default function WorkspacePage({ params }: PageProps<"/admin/pricing-workspace/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Workspace params={params} />
    </Suspense>
  );
}

async function Workspace({ params }: Pick<PageProps<"/admin/pricing-workspace/[slug]">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const { status, data } = await adminGet<PricingAdmin>(`sites/${slug}/pricing`);
  if (status === 404) notFound();
  if (!data) return <AdminUnavailable />;
  const brands = await getBrands();
  const published = data.published;
  return (
    <div data-product={slug} className="min-h-dvh bg-bg">
      <header className="border-b border-line print:hidden">
        <div className="mx-auto flex max-w-[96rem] flex-wrap items-center gap-4 px-5 py-4 sm:px-8">
          <ProductIdentity slug={slug as ProductSlug} brand={brands[slug] ?? null} name={data.site.name} />
          <span className="text-sm text-subtle">Pricing calculator</span>
          <span className="ms-auto rounded-full border border-line px-3 py-1 text-xs text-muted">
            {published
              ? `Published prices · version ${data.published_number}`
              : "Draft prices · not published"}
          </span>
          <Link href={`/admin/sites/${slug}/pricing`} className="text-sm text-muted hover:text-text">
            Back to the Studio
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[96rem] px-5 py-8 sm:px-8">
        <h1 className="sr-only">{`${data.site.name} pricing calculator`}</h1>
        <PricingCalculator
          slug={slug}
          book={published ?? data.draft}
          source={published ? "published" : "draft"}
          canQuote={Boolean(published) && data.can_edit}
        />
      </main>
    </div>
  );
}
