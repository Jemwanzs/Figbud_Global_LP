import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { type SharedDetail, SharedEditor } from "@/components/admin/shared-editor";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Shared content" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function SharedPage({ params }: PageProps<"/admin/content/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Shared params={params} />
    </Suspense>
  );
}

async function Shared({ params }: Pick<PageProps<"/admin/content/[id]">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { status, data } = await adminGet<SharedDetail>(`shared/${id}`);
  if (status === 404) notFound();
  if (!data) return <AdminUnavailable />;
  return (
    <AdminShell user={user} active="/admin/content">
      <p className="text-sm text-subtle">
        <Link href="/admin/content" className="hover:text-text">
          Content library
        </Link>{" "}
        / {data.name}
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">{data.name}</h1>
      <div className="mt-8">
        {/* Keyed by the published version: a publish reloads the form; a save keeps it. */}
        <SharedEditor key={data.published_number ?? 0} item={data} />
      </div>
    </AdminShell>
  );
}
