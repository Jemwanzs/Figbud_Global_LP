import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { PricingStudio } from "@/components/admin/pricing/pricing-studio";
import type { PricingAdmin, QuoteSummary } from "@/components/admin/pricing/pricing-types";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Pricing Studio" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function PricingPage({ params }: PageProps<"/admin/sites/[slug]/pricing">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Pricing params={params} />
    </Suspense>
  );
}

async function Pricing({ params }: Pick<PageProps<"/admin/sites/[slug]/pricing">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const [{ status, data }, quotes] = await Promise.all([
    adminGet<PricingAdmin>(`sites/${slug}/pricing`),
    adminGet<{ quotes: QuoteSummary[] }>(`sites/${slug}/pricing/quotes`),
  ]);
  if (status === 404) notFound();
  if (!data) return <AdminUnavailable />;
  return (
    <AdminShell user={user} active="/admin/sites">
      <p className="text-sm text-subtle">
        <Link href="/admin/sites" className="hover:text-text">
          Websites
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}`} className="hover:text-text">
          {data.site.name}
        </Link>
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">
        {data.site.name}: Pricing Studio
      </h1>
      <p className="mt-2 max-w-3xl text-muted">
        Modules, plans, billing cycles, implementation charges, the calculator and quotations. Prices
        calculate here and in quotations once published; the website shows prices only when you switch that
        on.
      </p>
      <div className="mt-8">
        <PricingStudio data={data} quotes={quotes.data?.quotes ?? []} isOwner={user.role === "owner"} />
      </div>
    </AdminShell>
  );
}
