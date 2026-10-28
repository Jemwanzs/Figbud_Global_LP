"use client";

import { publicProducts } from "@figbud/brand";
import { LOCALE_COOKIE, type Locale, localeInfo, localizePath, locales, stripLocale } from "@figbud/i18n";
import { FigBudWordmark, StatusBadge, ThemeToggle, buttonClasses, cn } from "@figbud/ui";
import { ArrowRight, ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  BrandLogo,
  type BrandProfile,
  LanguageSwitcher,
  ProductIdentity,
  ProductLogo,
  productLogoKind,
  useDismiss,
} from "@figbud/site-kit";

import type { Dictionary } from "@/i18n/get-dictionary";
import { productLink, routes } from "@/lib/site";

type HeaderProps = {
  locale: Locale;
  common: Dictionary["common"];
  products: Dictionary["products"];
  /** Published brand profiles by website slug (Admin → Websites → Branding). */
  brands: Record<string, BrandProfile | null>;
};

const navItems = [
  { key: "home", path: routes.home },
  { key: "products", path: routes.products },
  { key: "about", path: routes.about },
  { key: "blog", path: routes.blog },
  { key: "contact", path: routes.contact },
] as const;

export function SiteHeader({ locale, common, products, brands }: HeaderProps) {
  const pathname = usePathname();
  const current = stripLocale(pathname);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (path: string) => (path === "/" ? current === "/" : current.startsWith(path));

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled
          ? "border-b border-line bg-bg/80 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-[4.5rem] w-full max-w-[92rem] items-center gap-6 px-5 sm:px-8 md:px-10 lg:px-16">
        <Link
          href={localizePath(locale)}
          className="-m-1 rounded-lg p-1"
          aria-label={`${common.nav.home} — FigBud Global`}
        >
          <FigBudLogo brand={brands.figbud} />
        </Link>

        <nav aria-label={common.nav.label} className="ms-6 hidden lg:block">
          <ul className="flex items-center gap-1">
            {navItems.map((item) =>
              item.key === "products" ? (
                <li key={item.key}>
                  <ProductsMenu
                    locale={locale}
                    common={common}
                    products={products}
                    brands={brands}
                    active={isActive(item.path)}
                  />
                </li>
              ) : (
                <li key={item.key}>
                  <Link
                    href={localizePath(locale, item.path)}
                    aria-current={isActive(item.path) ? "page" : undefined}
                    className={cn(
                      "relative inline-flex min-h-11 items-center rounded-full px-4 text-[0.95rem] transition-colors",
                      isActive(item.path) ? "text-text" : "text-muted hover:text-text",
                    )}
                  >
                    {common.nav[item.key]}
                    {isActive(item.path) && (
                      <span aria-hidden className="absolute inset-x-4 -bottom-0.5 h-px bg-accent" />
                    )}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="ms-auto flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher
            locale={locale}
            pathname={current}
            labels={common.language}
            className="hidden md:block"
          />
          <ThemeToggle labels={common.theme} />
          <Link
            href={localizePath(locale, routes.contact)}
            className={buttonClasses("primary", "md", "ms-2 max-sm:hidden")}
          >
            {common.cta.letsTalk}
            <ArrowRight
              aria-hidden
              className="size-4 transition-transform group-hover/btn:translate-x-0.5 rtl:rotate-180 rtl:group-hover/btn:-translate-x-0.5"
            />
          </Link>
          <MobileMenu
            locale={locale}
            pathname={current}
            common={common}
            products={products}
            brands={brands}
            isActive={isActive}
          />
        </div>
      </div>
    </header>
  );
}

function ProductsMenu({ locale, common, products, brands, active }: HeaderProps & { active: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative" onMouseLeave={close}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        className={cn(
          "relative inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[0.95rem] transition-colors",
          active || open ? "text-text" : "text-muted hover:text-text",
        )}
      >
        {common.nav.products}
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform duration-300", open && "rotate-180")}
        />
        {active && <span aria-hidden className="absolute inset-x-4 -bottom-0.5 h-px bg-accent" />}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute start-1/2 top-full w-[26rem] -translate-x-1/2 pt-3 rtl:translate-x-1/2"
      >
        <div className="fb-panel fb-rise rounded-[1.25rem] p-2 [animation-duration:.35s]">
          <p className="px-3 pt-2 pb-1 text-xs font-medium tracking-[0.14em] text-subtle uppercase">
            {common.productsMenu.title}
          </p>
          <ul>
            {publicProducts.map((product) => {
              const link = productLink(product.slug, locale);
              const copy = products[product.slug];
              return (
                <li key={product.slug} data-product={product.slug}>
                  <a
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener" : undefined}
                    onClick={close}
                    className="group flex items-start gap-3.5 rounded-2xl p-3 transition-colors hover:bg-surface-2"
                  >
                    {productLogoKind(brands[product.slug]) !== "wordmark" && (
                      <ProductLogo slug={product.slug} brand={brands[product.slug]} name={product.name} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {productLogoKind(brands[product.slug]) === "wordmark" ? (
                          <ProductLogo
                            slug={product.slug}
                            brand={brands[product.slug]}
                            name={product.name}
                            size="sm"
                            maxWidth={96}
                          />
                        ) : (
                          <span className="font-medium text-text">{product.name}</span>
                        )}
                        <StatusBadge
                          status={product.status}
                          label={common.status[product.status]}
                          className="py-0.5"
                        />
                      </span>
                      <span className="mt-1 block text-sm leading-snug text-muted">{copy.tagline}</span>
                    </span>
                    {link.external && (
                      <>
                        <ArrowUpRight
                          aria-hidden
                          className="mt-1 size-4 text-subtle transition-colors group-hover:text-product-text"
                        />
                        <span className="sr-only">({common.opensInNewTab})</span>
                      </>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
          <Link
            href={localizePath(locale, routes.products)}
            onClick={close}
            className="mt-1 flex items-center justify-between rounded-2xl border-t border-line px-3 py-3 text-sm text-muted transition-colors hover:text-text"
          >
            {common.productsMenu.viewAll}
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function rememberLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

function MobileMenu({
  locale,
  pathname,
  common,
  products,
  brands,
  isActive,
}: HeaderProps & { pathname: string; isActive: (path: string) => boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = () => dialogRef.current?.showModal();
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={common.menu.open}
        aria-haspopup="dialog"
        className="inline-flex size-11 items-center justify-center rounded-full text-text transition-colors hover:bg-surface-2 lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
      </button>

      <dialog
        ref={dialogRef}
        aria-label={common.nav.label}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-text backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex lg:hidden"
      >
        <div className="ms-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-bg-elevated shadow-2xl sm:border-s sm:border-line">
          <div className="flex h-[4.5rem] shrink-0 items-center justify-between px-5 sm:px-8">
            <FigBudLogo brand={brands.figbud} />
            <button
              type="button"
              onClick={close}
              aria-label={common.menu.close}
              className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>

          <nav aria-label={common.nav.label} className="px-5 pt-4 sm:px-8">
            <ul className="space-y-1">
              {navItems.map((item) => (
                <li key={item.key}>
                  <Link
                    href={localizePath(locale, item.path)}
                    onClick={close}
                    aria-current={isActive(item.path) ? "page" : undefined}
                    className="flex min-h-12 items-center justify-between border-b border-line py-3 text-2xl font-medium tracking-tight text-muted transition-colors hover:text-text aria-[current]:text-text"
                  >
                    {common.nav[item.key]}
                    {isActive(item.path) && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <section className="px-5 pt-8 sm:px-8" aria-labelledby="mobile-products-title">
            <h2
              id="mobile-products-title"
              className="text-xs font-medium tracking-[0.14em] text-subtle uppercase"
            >
              {common.productsMenu.title}
            </h2>
            <ul className="mt-3 space-y-2">
              {publicProducts.map((product) => {
                const link = productLink(product.slug, locale);
                return (
                  <li key={product.slug} data-product={product.slug}>
                    <a
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener" : undefined}
                      onClick={close}
                      className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface p-3"
                    >
                      <span className="flex-1">
                        <ProductIdentity
                          slug={product.slug}
                          brand={brands[product.slug]}
                          name={product.name}
                          maxWidth={96}
                          nameClassName="font-medium"
                        />
                        <span className="block text-sm text-muted">{products[product.slug].category}</span>
                      </span>
                      <StatusBadge status={product.status} label={common.status[product.status]} />
                      {link.external && <span className="sr-only">({common.opensInNewTab})</span>}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="px-5 pt-8 sm:px-8" aria-labelledby="mobile-language-title">
            <h2
              id="mobile-language-title"
              className="text-xs font-medium tracking-[0.14em] text-subtle uppercase"
            >
              {common.language.label}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {locales.map((code) => (
                <li key={code}>
                  <Link
                    href={localizePath(code, pathname)}
                    hrefLang={localeInfo[code].tag}
                    lang={localeInfo[code].tag}
                    aria-current={code === locale ? "true" : undefined}
                    onClick={() => {
                      rememberLocale(code);
                      close();
                    }}
                    className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm text-muted aria-[current]:border-accent aria-[current]:text-text"
                  >
                    {localeInfo[code].label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-auto px-5 py-8 sm:px-8">
            <Link
              href={localizePath(locale, routes.contact)}
              onClick={close}
              className={buttonClasses("primary", "lg", "w-full")}
            >
              {common.cta.letsTalk}
              <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** The FigBud Global logo from its brand profile, or the built-in wordmark until one is published. */
function FigBudLogo({ brand }: { brand?: BrandProfile | null }) {
  return (
    <BrandLogo
      pair={brand?.logos.horizontal}
      height={brand?.logo_height ?? 28}
      maxWidth={190}
      alt="FigBud Global"
      fallback={<FigBudWordmark />}
    />
  );
}
