import type { ProductSlug } from "@figbud/brand";
import { ProductIdentity } from "@figbud/site-kit";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import type { QuoteDetail } from "@/components/admin/pricing/pricing-types";
import { QuotePanel } from "@/components/admin/pricing/quote-panel";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { getBrands } from "@/lib/products";

export const metadata: Metadata = { title: "Quotation" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function QuotePage({ params }: PageProps<"/admin/pricing/quotes/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Quote params={params} />
    </Suspense>
  );
}

async function Quote({ params }: Pick<PageProps<"/admin/pricing/quotes/[id]">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { status, data } = await adminGet<QuoteDetail>(`pricing/quotes/${id}`);
  if (status === 404) notFound();
  if (!data) return <AdminUnavailable />;
  const brands = await getBrands();
  return (
    <AdminShell user={user} active="/admin/sites">
      <p className="text-sm text-subtle print:hidden">
        <Link href={`/admin/sites/${data.site.slug}/pricing?tab=quotes`} className="hover:text-text">
          {`${data.site.name} · Quotes`}
        </Link>{" "}
        / {data.reference}
      </p>
      <div className="mt-6">
        <QuotePanel
          initial={data}
          isOwner={user.role === "owner"}
          brand={
            <ProductIdentity
              slug={data.site.slug as ProductSlug}
              brand={brands[data.site.slug] ?? null}
              name={data.site.name}
            />
          }
        />
      </div>
    </AdminShell>
  );
}
