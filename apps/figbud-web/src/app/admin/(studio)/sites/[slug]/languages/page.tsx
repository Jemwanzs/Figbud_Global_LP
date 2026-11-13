import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { SiteLanguagesEditor } from "@/components/admin/site-languages-editor";
import type { AdminSite } from "@/components/admin/site-labels";
import { StudioSkeleton } from "@/components/admin/studio-states";
import type { WebsiteSettingsAdmin } from "@/components/admin/website-settings";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { apiBase } from "@/lib/products";

export const metadata: Metadata = { title: "Languages" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function SiteLanguagesPage({ params }: PageProps<"/admin/sites/[slug]/languages">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <SiteLanguages params={params} />
    </Suspense>
  );
}

/** Languages published with a recorded review (English always). */
async function reviewedLanguages(): Promise<string[]> {
  try {
    const response = await fetch(`${apiBase}/v1/locales`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const data = (await response.json()) as { published?: unknown };
    return Array.isArray(data.published) ? data.published.filter((c) => typeof c === "string") : ["en"];
  } catch {
    return ["en"];
  }
}

async function SiteLanguages({ params }: Pick<PageProps<"/admin/sites/[slug]/languages">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const [site, settings, reviewed] = await Promise.all([
    adminGet<{ site: AdminSite }>(`sites/${slug}`),
    adminGet<WebsiteSettingsAdmin>(`sites/${slug}/settings`),
    reviewedLanguages(),
  ]);
  if (site.status === 404 || settings.status === 404) notFound();
  if (!site.data || !settings.data) return <AdminUnavailable />;
  const { name, kind } = site.data.site;

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
        / Languages
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">Languages</h1>
      <p className="mt-2 max-w-3xl text-muted">
        The languages {name} offers in its language selector, the one it opens in, and the one that fills in
        anything not translated yet. Other websites keep their own. Save a draft while you work: visitors only
        see what you publish.
      </p>
      <SiteLanguagesEditor slug={slug} name={name} kind={kind} reviewed={reviewed} data={settings.data} />
    </>
  );
}
