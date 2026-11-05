"use client";

import type { ProductSlug } from "@figbud/brand";
import {
  BrandLogo,
  type BrandProfile,
  NavPreview,
  type NavPreviewContent,
  ProductIdentity,
  hasLogo,
} from "@figbud/site-kit";
import { ThemeToggle, buttonClasses, cn } from "@figbud/ui";
import { ArrowRight } from "lucide-react";
import { usePathname } from "next/navigation";

export interface NavLink {
  href: string;
  label: string;
  /** This website's own hover preview, if it has one (UI-NAV2). */
  preview?: NavPreviewContent;
}

/**
 * A product website's header: its official logo (the full logo when one is
 * published, otherwise its symbol beside its name), its published pages as
 * navigation, and the call to action its status allows.
 */
export function SiteHeader({
  name,
  homeHref,
  slug,
  brand,
  links,
  cta,
}: {
  name: string;
  homeHref: string;
  /** The product, when it's one the brand registry knows. */
  slug?: ProductSlug;
  brand?: BrandProfile | null;
  links: NavLink[];
  /** Absent while the website isn't taking enquiries. */
  cta?: NavLink | null;
}) {
  const pathname = usePathname();
  // Own-domain requests are rewritten internally; compare the visible address.
  const current = pathname.replace(/^\/~[^/]+/, "") || "/";
  const isActive = (href: string) => href === current || href === pathname;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[92rem] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 sm:px-8 md:px-10 lg:px-16">
        <a href={homeHref} className="flex min-h-11 items-center gap-3 rounded-lg">
          {hasLogo(brand?.logos.horizontal) ? (
            <BrandLogo pair={brand.logos.horizontal} height={28} maxWidth={180} alt={name} />
          ) : slug ? (
            <ProductIdentity
              slug={slug}
              brand={brand}
              name={name}
              size="sm"
              nameClassName="text-[1.1rem] font-semibold tracking-tight text-text"
            />
          ) : (
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="inline-flex size-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-product to-product-2 text-sm font-semibold text-product-ink"
              >
                {name.charAt(0)}
              </span>
              <span className="text-[1.1rem] font-semibold tracking-tight text-text">{name}</span>
            </span>
          )}
        </a>
        {links.length > 0 && (
          <nav
            aria-label={`${name} navigation`}
            className="order-last -mx-2 w-full overflow-x-auto px-2 md:order-none md:mx-0 md:w-auto md:overflow-visible md:px-0"
          >
            <ul className="flex gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <NavPreview preview={link.preview}>
                    <a
                      href={link.href}
                      aria-current={isActive(link.href) ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-full px-3.5 text-sm whitespace-nowrap transition-colors",
                        isActive(link.href) ? "bg-surface-2 text-text" : "text-muted hover:text-text",
                      )}
                    >
                      {link.label}
                    </a>
                  </NavPreview>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="ms-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle labels={{ toLight: "Switch to light theme", toDark: "Switch to dark theme" }} />
          {cta && (
            <a href={cta.href} className={buttonClasses("product", "md")}>
              {cta.label}
              <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
