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
