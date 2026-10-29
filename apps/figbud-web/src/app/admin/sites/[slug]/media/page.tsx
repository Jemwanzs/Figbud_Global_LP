import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { MediaLibrary } from "@/components/admin/media-library";
import type { MediaItem } from "@/components/admin/page-types";
import type { AdminSite } from "@/components/admin/site-labels";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Media" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function MediaPage({ params }: PageProps<"/admin/sites/[slug]/media">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Media params={params} />
    </Suspense>
  );
}

async function Media({ params }: Pick<PageProps<"/admin/sites/[slug]/media">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const [site, media] = await Promise.all([
    adminGet<{ site: AdminSite }>(`sites/${slug}`),
    adminGet<{ items: MediaItem[]; can_edit: boolean }>(`sites/${slug}/media`),
  ]);
  if (site.status === 404 || media.status === 404) notFound();
  if (!site.data || !media.data) return <AdminUnavailable />;
  const { name } = site.data.site;

  return (
    <AdminShell user={user} active="/admin/sites">
      <p className="text-sm text-subtle">
        <Link href="/admin/sites" className="hover:text-text">
          Websites
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}`} className="hover:text-text">
          {name}
        </Link>{" "}
        / Media
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">Media</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Images for {name}&apos;s pages. Upload once, then add them with the Image section in the page builder.
        An image appears on the website only once a published page uses it.
      </p>
      <div className="mt-8">
        <MediaLibrary slug={slug} items={media.data.items} canEdit={media.data.can_edit} />
      </div>
    </AdminShell>
  );
}
