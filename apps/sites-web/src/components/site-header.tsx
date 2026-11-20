"use client";

import type { ProductSlug } from "@figbud/brand";
import { type Locale, type PlatformEntry, interfaceCopy } from "@figbud/i18n";
import {
  BrandLogo,
  type BrandProfile,
  LanguageSwitcher,
  NavPreview,
  type NavPreviewContent,
  ProductIdentity,
  headerShowsLogo,
  useDismiss,
} from "@figbud/site-kit";
import { InverseTheme, ThemeToggle, buttonClasses, cn } from "@figbud/ui";
import { ArrowRight, Calculator, ChevronDown, LayoutGrid, Plug, Tags, Waypoints } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { languageHref, pageHref, splitLocale, pageSegments } from "@/lib/addresses";
import type { PlatformMenuEntry } from "@/lib/platform-menu";

export interface NavLink {
  href: string;
  label: string;
  /** This website's own hover preview, if it has one (UI-NAV2). */
  preview?: NavPreviewContent;
  /** The page it goes to, when it's one of the website's pages (for its translations). */
  path?: string;
  /** A submenu (the Platform menu): the entries this website publishes. */
  menu?: PlatformMenuEntry[];
}

const ENTRY_ICON: Record<PlatformEntry, typeof Waypoints> = {
  overview: Waypoints,
  modules: LayoutGrid,
  payroll: Calculator,
  pricing: Tags,
  integrations: Plug,
};

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
  languages,
  site,
  translations,
}: {
  name: string;
  homeHref: string;
  /** The product, when it's one the brand registry knows. */
  slug?: ProductSlug;
  brand?: BrandProfile | null;
  links: NavLink[];
  /** Absent while the website isn't taking enquiries; `labels` translate it (P7-L3). */
  cta?: (NavLink & { labels?: Partial<Record<Locale, string>> }) | null;
  /** The languages this website shows visitors (switched on and reviewed, P7-L1). */
  languages: readonly Locale[];
  site: { slug: string; ownDomain: boolean };
  /** Each published page's translated languages and titles (P7-L2). */
  translations: { path: string; locales: string[]; titles: Record<string, string> }[];
}) {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const menuId = useId();
  // Which submenu is open (one at a time), and whether a mouse opened it.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const hovered = useRef(false);
  const closeMenu = useCallback(() => setOpenMenu(null), []);
  useDismiss(headerRef, openMenu !== null, closeMenu);
  // On phones the header (three rows there) steps aside while reading down
  // the page and returns on any scroll up (UI-MO9, 20 Nov 2026); never while
  // a menu is open or focus is inside it. Wide screens keep it in place.
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 47.99rem)");
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        const header = headerRef.current;
        const busy =
          header?.contains(document.activeElement) || header?.querySelector("[aria-expanded=true]");
        if (!narrow.matches || busy || y < 160) setTucked(false);
        else if (y > last + 6) setTucked(true);
        else if (y < last - 6) setTucked(false);
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  // Own-domain requests are rewritten internally; compare the visible address.
  const current = pathname.replace(/^\/~[^/]+/, "") || "/";
  // Compared after the website's segment, so a renamed website's new and old
  // addresses (and the internal one) match the same page.
  const here = pageSegments(pathname, site.slug, site.ownDomain).join("/");
  const isActive = (href: string) =>
    href === current ||
    href === pathname ||
    (href.startsWith("/") && pageSegments(href.split("#")[0]!, site.slug, site.ownDomain).join("/") === here);
  // The page's language, from its address (`/zirahr/sw/platform`, P7-L2b).
  const { locale, path } = splitLocale(pageSegments(pathname, site.slug, site.ownDomain), languages);
  const words = interfaceCopy[locale as Locale] ?? interfaceCopy.en;
  // Each language's version of this page, where one exists.
  const offered = languages.filter((l) => languageHref(site.slug, site.ownDomain, translations, path, l));
  // On a translated page, menu links go to translated pages (with their titles) where they exist.
  const translated = (path: string | undefined) => {
    const page = path !== undefined && translations.find((t) => t.path === path);
    return locale !== "en" && page && page.locales.includes(locale) ? page : null;
  };
  const shown = links.map((link) => {
    const page = translated(link.path);
    const withPage = page
      ? {
          ...link,
          href: pageHref(site.slug, site.ownDomain, page.path, locale),
          label: page.titles[locale] ?? link.label,
        }
      : link;
    return {
      ...withPage,
      menu: link.menu?.map((m) => {
        const on = translated(m.path);
        return on
          ? {
              ...m,
              href: `${pageHref(site.slug, site.ownDomain, on.path, locale)}${m.hash ? `#${m.hash}` : ""}`,
            }
          : m;
      }),
    };
  });
  // The page a submenu entry goes to (its place on the page aside).
  const entryActive = (m: PlatformMenuEntry) => !m.hash && isActive(m.href);
  const openLink = shown.find((l) => l.href === openMenu);

  return (
    <header
      ref={headerRef}
      data-tucked={tucked || undefined}
      onFocusCapture={() => setTucked(false)}
      className={cn(
        "sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur-xl transition-transform duration-300 motion-reduce:transition-none",
        tucked && "-translate-y-full",
      )}
    >
      <div className="mx-auto flex max-w-[92rem] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 sm:px-8 md:px-10 lg:px-16">
        <a href={homeHref} className="flex min-h-11 items-center gap-3 rounded-lg">
          {/* The full logo, or the symbol and published name when the artwork names it otherwise. */}
          {brand && headerShowsLogo(brand, name) ? (
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
              {shown.map((link) =>
                link.menu ? (
                  <li
                    key={link.href}
                    className="relative flex items-center"
                    onMouseLeave={() => {
                      hovered.current = false;
                      if (openMenu === link.href) closeMenu();
                    }}
                  >
                    {/* The entry stays a link to its page (with its hover preview); the chevron opens the submenu. */}
                    <NavPreview preview={link.preview}>
                      <a
                        href={link.href}
                        aria-current={isActive(link.href) ? "page" : undefined}
                        className={cn(
                          "inline-flex min-h-11 items-center rounded-s-full ps-3.5 pe-1 text-sm whitespace-nowrap transition-colors",
                          isActive(link.href) || link.menu.some(entryActive) || openMenu === link.href
                            ? "text-text"
                            : "text-muted hover:text-text",
                        )}
                      >
                        {link.label}
                      </a>
                    </NavPreview>
                    <button
                      type="button"
                      aria-expanded={openMenu === link.href}
                      aria-controls={`${menuId}-wide ${menuId}-narrow`}
                      aria-label={words.submenu.replace("{label}", link.label)}
                      data-menu-trigger={link.path}
                      // A mouse click after hovering keeps it open; keyboard and touch toggle it.
                      onClick={(event) =>
                        setOpenMenu((open) =>
                          hovered.current && event.detail > 0
                            ? link.href
                            : open === link.href
                              ? null
                              : link.href,
                        )
                      }
                      onMouseEnter={() => {
                        hovered.current = true;
                        // Hover opens it on wide screens only (phones use the row below the menu).
                        if (window.matchMedia("(min-width: 48rem)").matches) setOpenMenu(link.href);
                      }}
                      className={cn(
                        "inline-flex min-h-11 min-w-9 cursor-pointer items-center justify-center rounded-e-full ps-1 pe-2.5 transition-colors",
                        openMenu === link.href ? "text-text" : "text-muted hover:text-text",
                      )}
                    >
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          "size-4 transition-transform duration-300 motion-reduce:transition-none",
                          openMenu === link.href && "rotate-180",
                        )}
                      />
                    </button>
                    {/* Wide screens: a dropdown under its entry, in the opposite theme like FigBud Global's menus. */}
                    {openMenu === link.href && (
                      <div className="absolute start-0 top-full z-50 hidden w-[min(22rem,calc(100vw-2rem))] pt-3 md:block">
                        <InverseTheme className="fb-panel fb-rise rounded-[1.25rem] p-2 text-text shadow-[var(--shadow-elevated)] [animation-duration:.3s]">
                          <PlatformMenuList
                            id={`${menuId}-wide`}
                            label={link.label}
                            entries={link.menu}
                            words={words.platformMenu}
                            active={entryActive}
                            onChoose={closeMenu}
                          />
                        </InverseTheme>
                      </div>
                    )}
                  </li>
                ) : (
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
                ),
              )}
            </ul>
          </nav>
        )}
        {/* Phones and tablets: the submenu opens as a row under the menu (an accordion), never clipped. */}
        {openLink?.menu && (
          <div className="order-last w-full pb-2 md:hidden">
            <PlatformMenuList
              id={`${menuId}-narrow`}
              label={openLink.label}
              entries={openLink.menu}
              words={words.platformMenu}
              active={entryActive}
              onChoose={closeMenu}
              className="rounded-2xl border border-line bg-surface p-1.5"
            />
          </div>
        )}
        <div className="ms-auto flex items-center gap-2 sm:gap-3">
          {/* The same selector as FigBud Global's, in this website's colours; it stays on this website. */}
          <LanguageSwitcher
            locale={locale as Locale}
            pathname={current}
            labels={words.language}
            available={offered}
            reviewed={languages}
            hrefFor={(code) => languageHref(site.slug, site.ownDomain, translations, path, code) ?? current}
          />
          <ThemeToggle labels={words.theme} />
          {cta && (
            <a href={cta.href} className={buttonClasses("product", "md")}>
              {cta.labels?.[locale as Locale] ?? cta.label}
              <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

/** The Platform menu's entries: icon, name and a short description, the current page marked. */
function PlatformMenuList({
  id,
  label,
  entries,
  words,
  active,
  onChoose,
  className,
}: {
  id: string;
  label: string;
  entries: PlatformMenuEntry[];
  words: (typeof interfaceCopy)["en"]["platformMenu"];
  active: (entry: PlatformMenuEntry) => boolean;
  onChoose: () => void;
  className?: string;
}) {
  return (
    <ul id={id} aria-label={label} className={cn("grid gap-0.5", className)}>
      {entries.map((m) => {
        const Icon = ENTRY_ICON[m.entry];
        const current = active(m);
        return (
          <li key={m.entry}>
            <a
              href={m.href}
              aria-current={current ? "page" : undefined}
              data-menu-entry={m.entry}
              onClick={onChoose}
              className={cn(
                "group flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2",
                current && "bg-surface-2",
              )}
            >
              <span
                aria-hidden
                className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-product-text transition-colors group-hover:bg-product group-hover:text-product-ink"
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text">{words[m.entry].label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{words[m.entry].hint}</span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
