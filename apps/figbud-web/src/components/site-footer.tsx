import { publicProducts } from "@figbud/brand";
import { type Locale, localizePath } from "@figbud/i18n";
import { Container, FigBudWordmark } from "@figbud/ui";
import { BrandLogo, type BrandProfile } from "@figbud/site-kit";
import { ArrowUpRight } from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";

import type { Dictionary } from "@/i18n/get-dictionary";
import { productLink, routes } from "@/lib/site";

async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export async function SiteFooter({
  locale,
  dict,
  brand,
}: {
  locale: Locale;
  dict: Dictionary;
  /** The published FigBud Global brand profile, if any. */
  brand?: BrandProfile | null;
}) {
  const { footer, common } = dict;
  const year = await currentYear();

  const companyLinks = [
    { label: common.nav.about, path: routes.about },
    { label: common.nav.blog, path: routes.blog },
    { label: common.nav.contact, path: routes.contact },
  ];
  const legalLinks = [
    { label: footer.privacy, path: routes.privacy },
    { label: footer.terms, path: routes.terms },
    { label: footer.cookies, path: routes.cookies },
  ];

  return (
    <footer className="relative border-t border-line">
      <Container size="wide" className="grid gap-12 py-16 md:grid-cols-12 md:py-20">
        <div className="md:col-span-5">
          <Link href={localizePath(locale)} className="inline-block rounded-lg" aria-label="FigBud Global">
            <BrandLogo
              pair={brand?.logos.horizontal}
              height={brand?.logo_height ?? 28}
              maxWidth={190}
              alt="FigBud Global"
              fallback={<FigBudWordmark />}
            />
          </Link>
          <p className="mt-6 max-w-sm text-lg leading-relaxed text-text">{footer.tagline}</p>
        </div>

        <FooterColumn title={footer.productsTitle} className="md:col-span-3">
          {publicProducts.map((product) => {
            const link = productLink(product.slug, locale);
            return (
              <li key={product.slug} data-product={product.slug}>
                <a
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener" : undefined}
                  className="group inline-flex min-h-11 items-center gap-2 text-muted transition-colors hover:text-text"
                >
                  <span aria-hidden className="size-1.5 rounded-full bg-product" />
                  {product.name}
                  {product.status === "coming_soon" && (
                    <span className="text-xs text-subtle">· {common.status.coming_soon}</span>
                  )}
                  {link.external && (
                    <>
                      <ArrowUpRight
                        aria-hidden
                        className="size-3.5 opacity-60 transition-opacity group-hover:opacity-100"
                      />
                      <span className="sr-only">({common.opensInNewTab})</span>
                    </>
                  )}
                </a>
              </li>
            );
          })}
        </FooterColumn>

        <FooterColumn title={footer.companyTitle} className="md:col-span-2">
          {companyLinks.map((link) => (
            <li key={link.path}>
              <Link
                href={localizePath(locale, link.path)}
                className="inline-flex min-h-11 items-center text-muted transition-colors hover:text-text"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </FooterColumn>

        <FooterColumn title={footer.legalTitle} className="md:col-span-2">
          {legalLinks.map((link) => (
            <li key={link.path}>
              <Link
                href={localizePath(locale, link.path)}
                className="inline-flex min-h-11 items-center text-muted transition-colors hover:text-text"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </FooterColumn>
      </Container>

      <Container size="wide">
        <div className="flex flex-col gap-3 border-t border-line py-8 text-sm text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} FigBud Global. {footer.rights}
          </p>
          <p>{footer.origin}</p>
        </div>
      </Container>
    </footer>
  );
}

function FooterColumn({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <h2 className="text-xs font-medium tracking-[0.16em] text-subtle uppercase">{title}</h2>
      <ul className="mt-4 space-y-0.5">{children}</ul>
    </div>
  );
}
