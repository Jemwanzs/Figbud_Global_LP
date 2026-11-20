import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { DeviceStudio } from "@/components/admin/device-studio";
import type { MediaItem } from "@/components/admin/page-types";
import type { AdminSite } from "@/components/admin/site-labels";
import { StudioSkeleton } from "@/components/admin/studio-states";
import type { WebsiteSettingsAdmin } from "@/components/admin/website-settings";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Device experience" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function DevicesPage({ params }: PageProps<"/admin/sites/[slug]/devices">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Devices params={params} />
    </Suspense>
  );
}

async function Devices({ params }: Pick<PageProps<"/admin/sites/[slug]/devices">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const [site, settings, media] = await Promise.all([
    adminGet<{ site: AdminSite }>(`sites/${slug}`),
    adminGet<WebsiteSettingsAdmin>(`sites/${slug}/settings`),
    adminGet<{ items: MediaItem[] }>(`sites/${slug}/media`),
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
        / Website display / Device experience
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">Device experience</h1>
      <p className="mt-2 max-w-3xl text-muted">
        How {name} shows its product on desktop, tablet and phone: the devices, the one shown, whether
        visitors may switch, and the frames. Sections with a device preview follow these settings unless they
        override them; their screenshots are always their own. Save a draft while you work: visitors only see
        what you publish, and only on {name}.
      </p>
      <DeviceStudio slug={slug} name={name} data={settings.data} media={media.data?.items ?? []} />
    </>
  );
}
