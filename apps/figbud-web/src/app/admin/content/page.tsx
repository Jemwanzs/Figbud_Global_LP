import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { ContentLibrary } from "@/components/admin/content-library";
import type { SharedItem } from "@/components/admin/page-types";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Content library" };

export default function ContentPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { data } = await adminGet<{ items: SharedItem[]; can_edit: boolean }>("shared");
  if (!data) return <AdminUnavailable />;
  return (
    <AdminShell user={user} active="/admin/content">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Content library</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Sections written once and used on pages of any FigBud website. Pages show the latest published
        version, so one change, published by a reviewer, updates every page using it.
      </p>
      <div className="mt-8">
        <ContentLibrary items={data.items} canEdit={data.can_edit} />
      </div>
    </AdminShell>
  );
}
