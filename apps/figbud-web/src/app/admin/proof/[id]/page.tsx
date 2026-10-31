import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import type { MediaItem } from "@/components/admin/page-types";
import { ProofEditor } from "@/components/admin/proof-editor";
import { KIND_LABELS, type ProofDetail, type ProofList } from "@/components/admin/proof-types";
import type { AdminSite } from "@/components/admin/site-labels";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Content & Marketing" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function ProofItemPage({ params }: PageProps<"/admin/proof/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <ProofItem params={params} />
    </Suspense>
  );
}

async function ProofItem({ params }: Pick<PageProps<"/admin/proof/[id]">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { status, data } = await adminGet<ProofDetail>(`proof/${id}`);
  if (status === 404) notFound();
  if (!data) return <AdminUnavailable />;
  const [sites, media, list] = await Promise.all([
    adminGet<AdminSite[]>("sites"),
    adminGet<{ items: MediaItem[] }>("sites/figbud/media"),
    data.kind === "testimonial" ? adminGet<ProofList>("proof?kind=organization") : Promise.resolve(null),
  ]);
  const labels = KIND_LABELS[data.kind];
  return (
    <AdminShell user={user} active="/admin/marketing">
      <p className="text-sm text-subtle">
        <Link href={`/admin/proof?kind=${data.kind}`} className="hover:text-text">
          {labels.plural}
        </Link>{" "}
        / {data.title || `New ${labels.singular}`}
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">
        {data.title || `New ${labels.singular}`}
      </h1>
      <div className="mt-8">
        <ProofEditor
          initial={data}
          sites={(sites.data ?? [])
            .filter((s) => !s.archived_at)
            .map((s) => ({ slug: s.slug, name: s.name, corporate: s.kind === "corporate" }))}
          media={(media.data?.items ?? []).filter((m) => !m.archived_at)}
          organizations={(list?.data?.items ?? [])
            .filter((o) => o.status !== "archived")
            .map((o) => ({ id: o.id, title: o.title }))}
          isOwner={user.role === "owner"}
        />
      </div>
    </AdminShell>
  );
}
