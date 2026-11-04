import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { type SecurityOverview, SecuritySettings } from "@/components/admin/security-settings";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Security & Authentication" };

export default function SecurityPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Security />
    </Suspense>
  );
}

async function Security() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const overview = await adminGet<SecurityOverview>("security");
  if (!overview.data) return <AdminUnavailable />;
  return (
    <AdminShell user={user} active="/admin/settings">
      <p className="text-sm text-subtle">
        <Link href="/admin/settings" className="hover:text-text">
          Settings
        </Link>{" "}
        / Security & Authentication
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">
        Security & Authentication
      </h1>
      <p className="mt-2 max-w-3xl text-muted">
        How you sign in to the Studio, and where you&apos;re signed in. This is your own account: your role
        and the websites you work on don&apos;t change here.
      </p>
      <SecuritySettings data={overview.data} email={user.email} />
    </AdminShell>
  );
}
