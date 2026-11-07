"use client";

import type { Product } from "@figbud/brand";
import { type Locale, localizePath } from "@figbud/i18n";
import {
  type BrandProfile,
  EditorialHero,
  HeroActions,
  type HeroConfig,
  ProductIdentity,
} from "@figbud/site-kit";
import { Check } from "lucide-react";

import type { Dictionary } from "@/i18n/get-dictionary";
import { routes } from "@/lib/site";

import { heroText } from "./hero-text";

/**
 * Variant 04 · The FigBud Edition (UI-MO8): the editorial hero. FigBud
 * Global's platforms as a numbered index beside layered product sheets, each
 * coming forward with its chapter. Everything shown comes from the product
 * registry and the approved copy: names, categories, summaries, highlights
 * and status.
 */
export function EditionHero({
  locale,
  dict,
  config,
  products,
  brands,
}: {
  locale: Locale;
  dict: Dictionary;
  config: HeroConfig;
  products: Product[];
  brands: Record<string, BrandProfile | null>;
}) {
  const text = heroText(locale, config, {
    eyebrow: dict.home.hero.eyebrow,
    headline: "One vision.",
    accent: "Endless solutions.",
    lead: dict.home.hero.lead,
  });
  const chapters = products.map((product) => {
    const copy = dict.products[product.slug];
    const status = dict.common.status[product.status];
    return {
      key: product.slug,
      title: product.name,
      meta: `${copy.category} · ${status}`,
      sheet: (
        <div data-product={product.slug} className="flex size-full flex-col p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <ProductIdentity
              slug={product.slug}
              brand={brands[product.slug] ?? null}
              name={product.name}
              maxWidth={150}
              nameClassName="text-lg font-semibold text-text"
            />
            <span className="rounded-full bg-product-soft px-2.5 py-1 text-xs font-medium text-product-text">
              {status}
            </span>
          </div>
          <p className="mt-5 text-xs font-medium tracking-[0.16em] text-product-text uppercase">
            {copy.category}
          </p>
          <p className="mt-2 font-display text-xl leading-snug font-semibold text-text sm:text-2xl">
            {copy.tagline}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">{copy.summary}</p>
          <ul className="mt-auto space-y-2 border-t border-line pt-4 text-sm text-muted">
            {copy.highlights.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-product-text" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ),
    };
  });
  return (
    <EditorialHero
      id="hero-title"
      design="edition"
      product="figbud"
      config={config}
      eyebrow={text.eyebrow}
      headline={text.headline}
      accent={text.accent}
      lead={text.lead}
      actions={
        <HeroActions
          primary={{
            label: config.primary_label || dict.common.cta.exploreProducts,
            href: config.primary_href || localizePath(locale, routes.products),
          }}
          secondary={{
            label: config.secondary_label || dict.common.cta.talkToTeam,
            href: config.secondary_href || localizePath(locale, routes.contact),
          }}
        />
      }
      chapters={chapters}
      indexLabel={dict.home.platforms.title}
    />
  );
}
