import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import type { CampaignList } from "@/components/admin/campaign-types";
import { CampaignsOverview } from "@/components/admin/campaigns-overview";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Campaigns & Promotions" };

export default function MarketingPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Marketing />
    </Suspense>
  );
}

async function Marketing() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { data } = await adminGet<CampaignList>("campaigns");
  if (!data) return <AdminUnavailable />;
  return (
    <AdminShell user={user} active="/admin/marketing">
      <p className="text-sm text-subtle">Marketing</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text">
        Campaigns & Promotions
      </h1>
      <p className="mt-2 max-w-3xl text-muted">
        Banners, announcements, dialogs and interactive rewards for FigBud Global and each product website.
        Every campaign belongs to one website, uses its approved brand, and goes live only after approval and
        inside its schedule.
      </p>
      <div className="mt-8">
        <CampaignsOverview data={data} />
      </div>
    </AdminShell>
  );
}
