import { Reveal, buttonClasses, cn } from "@figbud/ui";
import { ArrowRight, ArrowUpRight, Mail, Phone } from "lucide-react";
import type { ReactNode } from "react";

import type { FooterSocialNetwork } from "./brand";

/*
 * One footer for every FigBud website (owner's brief, 7 Nov 2026): a call to
 * action on a contrasting panel, the identity column (logo, tagline, short
 * description, contact, verified profiles), titled link columns and a compact
 * bottom bar. Each website supplies its own content and branding; this only
 * lays it out. It follows the global theme through the design tokens, and the
 * panel takes the opposite theme like every contrasting surface.
 */

export const SOCIAL_NAMES: Record<FooterSocialNetwork, string> = {
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
};

export interface FooterLinkItem {
  label: string;
  href: string;
  /** Another website: opens in a new tab, with an arrow. */
  external?: boolean;
  /** A short status after the label, such as "Coming soon". */
  badge?: string;
  /** A product's colour dot (`data-product`). */
  product?: string;
}

export interface FooterColumnSpec {
  title: string;
  links: FooterLinkItem[];
  /** After the links, such as the cookie settings button. */
  extra?: ReactNode;
}

export interface FooterCtaSpec {
  heading: string;
  body?: string | null;
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterLayoutProps {
  /** The website's logo, linking home. */
  identity: ReactNode;
  tagline?: string | null;
  description?: string | null;
  cta?: FooterCtaSpec | null;
  columns: FooterColumnSpec[];
  /** Always shown, even when the columns are hidden. */
  legal: FooterColumnSpec;
  contact?: { email?: string | null; phone?: string | null };
  social?: { network: FooterSocialNetwork; href: string }[];
  /** Hide the identity and link columns; the legal links and copyright stay. */
  hidden?: boolean;
  copyright: string;
  /** Beside the copyright, such as "ZiraHR is a product of FigBud Global." */
  note?: ReactNode;
  labels: { opensInNewTab: string; contact: string; social: string; links: string };
}

const COLUMNS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

const linkClass =
  "group/link inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm text-muted transition-colors duration-200 hover:text-text focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none";

function FooterLink({ link, newTab }: { link: FooterLinkItem; newTab: string }) {
  return (
    <a
      href={link.href}
      target={link.external ? "_blank" : undefined}
      rel={link.external ? "noopener" : undefined}
      className={linkClass}
    >
      {link.product && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-product" />}
      <span className="transition-transform duration-200 group-hover/link:translate-x-0.5 rtl:group-hover/link:-translate-x-0.5">
        {link.label}
      </span>
      {link.badge && (
        <span className="rounded-full border border-line px-2 py-0.5 text-[0.7rem] leading-none text-subtle">
          {link.badge}
        </span>
      )}
      {link.external && (
        <>
          <ArrowUpRight
            aria-hidden
            className="size-3.5 opacity-60 transition-[opacity,translate] duration-200 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 group-hover/link:opacity-100 rtl:-scale-x-100"
          />
          <span className="sr-only">({newTab})</span>
        </>
      )}
    </a>
  );
}

function FooterColumn({ column, newTab }: { column: FooterColumnSpec; newTab: string }) {
  return (
    <div data-footer-column={column.title}>
      <h2 className="text-xs font-medium tracking-[0.16em] text-subtle uppercase">{column.title}</h2>
      <ul className="mt-3 space-y-0.5">
        {column.links.map((link) => (
          <li key={`${link.href}-${link.label}`} data-product={link.product}>
            <FooterLink link={link} newTab={newTab} />
          </li>
        ))}
        {column.extra && <li>{column.extra}</li>}
      </ul>
    </div>
  );
}

export function FooterLayout({
  identity,
  tagline,
  description,
  cta,
  columns,
  legal,
  contact,
  social = [],
  hidden = false,
  copyright,
  note,
  labels,
}: FooterLayoutProps) {
  const all = [...columns, legal];
  const phoneHref = contact?.phone ? `tel:${contact.phone.replace(/\s+/g, "")}` : null;
  return (
    <footer className="relative mt-section-sm">
      {cta && (
        <div
          data-footer-cta=""
          className="mx-auto mb-section-sm max-w-[92rem] px-5 sm:px-8 md:px-10 lg:px-16"
        >
          <Reveal>
            {/* The opposite theme to the page, like every contrasting surface. */}
            <section
              data-tone="inverse"
              aria-labelledby="footer-cta-title"
              className="fb-cta-panel relative isolate grid items-center gap-6 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-bg px-6 py-9 text-text shadow-[var(--shadow-elevated)] sm:px-10 sm:py-10 lg:grid-cols-[1fr_auto] lg:gap-10 lg:px-14"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -end-24 -top-28 -z-10 size-[26rem] rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)]"
              />
              <div
                aria-hidden
                className="fb-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_70%_90%_at_100%_0%,black,transparent)] opacity-40"
              />
              <div className="max-w-2xl">
                <h2
                  id="footer-cta-title"
                  className="font-display text-2xl font-semibold tracking-tight text-balance text-text sm:text-3xl"
                >
                  {cta.heading}
                </h2>
                {cta.body && <p className="mt-3 text-muted sm:text-lg">{cta.body}</p>}
              </div>
              <a
                href={cta.href}
                target={cta.external ? "_blank" : undefined}
                rel={cta.external ? "noopener" : undefined}
                className={buttonClasses("primary", "lg", "w-full justify-center sm:w-auto")}
              >
                {cta.label}
                <ArrowRight
                  aria-hidden
                  className="size-4 transition-transform duration-200 group-hover/btn:translate-x-1 rtl:rotate-180 rtl:group-hover/btn:-translate-x-1"
                />
                {cta.external && <span className="sr-only">({labels.opensInNewTab})</span>}
              </a>
            </section>
          </Reveal>
        </div>
      )}

      <div className="border-t border-line">
        <div className="mx-auto max-w-[92rem] px-5 sm:px-8 md:px-10 lg:px-16">
          {!hidden && (
            <div className="grid gap-10 py-12 lg:grid-cols-12 lg:gap-8 lg:py-14">
              <div className="lg:col-span-4">
                {identity}
                {tagline && <p className="mt-5 font-display text-lg font-medium text-text">{tagline}</p>}
                {description && (
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
                )}
                {(contact?.email || phoneHref) && (
                  <ul aria-label={labels.contact} className="mt-5 space-y-0.5">
                    {contact?.email && (
                      <li>
                        <a href={`mailto:${contact.email}`} className={linkClass}>
                          <Mail aria-hidden className="size-4 text-subtle" />
                          {contact.email}
                        </a>
                      </li>
                    )}
                    {phoneHref && (
                      <li>
                        <a href={phoneHref} className={linkClass}>
                          <Phone aria-hidden className="size-4 text-subtle" />
                          <span dir="ltr">{contact!.phone}</span>
                        </a>
                      </li>
                    )}
                  </ul>
                )}
                {social.length > 0 && (
                  <ul aria-label={labels.social} className="mt-5 flex flex-wrap gap-2">
                    {social.map((profile) => (
                      <li key={profile.network}>
                        <a
                          href={profile.href}
                          target="_blank"
                          rel="noopener me"
                          className="group/social inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm text-muted transition-colors duration-200 hover:border-accent/50 hover:text-text focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
                        >
                          {SOCIAL_NAMES[profile.network]}
                          <ArrowUpRight
                            aria-hidden
                            className="size-3.5 transition-transform duration-200 group-hover/social:translate-x-0.5 group-hover/social:-translate-y-0.5 rtl:-scale-x-100"
                          />
                          <span className="sr-only">({labels.opensInNewTab})</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {/* One landmark for every column; each column is a heading and its list. */}
              <nav
                aria-label={labels.links}
                className={cn(
                  "grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:col-span-8",
                  COLUMNS[Math.min(all.length, 4)],
                )}
              >
                {all.map((column) => (
                  <FooterColumn key={column.title} column={column} newTab={labels.opensInNewTab} />
                ))}
              </nav>
            </div>
          )}

          <div
            className={cn(
              "flex flex-col gap-3 py-6 text-sm text-subtle sm:flex-row sm:items-center sm:justify-between",
              !hidden && "border-t border-line",
            )}
          >
            <p>{copyright}</p>
            {hidden ? (
              <ul data-footer-column={legal.title} className="flex flex-wrap items-center gap-x-5">
                {legal.links.map((link) => (
                  <li key={link.href}>
                    <FooterLink link={link} newTab={labels.opensInNewTab} />
                  </li>
                ))}
                {legal.extra && <li>{legal.extra}</li>}
              </ul>
            ) : (
              note && <p>{note}</p>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
