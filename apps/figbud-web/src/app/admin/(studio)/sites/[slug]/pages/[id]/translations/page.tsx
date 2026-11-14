import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import type { PageDetail } from "@/components/admin/page-types";
import {
  PageTranslations,
  type TranslationDetail,
  type TranslationLocale,
  type TranslationSummary,
} from "@/components/admin/page-translations";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Translations" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOCALES: TranslationLocale[] = ["sw", "fr", "ar", "zh"];

export default function TranslationsPage({
  params,
  searchParams,
}: PageProps<"/admin/sites/[slug]/pages/[id]/translations">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Translations params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Translations({
  params,
  searchParams,
}: Pick<PageProps<"/admin/sites/[slug]/pages/[id]/translations">, "params" | "searchParams">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const asked = (await searchParams).locale;
  const locale = LOCALES.find((l) => l === asked) ?? "sw";
  const [page, list, detail] = await Promise.all([
    adminGet<PageDetail>(`pages/${id}`),
    adminGet<{ translations: TranslationSummary[]; source_published: boolean }>(`pages/${id}/translations`),
    adminGet<TranslationDetail>(`pages/${id}/translations/${locale}`),
  ]);
  if (page.status === 404 || (page.data && page.data.site.slug !== slug)) notFound();
  if (!page.data || !list.data) return <AdminUnavailable />;

  return (
    <>
      <p className="text-sm text-subtle">
        <Link href="/admin/sites" className="hover:text-text">
          Websites
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}`} className="hover:text-text">
          {page.data.site.name}
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}/pages`} className="hover:text-text">
          Pages
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}/pages/${id}`} className="hover:text-text">
          {page.data.page.title}
        </Link>{" "}
        / Translations
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text">Translations</h1>
      <p className="mt-2 max-w-3xl text-muted">
        This page&apos;s texts in other languages, beside the published English. Each translation is written,
        reviewed by a native speaker, then published; anything not translated yet shows in English, so a page
        is never blank.
      </p>
      {list.data.source_published && detail.data ? (
        <PageTranslations
          key={locale}
          pageId={id}
          slug={slug}
          summaries={list.data.translations}
          detail={detail.data}
        />
      ) : (
        <p className="mt-6 rounded-2xl border border-line p-5 text-muted">
          Publish the English page first: translations follow the published page.
        </p>
      )}
    </>
  );
}
