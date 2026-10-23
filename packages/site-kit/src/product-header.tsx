"use client";

import { type ProductSlug, getProduct, productSites } from "@figbud/brand";
import { type Locale, localizePath, stripLocale } from "@figbud/i18n";
import { ThemeToggle, buttonClasses, cn } from "@figbud/ui";
import { ArrowLeft, ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

import { enquiryLink, figbudLink, linkProps } from "./cross-site";
import { type LanguageLabels, LanguageSwitcher } from "./language-switcher";
import type { BrandProfile } from "./brand";
import { ProductMark } from "./brand-logo";

export interface ProductHeaderLabels {
  /** Navigation label for each `productSites[slug].nav` key. */
  nav: Record<string, string>;
  navLabel: string;
  /** Primary call to action: "Book a demo" or "Join the waitlist". */
  cta: string;
  /** "Back to FigBud Global" */
  backToFigbud: string;
  opensInNewTab: string;
  menu: { open: string; close: string };
  theme: { toLight: string; toDark: string };
  language: LanguageLabels;
}

/** Sticky header shared by every product website (P4-01). */
export function ProductHeader({
  slug,
  locale,
  labels,
  brand,
}: {
  slug: ProductSlug;
  locale: Locale;
  labels: ProductHeaderLabels;
  /** The product's published brand profile, if any. */
  brand?: BrandProfile | null;
}) {
  const product = getProduct(slug);
  const nav = productSites[slug].nav;
  const pathname = stripLocale(usePathname() ?? "/");
  const isActive = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path));
  const cta = linkProps(enquiryLink(slug, locale));
  const back = linkProps(figbudLink(locale));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="hidden border-b border-line sm:block">
        <div className="mx-auto flex max-w-[92rem] items-center px-5 sm:px-8 md:px-10 lg:px-16">
          <a
            {...back}
            className="inline-flex min-h-9 items-center gap-1.5 text-xs text-subtle transition-colors hover:text-text"
          >
            <ArrowLeft aria-hidden className="size-3.5 rtl:rotate-180" />
            {labels.backToFigbud}
            <span className="sr-only">({labels.opensInNewTab})</span>
          </a>
        </div>
      </div>
      <div className="mx-auto flex h-[4.5rem] max-w-[92rem] items-center gap-6 px-5 sm:px-8 md:px-10 lg:px-16">
        <Link href={localizePath(locale)} className="flex items-center gap-3 rounded-xl">
          <ProductMark slug={slug} brand={brand} size="sm" />
          <span className="text-[1.15rem] font-semibold tracking-[-0.02em] text-text">{product.name}</span>
        </Link>

        <nav aria-label={labels.navLabel} className="hidden flex-1 lg:block">
          <ul className="flex items-center gap-1">
            {nav
              .filter((item) => item.primary && item.path !== "/")
              .map((item) => (
                <li key={item.key}>
                  <Link
                    href={localizePath(locale, item.path)}
                    aria-current={isActive(item.path) ? "page" : undefined}
                    className="inline-flex min-h-11 items-center rounded-full px-3.5 text-[0.95rem] text-muted transition-colors hover:text-text aria-[current]:text-text"
                  >
                    {labels.nav[item.key]}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>

        <div className="ms-auto flex items-center gap-1 lg:ms-0">
          <LanguageSwitcher
            locale={locale}
            pathname={pathname}
            labels={labels.language}
            className="hidden sm:block"
          />
          <ThemeToggle labels={labels.theme} />
          <a {...cta} className={buttonClasses("product", "md", "ms-2 max-sm:hidden")}>
            {labels.cta}
            <ArrowUpRight aria-hidden className="size-4 rtl:-scale-x-100" />
            <span className="sr-only">({labels.opensInNewTab})</span>
          </a>
          <MobileMenu slug={slug} locale={locale} labels={labels} isActive={isActive} brand={brand} />
        </div>
      </div>
    </header>
  );
}

function MobileMenu({
  slug,
  locale,
  labels,
  isActive,
  brand,
}: {
  slug: ProductSlug;
  locale: Locale;
  labels: ProductHeaderLabels;
  isActive: (path: string) => boolean;
  brand?: BrandProfile | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();
  const product = getProduct(slug);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={labels.menu.open}
        aria-haspopup="dialog"
        className="inline-flex size-11 items-center justify-center rounded-full text-text transition-colors hover:bg-surface-2 lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
      </button>
      <dialog
        ref={dialogRef}
        aria-label={labels.navLabel}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-text backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex lg:hidden"
      >
        <div className="ms-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-bg-elevated shadow-2xl sm:border-s sm:border-line">
          <div className="flex h-[4.5rem] shrink-0 items-center justify-between px-5 sm:px-8">
            <span className="flex items-center gap-3">
              <ProductMark slug={slug} brand={brand} size="sm" />
              <span className="text-lg font-semibold">{product.name}</span>
            </span>
            <button
              type="button"
              onClick={close}
              aria-label={labels.menu.close}
              className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <nav aria-label={labels.navLabel} className="px-5 pt-4 sm:px-8">
            <ul className="space-y-1">
              {productSites[slug].nav.map((item) => (
                <li key={item.key}>
                  <Link
                    href={localizePath(locale, item.path)}
                    onClick={close}
                    aria-current={isActive(item.path) ? "page" : undefined}
                    className="flex min-h-12 items-center border-b border-line py-3 text-xl font-medium tracking-tight text-muted transition-colors hover:text-text aria-[current]:text-text"
                  >
                    {labels.nav[item.key]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto space-y-3 px-5 py-8 sm:px-8">
            <a
              {...linkProps(enquiryLink(slug, locale))}
              onClick={close}
              className={buttonClasses("product", "lg", "w-full")}
            >
              {labels.cta}
              <ArrowUpRight aria-hidden className="size-4 rtl:-scale-x-100" />
              <span className="sr-only">({labels.opensInNewTab})</span>
            </a>
            <a
              {...linkProps(figbudLink(locale))}
              onClick={close}
              className={cn(buttonClasses("secondary", "lg", "w-full"))}
            >
              <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
              {labels.backToFigbud}
              <span className="sr-only">({labels.opensInNewTab})</span>
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
