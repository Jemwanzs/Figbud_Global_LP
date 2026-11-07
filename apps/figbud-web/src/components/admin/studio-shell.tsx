"use client";

import { cn } from "@figbud/ui";
import {
  ChevronDown,
  Clock,
  LayoutDashboard,
  Megaphone,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Rocket,
  SlidersHorizontal,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import type { AdminUser } from "@/lib/admin-client";

import { AccountMenu } from "./account-menu";
import {
  type Area,
  type NavGroup,
  type NavLink,
  type NavSite,
  activeLink,
  siteInPath,
  studioNav,
} from "./studio-nav";

const ICONS: Record<Area, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  websites: PanelsTopLeft,
  products: Palette,
  content: Megaphone,
  leads: Users,
  pricing: Wallet,
  publishing: Rocket,
  settings: SlidersHorizontal,
};

const SITE_KEY = "figbud-studio-site";
const COMPACT_KEY = "figbud-studio-compact";

// Remembered per browser: the last website worked on and the compact sidebar.
// Read through an external store, so the server render and hydration agree.
const CHANGED = "figbud-studio-stored";
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private windows: the choice simply isn't remembered.
  }
  window.dispatchEvent(new Event(CHANGED));
}
const useStored = (key: string) =>
  useSyncExternalStore(
    subscribe,
    () => stored(key),
    () => null,
  );

/**
 * The Studio's application shell (owner's briefs, 8 Nov 2026): a top bar and a
 * sidebar that stay mounted while only the page content changes, so moving
 * between sections never blanks the screen. Rendered once by the Studio
 * layout; pages show their own loading skeletons inside it.
 */
export function StudioShell({
  user,
  sites,
  brand,
  children,
}: {
  user: AdminUser;
  sites: NavSite[];
  brand: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const remembered = useStored(SITE_KEY);
  const compact = useStored(COMPACT_KEY) === "1";
  const [drawer, setDrawer] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  const inPath = siteInPath(pathname);
  const context = inPath ?? remembered;
  const groups = studioNav(user, sites, context);
  const active = activeLink(groups, pathname, search);
  const area = active?.group.id ?? "overview";
  const site = sites.find((s) => s.slug === context) ?? sites.find((s) => s.kind === "corporate") ?? null;

  useEffect(() => {
    if (inPath && sites.some((s) => s.slug === inPath) && stored(SITE_KEY) !== inPath)
      store(SITE_KEY, inPath);
  }, [inPath, sites]);

  // The drawer is a modal dialog: focus stays inside, Escape closes it.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (drawer && !el.open) el.showModal();
    if (!drawer && el.open) el.close();
  }, [drawer]);
  // A new page closes the drawer.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (drawer) setDrawer(false);
  }

  const toggleCompact = () => store(COMPACT_KEY, compact ? "0" : "1");

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#studio-main"
        className="sr-only z-50 rounded-full bg-action px-4 py-2 text-action-ink focus:not-sr-only focus:fixed focus:start-4 focus:top-3"
      >
        Skip to content
      </a>
      <header
        data-area={area}
        className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md print:hidden"
      >
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            ref={menuButton}
            type="button"
            aria-expanded={drawer}
            aria-controls="studio-drawer"
            onClick={() => setDrawer(true)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-text lg:hidden"
          >
            <Menu aria-hidden className="size-5" />
            <span className="sr-only">Menu</span>
          </button>
          <Link href="/admin" className="flex shrink-0 items-center gap-3 rounded-lg py-1">
            {brand}
            <span aria-hidden className="hidden h-6 w-px bg-line-strong sm:block" />
            <span className="sr-only text-sm font-medium tracking-wide text-accent sm:not-sr-only">
              Studio
            </span>
          </Link>
          <Context group={active?.group} site={area === "overview" ? null : site} />
          <div className="ms-auto shrink-0">
            <AccountMenu user={user} />
          </div>
        </div>
        {/* The section's colour, as a hairline under the top bar. */}
        <span
          aria-hidden
          className="absolute inset-x-0 -bottom-px h-px bg-[linear-gradient(90deg,var(--area),transparent_70%)] opacity-70"
        />
      </header>

      <div className="flex">
        <aside
          data-compact={compact || undefined}
          className={cn(
            "sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col border-e border-line bg-bg-elevated transition-[width] duration-200 ease-out-expo motion-reduce:transition-none lg:flex print:hidden",
            compact ? "w-[4.5rem]" : "w-64",
          )}
        >
          <SidebarNav
            groups={groups}
            pathname={pathname}
            search={search}
            compact={compact}
            onExpand={() => store(COMPACT_KEY, "0")}
          />
          <SidebarFooter site={site} compact={compact} onToggle={toggleCompact} />
        </aside>

        <dialog
          id="studio-drawer"
          ref={dialog}
          aria-label="Studio menu"
          onClose={() => {
            setDrawer(false);
            menuButton.current?.focus();
          }}
          onClick={(e) => e.target === e.currentTarget && setDrawer(false)}
          className="fb-studio-drawer fixed inset-y-0 start-0 m-0 h-dvh max-h-none w-[min(20rem,88vw)] max-w-none flex-col border-e border-line bg-bg-elevated p-0 text-text backdrop:bg-black/55 open:flex lg:hidden"
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
            <span className="text-sm font-medium text-muted">Studio</span>
            <button
              type="button"
              onClick={() => setDrawer(false)}
              className="inline-flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-text"
            >
              <X aria-hidden className="size-5" />
              <span className="sr-only">Close menu</span>
            </button>
          </div>
          {drawer && (
            <SidebarNav
              groups={groups}
              pathname={pathname}
              search={search}
              compact={false}
              onNavigate={() => setDrawer(false)}
            />
          )}
          <SidebarFooter site={site} compact={false} />
        </dialog>

        <main id="studio-main" data-area={area} className="min-w-0 flex-1">
          {/* Only the content area eases in on a new page; the shell stays put. */}
          <div key={pathname} className="fb-studio-enter mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/** Where you are: the section (with its colour) and the website being worked on. */
function Context({ group, site }: { group?: NavGroup; site: NavSite | null }) {
  if (!group) return null;
  const Icon = ICONS[group.id];
  return (
    <p className="hidden min-w-0 items-center gap-2 text-sm md:flex" data-studio-context="">
      <span aria-hidden className="h-6 w-px bg-line-strong" />
      <Icon aria-hidden className="size-4 shrink-0 text-area" />
      <span className="truncate font-medium text-text">{group.label}</span>
      {site && (
        <>
          <span aria-hidden className="text-subtle">
            /
          </span>
          <span className="truncate text-muted">{site.name}</span>
        </>
      )}
    </p>
  );
}

function SidebarNav({
  groups,
  pathname,
  search,
  compact,
  onExpand,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  search: string;
  compact: boolean;
  onExpand?: () => void;
  onNavigate?: () => void;
}) {
  const uid = useId();
  const active = activeLink(groups, pathname, search);
  const key = `${pathname}?${search}`;
  // One main tab open at a time: the current page's, until another is chosen.
  const [open, setOpen] = useState<Area | null>(active?.group.id ?? null);
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setOpen(active?.group.id ?? null);
  }

  return (
    <nav aria-label="Admin" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
      <ul className="space-y-1">
        {groups.map((group) => {
          const Icon = ICONS[group.id];
          const current = active?.group.id === group.id;
          const row = cn(
            "group/row relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-colors duration-150",
            current ? "font-medium text-text" : "text-muted hover:bg-surface-2/70 hover:text-text",
            current && (group.href || compact) && "bg-surface-2",
          );
          const icon = (
            <span
              aria-hidden
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                current ? "bg-area/15 text-area" : "text-subtle group-hover/row:text-area",
              )}
            >
              <Icon className="size-4" />
            </span>
          );
          if (group.href) {
            return (
              <li key={group.id} data-area={group.id}>
                <Link
                  href={group.href}
                  aria-current={current ? "page" : undefined}
                  aria-label={compact ? group.label : undefined}
                  title={compact ? group.label : undefined}
                  onClick={onNavigate}
                  className={row}
                >
                  <Indicator on={current} />
                  {icon}
                  {!compact && <span className="truncate">{group.label}</span>}
                </Link>
              </li>
            );
          }
          const expanded = open === group.id && !compact;
          const panel = `${uid}-${group.id}`;
          return (
            <li key={group.id} data-area={group.id} data-group={group.id}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panel}
                aria-label={compact ? group.label : undefined}
                title={compact ? group.label : undefined}
                onClick={() => {
                  if (compact) {
                    onExpand?.();
                    setOpen(group.id);
                  } else setOpen((o) => (o === group.id ? null : group.id));
                }}
                className={row}
              >
                <Indicator on={current && !expanded} />
                {icon}
                {!compact && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{group.label}</span>
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0 text-subtle transition-transform duration-200 motion-reduce:transition-none",
                        expanded && "rotate-180",
                      )}
                    />
                  </>
                )}
              </button>
              <div
                id={panel}
                inert={!expanded}
                className={cn(
                  // Hidden once closed (visibility switches at the end of the transition).
                  "grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out-expo motion-reduce:transition-none",
                  expanded ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
                )}
              >
                <ul className="min-h-0 overflow-hidden ps-10">
                  {group.links.map((link) => (
                    <SubLink
                      key={link.href}
                      link={link}
                      active={active?.link ?? null}
                      onNavigate={onNavigate}
                    />
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function contains(link: NavLink, target: NavLink | null): boolean {
  return !!target && (link === target || (link.children ?? []).some((c) => contains(c, target)));
}

function SubLink({
  link,
  active,
  onNavigate,
  nested = false,
}: {
  link: NavLink;
  active: NavLink | null;
  onNavigate?: () => void;
  nested?: boolean;
}) {
  const current = link === active;
  // A website's own tools show while you're working on that website.
  const showChildren = !!link.children?.length && contains(link, active);
  return (
    <li>
      <Link
        href={link.href}
        aria-current={current ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "relative flex items-center gap-2 rounded-lg px-3 text-sm transition-colors duration-150",
          nested ? "min-h-9" : "min-h-10",
          current
            ? "bg-surface-2 font-medium text-text"
            : showChildren
              ? "font-medium text-text hover:bg-surface-2/70"
              : "text-muted hover:bg-surface-2/70 hover:text-text",
        )}
      >
        <Indicator on={current} />
        <span className="min-w-0 flex-1 truncate">{link.label}</span>
        {link.note && (
          // The icon keeps names readable in the narrow sidebar; the words are for screen readers and on hover.
          <span title={link.note} className="inline-flex shrink-0 items-center text-subtle">
            <Clock aria-hidden className="size-3.5" />
            <span className="sr-only">{link.note}</span>
          </span>
        )}
      </Link>
      {showChildren && (
        <ul className="my-1 ms-3 border-s border-line ps-2">
          {link.children!.map((child) => (
            <SubLink key={child.href} link={child} active={active} onNavigate={onNavigate} nested />
          ))}
        </ul>
      )}
    </li>
  );
}

/** The section-coloured bar beside the current item (shape as well as colour). */
function Indicator({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute start-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-area transition-[opacity,transform] duration-200 motion-reduce:transition-none",
        on ? "scale-y-100 opacity-100" : "scale-y-50 opacity-0",
      )}
    />
  );
}

function SidebarFooter({
  site,
  compact,
  onToggle,
}: {
  site: NavSite | null;
  compact: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-t border-line p-3",
        compact ? "justify-center" : "justify-between",
      )}
    >
      {site && !compact && (
        <Link href={`/admin/sites/${site.slug}`} className="min-w-0 rounded-lg px-2 py-1 hover:bg-surface-2">
          <span className="block text-xs text-subtle">Selected website</span>
          <span className="block truncate text-sm font-medium text-text">{site.name}</span>
        </Link>
      )}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={compact}
          title={compact ? "Expand sidebar" : "Collapse sidebar"}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-text"
        >
          {compact ? (
            <PanelLeftOpen aria-hidden className="size-5" />
          ) : (
            <PanelLeftClose aria-hidden className="size-5" />
          )}
          <span className="sr-only">Compact sidebar</span>
        </button>
      )}
    </div>
  );
}
