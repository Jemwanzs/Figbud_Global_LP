import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { type NavPreviewLink, NavPreviewsEditor } from "@/components/admin/nav-previews-editor";
import type { AdminSite } from "@/components/admin/site-labels";
import type { WebsiteSettingsAdmin } from "@/components/admin/website-settings";
import { getDictionary } from "@/i18n/get-dictionary";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Hover Previews" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function NavPreviewsPage({ params }: PageProps<"/admin/sites/[slug]/nav-previews">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <NavPreviews params={params} />
    </Suspense>
  );
}

async function NavPreviews({ params }: Pick<PageProps<"/admin/sites/[slug]/nav-previews">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const [site, settings, dict] = await Promise.all([
    adminGet<{ site: AdminSite }>(`sites/${slug}`),
    adminGet<WebsiteSettingsAdmin>(`sites/${slug}/settings`),
    getDictionary("en"),
  ]);
  if (site.status === 404 || settings.status === 404) notFound();
  if (!site.data || !settings.data) return <AdminUnavailable />;
  const { name } = site.data.site;
  const data = settings.data;

  // The links this website's menu actually has. Only FigBud Global starts with
  // approved wording; product websites write their own, never a copy.
  const nav = data.settings.navigation;
  const links: NavPreviewLink[] = data.corporate
    ? (["home", "about", "blog", "contact"] as const).map((key) => ({
        key,
        label: dict.common.nav[key],
        fallback: dict.common.navPreviews[key],
      }))
    : nav?.mode === "custom"
      ? nav.items.map((item) => ({ key: item.href, label: item.label }))
      : data.pages.filter((p) => p.show_in_nav).map((p) => ({ key: p.path, label: p.title }));

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
        /{" "}
        <Link href={`/admin/sites/${slug}/website`} className="hover:text-text">
          Navigation
        </Link>{" "}
        / Hover Previews
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">Hover Previews</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Small cards that appear under {name}&apos;s plain menu links on hover and keyboard focus, always in
        the opposite theme to the page. Menus with dropdowns aren&apos;t affected. Save a draft while you
        work: visitors only see what you publish.
      </p>
      <NavPreviewsEditor slug={slug} data={data} links={links} corporate={data.corporate} />
    </>
  );
}
