import { publicProducts } from "@figbud/brand";
import { type HeroVariant, ProductHero } from "@figbud/site-kit";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import type { HeroAdmin } from "@/components/admin/hero/hero-types";
import { HeroSlot } from "@/components/home/heroes/hero-slot";
import { getDictionary } from "@/i18n/get-dictionary";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { getBrands, getPublicProducts } from "@/lib/products";
import { enquiryHref, productLink } from "@/lib/site";

export const metadata: Metadata = { title: "Hero preview" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;
const ID = /^[A-Za-z0-9_-]{1,24}$/;

/**
 * The exact preview (Hero Design Studio): the same hero components and saved
 * settings the website renders, in an iframe. `?theme=` sets this document's
 * theme only; the visitor's saved preference and the website are untouched.
 */
export default function HeroPreviewPage({
  params,
  searchParams,
}: PageProps<"/admin/hero-preview/[slug]/[variant]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Preview params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({
  params,
  searchParams,
}: Pick<PageProps<"/admin/hero-preview/[slug]/[variant]">, "params" | "searchParams">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable standalone />;
  const { slug, variant: id } = await params;
  const { theme } = await searchParams;
  if (!SLUG.test(slug) || !ID.test(id)) notFound();
  const { status, data } = await adminGet<HeroAdmin>(`sites/${slug}/hero`);
  if (status === 404 || !data) notFound();
  const variant: HeroVariant | undefined = data.draft.variants.find((v) => v.id === id);
  if (!variant) notFound();
  const mode = theme === "light" ? "light" : "dark";
  const [dict, products, brands] = await Promise.all([getDictionary("en"), getPublicProducts(), getBrands()]);
  return (
    <>
      {/* This frame's theme only: nothing is written to the visitor's preferences. */}
      <script
        dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(mode)}` }}
      />
      <div data-preview={variant.design} data-site-preview="" className="min-h-dvh bg-bg">
        {slug === "figbud" ? (
          <HeroSlot hero={variant} locale="en" dict={dict} products={products} brands={brands} />
        ) : (
          <ProductHero
            design={variant.design}
            slug={slug}
            name={data.site.name}
            brand={brands[slug] ?? null}
            config={variant.config}
            demoHref={
              publicProducts.some((p) => p.slug === slug)
                ? enquiryHref("en", {
                    slug: slug as (typeof publicProducts)[number]["slug"],
                    status: "active",
                  })
                : "/en/contact"
            }
            featuresHref={
              publicProducts.some((p) => p.slug === slug)
                ? productLink(slug as (typeof publicProducts)[number]["slug"], "en").href
                : "#"
            }
          />
        )}
      </div>
    </>
  );
}
