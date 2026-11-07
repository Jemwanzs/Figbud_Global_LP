import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { FooterEditor } from "@/components/admin/footer-editor";
import type { AdminSite } from "@/components/admin/site-labels";
import type { WebsiteSettingsAdmin } from "@/components/admin/website-settings";
import { getDictionary } from "@/i18n/get-dictionary";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Footer" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function FooterPage({ params }: PageProps<"/admin/sites/[slug]/footer">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Footer params={params} />
    </Suspense>
  );
}

async function Footer({ params }: Pick<PageProps<"/admin/sites/[slug]/footer">, "params">) {
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
  const { name, tagline, description } = site.data.site;
  const data = settings.data;
  // What an empty field shows: FigBud Global's approved wording, or the
  // product website's own tagline and description.
  const defaults = data.corporate
    ? {
        tagline: dict.footer.tagline,
        note: dict.home.company.body,
        ctaHeading: dict.footer.cta.heading,
        ctaBody: dict.footer.cta.body,
        ctaLabel: dict.footer.cta.label,
      }
    : {
        tagline: tagline ?? "",
        note: description ?? "",
        ctaHeading: "Ready to get started?",
        ctaBody: "",
        ctaLabel: "Book a demo",
      };

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
        / Footer
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">Footer</h1>
      <p className="mt-2 max-w-3xl text-muted">
        {name}&apos;s footer on every page: the call to action above it, the logo with its tagline and
        description, the link groups, contact details and official profiles. Save a draft while you work:
        visitors only see what you publish.
      </p>
      <FooterEditor slug={slug} name={name} data={data} defaults={defaults} />
    </>
  );
}
