import { fetchProof } from "@figbud/site-kit/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import type { MediaItem } from "@/components/admin/page-types";
import { ResultsStudio } from "@/components/admin/results-studio";
import type { FigureRecord } from "@/components/admin/story-figures";
import type { AdminSite } from "@/components/admin/site-labels";
import { StudioSkeleton } from "@/components/admin/studio-states";
import type { WebsiteSettingsAdmin } from "@/components/admin/website-settings";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { apiBase } from "@/lib/products";

export const metadata: Metadata = { title: "Results & success story" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function ResultsPage({ params }: PageProps<"/admin/sites/[slug]/results">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Results params={params} />
    </Suspense>
  );
}

async function Results({ params }: Pick<PageProps<"/admin/sites/[slug]/results">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const [site, settings, media, corporate, figures, figureMedia] = await Promise.all([
    adminGet<{ site: AdminSite }>(`sites/${slug}`),
    adminGet<WebsiteSettingsAdmin>(`sites/${slug}/settings`),
    adminGet<{ items: MediaItem[] }>(`sites/${slug}/media`),
    adminGet<WebsiteSettingsAdmin>("sites/figbud/settings"),
    // Every figure, with drafts (Customers & proof, kept with FigBud Global), and its media library.
    adminGet<{ items: FigureRecord[]; can_edit: boolean; can_review: boolean }>("proof?kind=metric"),
    adminGet<{ items: MediaItem[] }>("sites/figbud/media"),
  ]);
  if (site.status === 404 || settings.status === 404) notFound();
  if (!site.data || !settings.data) return <AdminUnavailable />;
  // The figures come from Customers & proof: those published for this website.
  const proof = await fetchProof(apiBase, slug);
  const { name } = site.data.site;

  return (
    <>
      <p className="text-sm text-subtle">
        <Link href="/admin/sites" className="hover:text-text">
          Websites
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}`} className="hover:text-text">
          {name}
        </Link>{" "}
        / Results & success story
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">
        Results & success story
      </h1>
      <p className="mt-2 max-w-3xl text-muted">
        How {name} shows its verified figures. The figures themselves are managed once in{" "}
        <Link href="/admin/proof?kind=metric" className="font-medium text-accent-strong underline">
          Customers & proof
        </Link>
        , each with its source, period and verification, and published for the websites it belongs to. Save a
        draft while you work: visitors only see what you publish.
      </p>
      <ResultsStudio
        slug={slug}
        name={name}
        data={settings.data}
        metrics={proof.metrics}
        media={media.data?.items ?? []}
        inherited={settings.data.corporate ? null : (corporate.data?.settings.display ?? null)}
        initialFigures={(figures.data?.items ?? []).filter((f) => f.draft)}
        figureMedia={figureMedia.data?.items ?? []}
        canEditFigures={figures.data?.can_edit ?? false}
        canReviewFigures={figures.data?.can_review ?? false}
        testimonials={proof.testimonials}
      />
    </>
  );
}
