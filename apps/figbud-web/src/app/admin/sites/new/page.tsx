import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { SiteForm } from "@/components/admin/site-form";
import { requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "New website" };

export default function NewSitePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <NewSite />
    </Suspense>
  );
}

async function NewSite() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;

  return (
    <AdminShell user={user} active="/admin/sites">
      <p className="text-sm text-subtle">
        <Link href="/admin/sites" className="hover:text-text">
          Websites
        </Link>{" "}
        / New
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text">
        New product website
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Set up the website in three steps. It is created as a private draft; nothing goes live until the
        launch status is approved.
      </p>
      <div className="mt-8 max-w-3xl">
        {user.role === "owner" ? (
          <SiteForm canEdit />
        ) : (
          <p className="text-muted">Only owners can create websites.</p>
        )}
      </div>
    </AdminShell>
  );
}
