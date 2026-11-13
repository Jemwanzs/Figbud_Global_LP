import { publicProducts } from "@figbud/brand";
import { type HeroVariant, type PageDocument, PageBlocks } from "@figbud/site-kit";
import { ProductHero } from "@figbud/site-kit/product-heroes";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import type { HeroAdmin } from "@/components/admin/hero/hero-types";
import { HeroSlot } from "@/components/home/heroes/hero-slot";
import { getDictionary } from "@/i18n/get-dictionary";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { apiBase, getBrands, getPublicProducts } from "@/lib/products";
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
  const mode = theme === "light" ? "light" : "dark";
  const [dict, products, brands] = await Promise.all([getDictionary("en"), getPublicProducts(), getBrands()]);
  const setTheme = (
    <script
      dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(mode)}` }}
    />
  );
  // The website's own hero (owner's brief, 12 Nov 2026): what it shows with no
  // design published. FigBud Global's built-in hero; a product website's
  // published home page hero section, rendered by the same blocks.
  if (id === "own") {
    const hero = slug === "figbud" ? null : await homeHero(slug);
    return (
      <>
        {setTheme}
        <div data-preview="own" data-site-preview="" className="min-h-dvh bg-bg">
          {slug === "figbud" ? (
            <HeroSlot hero={null} locale="en" dict={dict} products={products} brands={brands} />
          ) : hero ? (
            <div
              data-site={slug}
              data-product={slug}
              className="mx-auto max-w-[92rem] px-5 py-section-sm sm:px-8 md:px-10 lg:px-16"
            >
              <PageBlocks document={hero} mode="preview" />
            </div>
          ) : (
            <p className="p-10 text-muted">
              The home page has no published hero section: the website starts with its first section.
            </p>
          )}
        </div>
      </>
    );
  }
  const variant: HeroVariant | undefined = data.draft.variants.find((v) => v.id === id);
  if (!variant) notFound();
  return (
    <>
      {/* This frame's theme only: nothing is written to the visitor's preferences. */}
      {setTheme}
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

/** The published home page's leading hero section, as the website renders it. */
async function homeHero(slug: string): Promise<PageDocument | null> {
  try {
    const response = await fetch(`${apiBase}/v1/sites/${encodeURIComponent(slug)}/page?path=`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const page = (await response.json()) as PageDocument;
    const first = page.sections[0];
    return first?.type === "hero" ? { ...page, sections: [first] } : null;
  } catch {
    return null;
  }
}
