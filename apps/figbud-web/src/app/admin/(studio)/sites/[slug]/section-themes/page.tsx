import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { SectionThemesEditor } from "@/components/admin/section-themes-editor";
import type { AdminSite } from "@/components/admin/site-labels";
import type { WebsiteSettingsAdmin } from "@/components/admin/website-settings";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Section themes" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function SectionThemesPage({ params }: PageProps<"/admin/sites/[slug]/section-themes">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <SectionThemes params={params} />
    </Suspense>
  );
}

async function SectionThemes({ params }: Pick<PageProps<"/admin/sites/[slug]/section-themes">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const [site, settings] = await Promise.all([
    adminGet<{ site: AdminSite }>(`sites/${slug}`),
    adminGet<WebsiteSettingsAdmin>(`sites/${slug}/settings`),
  ]);
  if (site.status === 404 || settings.status === 404) notFound();
  if (!site.data || !settings.data) return <AdminUnavailable />;
  // FigBud Global's home page only: product websites set bands per section in the page builder.
  if (!settings.data.corporate) notFound();
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
        / Section themes
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">Section themes</h1>
      <p className="mt-2 max-w-3xl text-muted">
        The home page alternates dark and light bands. The hero follows each visitor&apos;s theme, Our
        Platforms takes the opposite, and the sections after it alternate. Switching theme flips them all
        together. Save a draft while you work: visitors only see what you publish.
      </p>
      <SectionThemesEditor slug={slug} data={settings.data} />
    </>
  );
}
