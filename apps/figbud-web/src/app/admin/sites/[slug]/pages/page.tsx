import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import type { PageList } from "@/components/admin/page-types";
import { PagesManager } from "@/components/admin/pages-manager";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Pages" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function PagesPage({ params }: PageProps<"/admin/sites/[slug]/pages">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Pages params={params} />
    </Suspense>
  );
}

async function Pages({ params }: Pick<PageProps<"/admin/sites/[slug]/pages">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const { status, data } = await adminGet<PageList>(`sites/${slug}/pages`);
  if (status === 404) notFound();
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
        / Pages
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text">
        {data.site.name} pages
      </h1>
      <p className="mt-2 max-w-3xl text-muted">
        Build pages from approved sections. Drafts are private; a page goes live when its change is approved,
        and every published version can be restored.
      </p>
      <div className="mt-8">
        {/* Keyed by the page list so the order resets after changes elsewhere. */}
        <PagesManager
          key={data.pages.map((p) => `${p.id}:${p.position}:${p.archived_at ?? ""}`).join()}
          slug={slug}
          user={user}
          initial={data}
        />
      </div>
    </AdminShell>
  );
}
