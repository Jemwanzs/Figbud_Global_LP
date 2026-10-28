import type { ProductSlug } from "@figbud/brand";
import { cn } from "@figbud/ui";
import type { ReactNode } from "react";

import { type BrandAsset, type BrandPair, type BrandProfile, brandImageSources, hasLogo } from "./brand";
import { ProductGlyph } from "./product-glyph";

function LogoImage({
  asset,
  theme,
  solo,
  height,
  maxWidth,
  alt,
  basePath,
}: {
  asset: BrandAsset;
  theme: "dark" | "light" | "both";
  solo: boolean;
  height: number;
  maxWidth?: number;
  alt: string;
  basePath?: string;
}) {
  // Width follows the file's own proportions, so a logo can never be stretched.
  let h = height;
  let w = Math.round((h * asset.width) / asset.height);
  if (maxWidth && w > maxWidth) {
    w = maxWidth;
    h = Math.round((w * asset.height) / asset.width);
  }
  const { src, srcSet } = brandImageSources(asset, w, basePath);
  return (
    <span
      className={cn(
        "fb-brand",
        theme === "dark" && "fb-brand-on-dark",
        theme === "light" && "fb-brand-on-light",
        solo && "fb-brand-solo",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- immutable, pre-sized brand files */}
      <img
        src={src}
        srcSet={srcSet}
        alt={alt}
        width={w}
        height={h}
        decoding="async"
        className="block max-w-none"
      />
    </span>
  );
}

/**
 * A logo from the brand profile, shown in the right variant for the page's
 * theme. When a slot only has a file for one kind of background, the other
 * theme shows that file on a small plate of its intended background rather
 * than altering the artwork. `fallback` renders when the slot is empty.
 */
export function BrandLogo({
  pair,
  height,
  maxWidth,
  alt,
  fallback = null,
  className,
  basePath,
  on,
}: {
  pair?: BrandPair | null;
  height: number;
  maxWidth?: number;
  alt: string;
  fallback?: ReactNode;
  className?: string;
  /** Where files are served from; the Studio previews drafts through the admin API. */
  basePath?: string;
  /** For logos on a fixed-colour surface (not the page theme): always use the file made for it. */
  on?: "dark" | "light";
}) {
  if (!hasLogo(pair)) return <>{fallback}</>;
  if (on) {
    const asset = on === "dark" ? (pair.on_dark ?? pair.on_light) : (pair.on_light ?? pair.on_dark);
    return (
      <span className={cn("inline-flex shrink-0 items-center", className)}>
        <LogoImage
          asset={asset!}
          theme="both"
          solo={false}
          height={height}
          maxWidth={maxWidth}
          alt={alt}
          basePath={basePath}
        />
      </span>
    );
  }
  const solo = !(pair.on_dark && pair.on_light);
  const props = { height, maxWidth, alt, basePath };
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      {pair.on_dark && pair.on_light && pair.on_dark.id === pair.on_light.id ? (
        // One file made for both backgrounds.
        <LogoImage asset={pair.on_dark} theme="both" solo={false} {...props} />
      ) : (
        <>
          {pair.on_dark && <LogoImage asset={pair.on_dark} theme="dark" solo={solo} {...props} />}
          {pair.on_light && <LogoImage asset={pair.on_light} theme="light" solo={solo} {...props} />}
        </>
      )}
    </span>
  );
}

const MARK_SIZE = { sm: 32, md: 40, lg: 48 } as const;

/** A product's symbol from its brand profile, or its built-in icon tile until one is published. */
export function ProductMark({
  slug,
  brand,
  size = "md",
  className,
}: {
  slug: ProductSlug;
  brand?: BrandProfile | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const symbol = brand?.logos.symbol;
  if (!hasLogo(symbol)) return <ProductGlyph slug={slug} size={size} className={className} />;
  return (
    <span aria-hidden className={cn("inline-flex shrink-0", className)}>
      <BrandLogo pair={symbol} height={MARK_SIZE[size]} maxWidth={MARK_SIZE[size]} alt="" />
    </span>
  );
}

/** What a product shows in a compact space, from its published brand profile. */
export type ProductLogoKind = "symbol" | "wordmark" | "builtin";

/**
 * The published symbol; else the published logo, which carries the name (so
 * callers drop their own name text); else the built-in icon, only until the
 * product has an approved logo.
 */
export function productLogoKind(brand?: BrandProfile | null): ProductLogoKind {
  if (hasLogo(brand?.logos.symbol)) return "symbol";
  if (hasLogo(brand?.logos.horizontal)) return "wordmark";
  return "builtin";
}

/**
 * A product's identity for compact spaces (tabs, menus, map markers, cards),
 * always from the brand profile published in the Studio; see
 * `productLogoKind`. Proportions are never altered: the symbol fits a square
 * of the given size and the logo fits `maxWidth`. `on` pins a fixed-colour
 * surface; otherwise the variant follows the page theme.
 */
export function ProductLogo({
  slug,
  brand,
  name,
  size = "md",
  maxWidth,
  on,
  className,
}: {
  slug: ProductSlug;
  brand?: BrandProfile | null;
  /** The product's name: the logo's text alternative when it carries the name. */
  name: string;
  size?: "sm" | "md" | "lg";
  /** The widest the full logo may be (default: 2.6 x the symbol size). */
  maxWidth?: number;
  on?: "dark" | "light";
  className?: string;
}) {
  const kind = productLogoKind(brand);
  const side = MARK_SIZE[size];
  if (kind === "builtin") return <ProductGlyph slug={slug} size={size} className={className} />;
  if (kind === "symbol") {
    return (
      <span aria-hidden className={cn("inline-flex shrink-0", className)}>
        <BrandLogo pair={brand!.logos.symbol} height={side} maxWidth={side} alt="" on={on} />
      </span>
    );
  }
  return (
    <BrandLogo
      pair={brand!.logos.horizontal}
      height={Math.round(side * 0.9)}
      maxWidth={maxWidth ?? Math.round(side * 2.6)}
      alt={name}
      on={on}
      className={className}
    />
  );
}

/**
 * A product's mark and name as one unit: its symbol (or built-in icon) beside
 * the name, or its published logo alone when the logo carries the name.
 */
export function ProductIdentity({
  slug,
  brand,
  name,
  size = "sm",
  maxWidth,
  nameClassName,
  className,
}: {
  slug: ProductSlug;
  brand?: BrandProfile | null;
  name: string;
  size?: "sm" | "md" | "lg";
  maxWidth?: number;
  nameClassName?: string;
  className?: string;
}) {
  const logo = <ProductLogo slug={slug} brand={brand} name={name} size={size} maxWidth={maxWidth} />;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-3", className)}>
      {logo}
      {productLogoKind(brand) !== "wordmark" && <span className={nameClassName}>{name}</span>}
    </span>
  );
}
