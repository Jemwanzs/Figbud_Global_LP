"use client";

import type { Product, ProductSlug } from "@figbud/brand";
import type { Locale } from "@figbud/i18n";
import { BrandLogo, type BrandProfile, ProductLogo, hasLogo, productLogoKind } from "@figbud/site-kit";
import { FigBudMark, StatusBadge, cn } from "@figbud/ui";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { m } from "motion/react";
import { useId } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";

import { VIEW, arc, continentPath, destinations, hub } from "./africa-geo";
import { productCta } from "./product-cta";
import { useRevealOnTap } from "./use-reveal";

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

/**
 * Product logos sit on an arc east of Nairobi, over the Indian Ocean, where no
 * expansion routes run, so they never cover the routes or crowd the origin.
 */
function markerPositions(count: number) {
  const radius = 150;
  const [from, to] = [-15, 70];
  return Array.from({ length: count }, (_, i) => {
    const angle = count === 1 ? 10 : from + (i * (to - from)) / (count - 1);
    const rad = (angle * Math.PI) / 180;
    return { x: hub.x + radius * Math.cos(rad), y: hub.y + radius * Math.sin(rad) };
  });
}

type Labels = {
  label: string;
  startingPoint: string;
  originTagline: string;
  productsLabel: string;
  explore: string;
};

export function AfricaMap({
  locale,
  labels,
  common,
  copy,
  products,
  brands,
}: {
  locale: Locale;
  labels: Labels;
  common: Dictionary["common"];
  copy: Dictionary["products"];
  /** Listed products shown on the map (Admin → Websites), in registry order. */
  products: Product[];
  brands: Record<string, BrandProfile | null>;
}) {
  const positions = markerPositions(products.length);
  const figbudSymbol = brands.figbud?.logos.symbol;

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
          role="img"
          aria-label={labels.label}
          className="h-auto w-full"
        >
          <defs>
            <pattern id="africa-dots" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="6" cy="6" r="2.1" fill="var(--text-subtle)" fillOpacity="0.45" />
            </pattern>
            <radialGradient id="africa-hub-glow">
              <stop offset="0" stopColor="var(--fb-emerald)" stopOpacity="0.5" />
              <stop offset="1" stopColor="var(--fb-emerald)" stopOpacity="0" />
            </radialGradient>
          </defs>

          <path d={continentPath} fill="url(#africa-dots)" />
          <path
            d={continentPath}
            fill="none"
            stroke="var(--line-strong)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {destinations.map((point, i) => (
            <g key={i}>
              <m.path
                d={arc(hub, point)}
                fill="none"
                stroke="var(--fb-emerald)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeOpacity="0.7"
                initial={{ pathLength: 0, opacity: 0 }}
                whileInView={{ pathLength: 1, opacity: 1 }}
                viewport={{ once: true, margin: "-15% 0px" }}
                transition={{ duration: 1.4, delay: 0.2 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
              />
              <m.circle
                cx={point.x}
                cy={point.y}
                r="5"
                fill="var(--bg)"
                stroke="var(--fb-emerald)"
                strokeWidth="2"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-15% 0px" }}
                transition={{ duration: 0.4, delay: 1.1 + i * 0.09 }}
              />
            </g>
          ))}

          {/* Tethers from the origin to each product (larger screens only). */}
          <g className="max-sm:hidden">
            {positions.map((p, i) => (
              <m.line
                key={products[i]!.slug}
                data-product={products[i]!.slug}
                x1={hub.x}
                y1={hub.y}
                x2={p.x}
                y2={p.y}
                stroke="var(--product)"
                strokeWidth="1.4"
                strokeDasharray="2 5"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                whileInView={{ pathLength: 1, opacity: 0.8 }}
                viewport={{ once: true, margin: "-15% 0px" }}
                transition={{ duration: 0.8, delay: 1.5 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </g>

          <circle cx={hub.x} cy={hub.y} r="60" fill="url(#africa-hub-glow)" />
          <circle
            cx={hub.x}
            cy={hub.y}
            r="16"
            fill="none"
            stroke="var(--fb-emerald)"
            strokeOpacity="0.5"
            className="origin-center [transform-box:fill-box] motion-safe:animate-[fb-orbit-glow_3.2s_ease-in-out_infinite]"
          />
          <circle cx={hub.x} cy={hub.y} r="8" fill="var(--fb-emerald)" />
        </svg>

        {/* Origin: sits to the left of Nairobi so it never overflows narrow screens. */}
        <div
          className="absolute -translate-y-1/2 pr-5 sm:pr-7"
          style={{ right: `${100 - (hub.x / VIEW.width) * 100}%`, top: pct(hub.y, VIEW.height) }}
        >
          <div className="fb-panel flex items-center gap-2.5 rounded-2xl py-2 ps-2 pe-3.5 whitespace-nowrap shadow-[0_12px_32px_-14px_var(--glow)]">
            {hasLogo(figbudSymbol) ? (
              // The official symbol is drawn for dark backgrounds, so it sits on a dark tile in both themes.
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-fb-ink shadow-[0_0_0_1px_rgb(34_197_94/0.35),0_0_18px_-4px_var(--fb-emerald)]">
                <BrandLogo pair={figbudSymbol} on="dark" height={22} maxWidth={24} alt="" />
              </span>
            ) : (
              <FigBudMark className="size-9" />
            )}
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-text">FigBud Global</span>
              <span className="block text-xs text-muted">{labels.startingPoint}</span>
              <span className="hidden text-[0.7rem] text-accent italic sm:block">{labels.originTagline}</span>
            </span>
          </div>
        </div>

        {/* Product logos around the origin (larger screens). */}
        {products.length > 0 && (
          <ul aria-label={labels.productsLabel} className="max-sm:hidden">
            {products.map((product, i) => (
              <MapMarker
                key={product.slug}
                index={i}
                product={product}
                position={positions[i]!}
                brand={brands[product.slug]}
                summary={copy[product.slug].summary}
                locale={locale}
                common={common}
                exploreLabel={labels.explore}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Phones: the same products as a compact grid beneath the map. */}
      {products.length > 0 && (
        <ul aria-label={labels.productsLabel} className="mt-6 grid grid-cols-2 gap-3 sm:hidden">
          {products.map((product) => {
            const { link } = productCta(product, locale, common, labels.explore);
            return (
              <li key={product.slug} data-product={product.slug}>
                <a
                  href={link.href}
                  {...(link.external ? { target: "_blank", rel: "noopener" } : {})}
                  className="flex h-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-[var(--product)]"
                >
                  <MarkerLogo slug={product.slug} name={product.name} brand={brands[product.slug]} />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-medium text-text">{product.name}</span>
                    <span className="text-xs text-product-text">{common.status[product.status]}</span>
                  </span>
                  {link.external && <span className="sr-only">({common.opensInNewTab})</span>}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A product's published symbol, its full logo when it has no symbol, else its built-in icon. */
function MarkerLogo({ slug, name, brand }: { slug: ProductSlug; name: string; brand?: BrandProfile | null }) {
  if (productLogoKind(brand) === "wordmark") {
    return (
      <span className="flex h-9 shrink-0 items-center rounded-[11px] bg-fb-ink px-2">
        <ProductLogo slug={slug} brand={brand} name={name} on="dark" size="sm" maxWidth={52} />
      </span>
    );
  }
  return <ProductLogo slug={slug} brand={brand} name={name} size="sm" className="size-9" />;
}

function MapMarker({
  index,
  product,
  position,
  brand,
  summary,
  locale,
  common,
  exploreLabel,
}: {
  index: number;
  product: Product;
  position: { x: number; y: number };
  brand?: BrandProfile | null;
  summary: string;
  locale: Locale;
  common: Dictionary["common"];
  exploreLabel: string;
}) {
  const id = useId();
  const { ref, open, onClick } = useRevealOnTap<HTMLLIElement>();
  const { link, label } = productCta(product, locale, common, exploreLabel);

  return (
    <m.li
      ref={ref}
      data-product={product.slug}
      data-open={open || undefined}
      className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 focus-within:z-20 hover:z-20 data-open:z-20"
      style={{ left: pct(position.x, VIEW.width), top: pct(position.y, VIEW.height) }}
      initial={{ opacity: 0, scale: 0.6 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 0.5, delay: 1.7 + index * 0.12, ease: [0.16, 1, 0.3, 1] }}
    >
      <a
        href={link.href}
        {...(link.external ? { target: "_blank", rel: "noopener" } : {})}
        onClick={onClick}
        aria-describedby={id}
        className={cn(
          "flex rounded-[14px] bg-bg-elevated p-1 shadow-[0_0_0_1px_var(--line-strong),0_10px_24px_-12px_var(--product)] transition-[translate,box-shadow] duration-300",
          "hover:shadow-[0_0_0_2px_var(--product),0_10px_24px_-12px_var(--product)] focus-visible:shadow-[0_0_0_2px_var(--product)] motion-safe:hover:-translate-y-0.5",
        )}
      >
        <MarkerLogo slug={product.slug} name={product.name} brand={brand} />
        <span className="sr-only">
          {product.name}, {common.status[product.status]}
          {link.external && ` (${common.opensInNewTab})`}
        </span>
      </a>
      <div
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute top-1/2 right-full mr-3 w-[14rem] -translate-y-1/2 rounded-2xl border border-line-strong bg-bg-elevated p-3.5 text-start opacity-0 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.35)] transition-[opacity,visibility] duration-200",
          "group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 group-data-open:visible group-data-open:opacity-100",
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-text">{product.name}</span>
          <StatusBadge status={product.status} label={common.status[product.status]} />
        </span>
        <span className="mt-1.5 block text-[0.78rem] leading-relaxed text-muted">{summary}</span>
        <span className="mt-2 flex items-center gap-1 text-[0.78rem] font-medium text-product-text">
          {label}
          {link.external ? (
            <ArrowUpRight aria-hidden className="size-3.5" />
          ) : (
            <ArrowRight aria-hidden className="size-3.5 rtl:rotate-180" />
          )}
        </span>
      </div>
    </m.li>
  );
}
