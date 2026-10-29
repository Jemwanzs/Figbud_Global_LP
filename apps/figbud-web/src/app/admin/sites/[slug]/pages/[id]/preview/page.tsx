import { PageBlocks, siteThemeStyle } from "@figbud/site-kit";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { type PageDetail, STUDIO_MEDIA_BASE } from "@/components/admin/page-types";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Draft preview" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KNOWN = ["figbud", "zirahr", "jasiri", "expense_now", "ziwa"];

export default function PreviewPage({ params }: PageProps<"/admin/sites/[slug]/pages/[id]/preview">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Preview params={params} />
    </Suspense>
  );
}

/** The saved draft, full width, as the website will show it. Private to the Studio. */
async function Preview({ params }: Pick<PageProps<"/admin/sites/[slug]/pages/[id]/preview">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const { status, data } = await adminGet<PageDetail>(`pages/${id}`);
  if (status === 404 || (data && data.site.slug !== slug)) notFound();
  if (!data?.preview) return <AdminUnavailable />;

  return (
    <div
      data-product={KNOWN.includes(slug) ? slug : "figbud"}
      style={siteThemeStyle(data.site.theme)}
      className="min-h-dvh"
    >
      <div className="sticky top-0 z-10 border-b border-warning/40 bg-warning/10 px-5 py-2.5 text-center text-sm text-text backdrop-blur">
        Draft preview of <strong>{data.page.title}</strong> on {data.site.name} · not public ·{" "}
        <Link href={`/admin/sites/${slug}/pages/${id}`} className="font-medium text-accent hover:underline">
          Back to the editor
        </Link>
      </div>
      <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <PageBlocks document={data.preview} mode="preview" mediaBase={STUDIO_MEDIA_BASE} />
      </main>
    </div>
  );
}
