"use client";

import type { Product, ProductSlug } from "@figbud/brand";
import type { Locale } from "@figbud/i18n";
import { StatusBadge, buttonClasses, cn } from "@figbud/ui";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { type KeyboardEvent, useId, useRef, useState } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import { fill } from "@/lib/format";
import { productLink } from "@/lib/site";

import { type BrandProfile, ProductMark } from "@figbud/site-kit";
import { ExpensePreview, JasiriPreview, ZiraPreview } from "./product-previews";

type Props = {
  locale: Locale;
  platforms: Dictionary["home"]["platforms"];
  products: Dictionary["products"];
  /** Public products with their current marketing status (lib/products). */
  items: Product[];
  /** Published brand profiles by product slug. */
  brands: Record<string, BrandProfile | null>;
  common: Dictionary["common"];
};

export function PlatformShowcase({ locale, platforms, products, items, brands, common }: Props) {
  const [active, setActive] = useState<ProductSlug>(items[0]?.slug ?? "zirahr");
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const rtl = document.documentElement.dir === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    let next: number | null = null;
    if (event.key === forward) next = index === last ? 0 : index + 1;
    if (event.key === back) next = index === 0 ? last : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    setActive(items[next]!.slug);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={platforms.tabsLabel}
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        className="grid gap-2 rounded-[1.4rem] border border-line bg-surface/50 p-1.5 sm:gap-3 md:p-2"
      >
        {items.map((product, index) => {
          const selected = product.slug === active;
          return (
            <button
              key={product.slug}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              role="tab"
              type="button"
              id={`${baseId}-tab-${product.slug}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${product.slug}`}
              tabIndex={selected ? 0 : -1}
              data-product={product.slug}
              onClick={() => setActive(product.slug)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "relative flex min-h-14 items-center justify-center gap-3 rounded-2xl px-2 py-2.5 text-start transition-colors sm:justify-start sm:px-4 md:py-3.5",
                selected ? "text-text" : "text-muted hover:bg-surface-2/60 hover:text-text",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-0 rounded-2xl border border-product/30 bg-bg-elevated shadow-[0_10px_30px_-18px_var(--product)] transition-[opacity,transform] duration-300 ease-out-expo",
                  selected ? "scale-100 opacity-100" : "scale-95 opacity-0",
                )}
              />
              <ProductMark
                slug={product.slug}
                brand={brands[product.slug]}
                size="sm"
                className="max-sm:hidden"
              />
              <span className="relative min-w-0">
                <span className="block text-sm font-medium whitespace-nowrap sm:text-base">
                  {product.name}
                </span>
                <span className="hidden truncate text-xs text-subtle md:block">
                  {products[product.slug].category}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Server HTML and first paint show final states; only tab switches animate. */}
      <AnimatePresence initial={false}>
        {items.map((product) => {
          const selected = product.slug === active;
          const copy = products[product.slug];
          const link = productLink(product.slug, locale, product.status);
          const comingSoon = product.status === "coming_soon";
          return (
            <div
              key={product.slug}
              role="tabpanel"
              id={`${baseId}-panel-${product.slug}`}
              aria-labelledby={`${baseId}-tab-${product.slug}`}
              hidden={!selected}
              data-product={product.slug}
              className="relative mt-6 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface md:mt-8"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute end-[-10%] -top-32 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,var(--product-soft),transparent)]"
              />
              <div className="relative grid gap-10 p-6 sm:p-8 lg:grid-cols-12 lg:gap-12 lg:p-12">
                <m.div
                  key={String(selected)}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col lg:col-span-5"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <ProductMark slug={product.slug} brand={brands[product.slug]} size="lg" />
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight text-text">{product.name}</h3>
                      <p className="text-sm text-product-text">{copy.category}</p>
                    </div>
                    <StatusBadge
                      status={product.status}
                      label={common.status[product.status]}
                      className="ms-auto self-start"
                    />
                  </div>
                  <p className="mt-8 font-display text-title font-medium text-text">{copy.tagline}</p>
                  <p className="mt-4 leading-relaxed text-muted">{copy.summary}</p>
                  <ul className="mt-6 space-y-3">
                    {copy.highlights.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-[0.95rem] text-text">
                        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-product-soft text-product-text">
                          <Check aria-hidden className="size-3" strokeWidth={3} />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  {comingSoon && <p className="mt-6 text-sm text-muted">{platforms.waitlistNote}</p>}
                  <div className="mt-8 lg:mt-auto lg:pt-10">
                    <a
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener" : undefined}
                      className={buttonClasses(
                        comingSoon ? "secondary" : "product",
                        "lg",
                        "w-full sm:w-auto",
                      )}
                    >
                      {comingSoon
                        ? common.cta.joinWaitlist
                        : fill(common.cta.visitSite, { product: product.name })}
                      {link.external ? (
                        <>
                          <ArrowUpRight aria-hidden className="size-4" />
                          <span className="sr-only">({common.opensInNewTab})</span>
                        </>
                      ) : (
                        <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
                      )}
                    </a>
                  </div>
                </m.div>

                <div className="lg:col-span-7">
                  <figure aria-label={fill(platforms.previewLabel, { product: product.name })}>
                    {selected && (
                      <m.div
                        initial={{ opacity: 0, y: 20, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                        aria-hidden
                      >
                        {product.slug === "zirahr" && <ZiraPreview copy={platforms.previews.zirahr} />}
                        {product.slug === "jasiri" && <JasiriPreview copy={platforms.previews.jasiri} />}
                        {product.slug === "expense_now" && (
                          <ExpensePreview copy={platforms.previews.expense_now} />
                        )}
                      </m.div>
                    )}
                    <figcaption className="mt-3 text-end text-[0.7rem] text-subtle">
                      {common.syntheticData}
                    </figcaption>
                  </figure>
                </div>
              </div>
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
