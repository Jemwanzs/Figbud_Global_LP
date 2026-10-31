import type { Product } from "@figbud/brand";
import type { Locale } from "@figbud/i18n";
import { BrandLogo, type BrandProfile, ProductMark, hasLogo } from "@figbud/site-kit";
import { StatusBadge, buttonClasses, cn } from "@figbud/ui";
import { ArrowRight, ArrowUpRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";

import { ProductPreview } from "@/components/home/product-previews";
import type { Dictionary } from "@/i18n/get-dictionary";
import { fill } from "@/lib/format";
import { enquiryHref, productLink } from "@/lib/site";

type CardProps = {
  product: Product;
  locale: Locale;
  dict: Dictionary;
  /** The product's published brand (logos), from the brand registry. */
  brand: BrandProfile | null | undefined;
};

/** Shared card surface: brand accent line, soft glow, hover lift and focus state (UI-MO4). */
const surface =
  "group relative isolate flex w-full scroll-mt-28 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface transition-[transform,border-color,box-shadow] duration-[var(--motion-base)] ease-out-expo hover:-translate-y-1 hover:border-product/40 hover:shadow-[0_28px_56px_-36px_var(--product)] focus-within:border-product/40 motion-reduce:hover:translate-y-0";

function Accent() {
  return (
    <>
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-product via-product/50 to-transparent rtl:bg-gradient-to-l"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute end-[-12%] -top-28 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,var(--product-soft),transparent)] opacity-70 transition-opacity duration-[var(--motion-slow)] group-hover:opacity-100"
      />
    </>
  );
}

/** The product's name as its approved logo (the heading's text alternative), or symbol and name. */
function Identity({
  product,
  brand,
  large,
}: {
  product: Product;
  brand: CardProps["brand"];
  large?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {!hasLogo(brand?.logos.horizontal) && (
        <ProductMark slug={product.slug} brand={brand} size={large ? "lg" : "md"} />
      )}
      <h2
        className={cn(
          "font-semibold tracking-tight text-text",
          large ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
        )}
      >
        <BrandLogo
          pair={brand?.logos.horizontal}
          height={large ? 52 : 40}
          maxWidth={large ? 220 : 170}
          alt={product.name}
          fallback={product.name}
        />
      </h2>
    </div>
  );
}

function Highlights({ items, columns }: { items: string[]; columns?: boolean }) {
  return (
    <ul className={cn("grid gap-3", columns && "sm:grid-cols-2")}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-[0.95rem] text-text">
          <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-product-soft text-product-text">
            <Check aria-hidden className="size-3" strokeWidth={3} />
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Demo request or waitlist (pre-filled enquiry form), plus the product's own website when it has one. */
function Actions({ product, locale, dict, size }: CardProps & { size: "md" | "lg" }) {
  const { common } = dict;
  const comingSoon = product.status === "coming_soon";
  const link = productLink(product.slug, locale, product.status);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Link
        href={enquiryHref(locale, product)}
        className={buttonClasses(comingSoon ? "secondary" : "product", size)}
      >
        {comingSoon ? common.cta.joinWaitlist : common.cta.requestDemo}
        <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
      </Link>
      {link.external && (
        <a href={link.href} target="_blank" rel="noopener" className={buttonClasses("ghost", size)}>
          {fill(common.cta.visitSite, { product: product.name })}
          <ArrowUpRight aria-hidden className="size-4" />
          <span className="sr-only">({common.opensInNewTab})</span>
        </a>
      )}
    </div>
  );
}

/**
 * The featured product: its story on one side and an interactive synthetic
 * preview on the other (stacked on phones), labelled as illustrative.
 */
export function ProductSpotlight({ label, ...props }: CardProps & { label: string }) {
  const { product, dict, brand } = props;
  const copy = dict.products[product.slug];
  return (
    <article id={product.slug} data-product={product.slug} className={cn(surface, "hover:translate-y-0")}>
      <Accent />
      <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-12 lg:gap-12 lg:p-12">
        <div className="flex flex-col lg:col-span-5">
          <p className="inline-flex items-center gap-1.5 self-start rounded-full border border-product/30 bg-product-soft px-3 py-1 text-xs font-medium text-product-text">
            <Sparkles aria-hidden className="size-3.5" />
            {label}
          </p>
          <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <Identity product={product} brand={brand} large />
              <p className="mt-1 text-sm text-product-text">{copy.category}</p>
            </div>
            <StatusBadge status={product.status} label={dict.common.status[product.status]} />
          </div>
          <p className="mt-8 font-display text-title font-medium text-text">{copy.tagline}</p>
          <p className="mt-4 max-w-xl leading-relaxed text-muted">{copy.summary}</p>
          <div className="mt-8">
            <Highlights items={copy.highlights} />
          </div>
          <div className="mt-10 lg:mt-auto lg:pt-10">
            <Actions {...props} size="lg" />
          </div>
        </div>
        <figure
          aria-label={fill(dict.home.platforms.previewLabel, { product: product.name })}
          className="lg:col-span-7 lg:self-center"
        >
          <div aria-hidden>
            <ProductPreview slug={product.slug} copy={dict.home.platforms.previews} />
          </div>
          <figcaption className="mt-3 text-end text-[0.7rem] text-subtle">
            {dict.common.syntheticData}
          </figcaption>
        </figure>
      </div>
    </article>
  );
}

/** A supporting product: same proportions as its neighbours, all content visible without hover. */
export function ProductCard(props: CardProps) {
  const { product, dict, brand } = props;
  const copy = dict.products[product.slug];
  const comingSoon = product.status === "coming_soon";
  return (
    <article id={product.slug} data-product={product.slug} className={surface}>
      <Accent />
      <div className="flex flex-1 flex-col p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Identity product={product} brand={brand} />
            <p className="mt-1 text-sm text-product-text">{copy.category}</p>
          </div>
          <StatusBadge status={product.status} label={dict.common.status[product.status]} />
        </div>
        <p className="mt-6 font-display text-xl font-medium text-balance text-text">{copy.tagline}</p>
        <p className="mt-3 leading-relaxed text-muted">{copy.summary}</p>
        <div className="mt-6">
          <Highlights items={copy.highlights} />
        </div>
        {comingSoon && (
          <p className="mt-6 text-sm text-subtle">
            {fill(dict.home.platforms.waitlistNote, { product: product.name })}
          </p>
        )}
        <div className="mt-8 border-t border-line pt-6 md:mt-auto">
          <Actions {...props} size="md" />
        </div>
      </div>
    </article>
  );
}
