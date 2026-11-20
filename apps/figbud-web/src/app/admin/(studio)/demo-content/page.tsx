import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { IdentitiesStudio } from "@/components/admin/identities-studio";
import { MarketingTabs } from "@/components/admin/marketing-tabs";
import type { AdminSite } from "@/components/admin/site-labels";
import { StudioSkeleton } from "@/components/admin/studio-states";
import type { WebsiteSettingsAdmin } from "@/components/admin/website-settings";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Sample identities" };

export default function DemoContentPage() {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <DemoContent />
    </Suspense>
  );
}

async function DemoContent() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const [settings, sites] = await Promise.all([
    adminGet<WebsiteSettingsAdmin>("sites/figbud/settings"),
    adminGet<AdminSite[]>("sites"),
  ]);
  if (!settings.data) return <AdminUnavailable />;

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Sample identities</h1>
      <p className="mt-2 max-w-3xl text-muted">
        The fictional people every website&apos;s illustrations and demonstrations use: profiles, leave lists,
        approvals and activity. Change them here once; websites follow when you publish. Real customers,
        users, testimonials and records never come from here.
      </p>
      <MarketingTabs active="identities" />
      <IdentitiesStudio
        data={settings.data}
        sites={(sites.data ?? []).filter((s) => !s.archived_at).map((s) => ({ slug: s.slug, name: s.name }))}
      />
    </>
  );
}
