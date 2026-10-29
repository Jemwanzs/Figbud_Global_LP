import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { type PrivacyAdmin, PrivacySettings } from "@/components/admin/privacy-settings";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Privacy & Cookies" };

export default function PrivacyPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Privacy />
    </Suspense>
  );
}

async function Privacy() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { data } = await adminGet<PrivacyAdmin>("privacy");
  if (!data) return <AdminUnavailable />;
  return (
    <AdminShell user={user} active="/admin/settings">
      <p className="text-sm text-subtle">
        <Link href="/admin/settings" className="hover:text-text">
          Settings
        </Link>{" "}
        / Privacy & Cookies
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">Privacy & Cookies</h1>
      <p className="mt-2 max-w-3xl text-muted">
        The cookie banner on every FigBud website. Strictly necessary cookies are always on; analytics,
        preference and marketing cookies stay off until a visitor allows them, and can be withdrawn from
        “Cookie settings” in every footer.
      </p>
      <div className="mt-10">
        <PrivacySettings data={data} />
      </div>
    </AdminShell>
  );
}
