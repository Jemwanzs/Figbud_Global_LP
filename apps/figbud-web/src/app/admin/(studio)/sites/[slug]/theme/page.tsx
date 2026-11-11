import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import type { AdminSite } from "@/components/admin/site-labels";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { ThemeStudio } from "@/components/admin/theme-studio";
import type { WebsiteSettingsAdmin } from "@/components/admin/website-settings";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Colours & themes" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function ThemePage({ params }: PageProps<"/admin/sites/[slug]/theme">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Theme params={params} />
    </Suspense>
  );
}

async function Theme({ params }: Pick<PageProps<"/admin/sites/[slug]/theme">, "params">) {
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
        / Branding / Colours &amp; themes
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">
        Colours &amp; themes
      </h1>
      {settings.data.corporate ? (
        <p className="mt-2 max-w-3xl text-muted">
          FigBud Global keeps its own identity, built into the corporate website. Colours &amp; themes is for
          the product websites: choose one from Websites.
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-3xl text-muted">
            {name}&apos;s palette, its light and dark colours and its gradients, with a live preview. Save a
            draft while you work: visitors only see what you publish, and only {name} changes. Publishing
            checks every colour for contrast (WCAG AA) and keeps the version, so you can roll back.
          </p>
          <ThemeStudio slug={slug} name={name} data={settings.data} />
        </>
      )}
    </>
  );
}
