import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { MarketingTabs } from "@/components/admin/marketing-tabs";
import { ProofOverview } from "@/components/admin/proof-overview";
import { KIND_LABELS, type ProofList, isKind } from "@/components/admin/proof-types";
import type { AdminSite } from "@/components/admin/site-labels";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Content & Marketing" };

export default function ProofPage({ searchParams }: PageProps<"/admin/proof">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Proof searchParams={searchParams} />
    </Suspense>
  );
}

async function Proof({ searchParams }: Pick<PageProps<"/admin/proof">, "searchParams">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { kind: raw } = await searchParams;
  const kind = isKind(raw) ? raw : "organization";
  const [{ data }, { data: sites }] = await Promise.all([
    adminGet<ProofList>("proof"),
    adminGet<AdminSite[]>("sites"),
  ]);
  if (!data) return <AdminUnavailable />;
  const siteNames = Object.fromEntries((sites ?? []).map((s) => [s.slug, s.name]));
  return (
    <AdminShell user={user} active="/admin/marketing">
      <p className="text-sm text-subtle">Content & Marketing</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text">
        {KIND_LABELS[kind].plural}
      </h1>
      <MarketingTabs active={kind} />
      <div className="mt-8">
        <ProofOverview kind={kind} data={data} siteNames={siteNames} />
      </div>
    </AdminShell>
  );
}
