import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { PageEditor } from "@/components/admin/page-editor";
import type { PageDetail } from "@/components/admin/page-types";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { forSite } from "@/lib/admin-client";

export const metadata: Metadata = { title: "Edit page" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function EditPage({ params }: PageProps<"/admin/sites/[slug]/pages/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/sites/[slug]/pages/[id]">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const { status, data } = await adminGet<PageDetail>(`pages/${id}`);
  if (status === 404 || (data && data.site.slug !== slug)) notFound();
  if (!data) return <AdminUnavailable />;

  return (
    <AdminShell user={user} active="/admin/sites">
      <p className="text-sm text-subtle">
        <Link href="/admin/sites" className="hover:text-text">
          Websites
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}`} className="hover:text-text">
          {data.site.name}
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}/pages`} className="hover:text-text">
          Pages
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text">{data.page.title}</h1>
      <div className="mt-6">
        {/* Keyed by page id so switching pages starts a fresh editor. */}
        <PageEditor key={data.page.id} slug={slug} user={forSite(user, slug)} initial={data} />
      </div>
    </AdminShell>
  );
}
