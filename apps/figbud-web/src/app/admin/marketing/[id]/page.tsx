import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { CampaignBuilder } from "@/components/admin/campaign-builder";
import type { CampaignDetail } from "@/components/admin/campaign-types";
import type { MediaItem } from "@/components/admin/page-types";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { getBrands } from "@/lib/products";

export const metadata: Metadata = { title: "Campaign" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function CampaignPage({ params }: PageProps<"/admin/marketing/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Campaign params={params} />
    </Suspense>
  );
}

async function Campaign({ params }: Pick<PageProps<"/admin/marketing/[id]">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { status, data } = await adminGet<CampaignDetail>(`campaigns/${id}`);
  if (status === 404) notFound();
  if (!data) return <AdminUnavailable />;
  const [media, brands] = await Promise.all([
    adminGet<{ items: MediaItem[] }>(`sites/${data.site_slug}/media`),
    getBrands(),
  ]);
  return (
    <AdminShell user={user} active="/admin/marketing">
      <p className="text-sm text-subtle">
        <Link href="/admin/marketing" className="hover:text-text">
          Campaigns & Promotions
        </Link>{" "}
        / {data.name}
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">{data.name}</h1>
      <div className="mt-8">
        {/* Keyed by decisions, so an approval, pause or archive reloads the form; saves keep it. */}
        <CampaignBuilder
          key={`${data.revisions.length}-${data.paused_at}-${data.archived_at}`}
          initial={data}
          brand={brands[data.site_slug] ?? null}
          media={media.data?.items ?? []}
          userId={user.id}
          isOwner={user.role === "owner"}
        />
      </div>
    </AdminShell>
  );
}
