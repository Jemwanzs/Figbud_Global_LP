import { isEnquiryProduct } from "@figbud/site-kit/enquiry";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { EnquiryFormEditor } from "@/components/admin/enquiry-form-editor";
import type { AdminSite } from "@/components/admin/site-labels";
import { StudioSkeleton } from "@/components/admin/studio-states";
import type { WebsiteSettingsAdmin } from "@/components/admin/website-settings";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { apiOrigin } from "@/lib/site";

export const metadata: Metadata = { title: "Enquiry form" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function EnquiryFormPage({ params }: PageProps<"/admin/sites/[slug]/enquiry-form">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <EnquiryFormSettings params={params} />
    </Suspense>
  );
}

async function EnquiryFormSettings({
  params,
}: Pick<PageProps<"/admin/sites/[slug]/enquiry-form">, "params">) {
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
        / Enquiry form
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">Enquiry form</h1>
      <p className="mt-2 max-w-3xl text-muted">
        How {name}&apos;s enquiry form looks and what it asks: its layout, the categories it offers, its
        optional fields and its wording.
        {kind === "corporate" && " Wording applies to English pages; other languages keep their own."} Save a
        draft while you work: visitors only see what you publish.
      </p>
      <EnquiryFormEditor
        slug={slug}
        name={name}
        product={kind === "product" && isEnquiryProduct(slug) ? slug : undefined}
        apiOrigin={apiOrigin}
        data={settings.data}
      />
    </>
  );
}
