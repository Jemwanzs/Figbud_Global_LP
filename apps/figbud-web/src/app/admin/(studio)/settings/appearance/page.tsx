import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { AppearanceStudio } from "@/components/admin/appearance-studio";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import type { AppearanceAdmin } from "@/lib/studio-appearance";

export const metadata: Metadata = { title: "Appearance & themes" };

export default function AppearancePage() {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Appearance />
    </Suspense>
  );
}

async function Appearance() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { data } = await adminGet<AppearanceAdmin>("studio-appearance");
  if (!data) return <AdminUnavailable />;
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-text">
        Appearance &amp; themes
      </h1>
      <p className="mt-2 max-w-3xl text-muted">
        Your colours, your identity: the Admin Studio&apos;s own light and dark colours, for everyone who uses
        it. Websites keep their own themes (Websites → a website → Colours &amp; themes). Publishing checks
        that every text stays readable, and keeps the version so you can roll back.
      </p>
      <AppearanceStudio data={data} />
    </>
  );
}
