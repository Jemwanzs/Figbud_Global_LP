import { productSites } from "@figbud/brand";
import { isLocale, localizePath, locales } from "@figbud/i18n";
import { enquiryLink, linkProps } from "@figbud/site-kit";
import { Container, Eyebrow, buttonClasses } from "@figbud/ui";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDictionary, pageMetadata } from "@/lib/site";

/** Every navigation page that isn't built yet: honest placeholders, never dead links, never indexed. */
const sections = productSites.zirahr.nav.filter((item) => item.path !== "/");

/** Unknown sections wait for the full render, so they answer with a real 404 (not a 200 shell). */
export const ensureStatic = "navigation";

export async function generateStaticParams() {
  return locales.flatMap((locale) => sections.map((item) => ({ locale, section: item.path.slice(1) })));
}

async function resolve(params: PageProps<"/[locale]/[section]">["params"]) {
  const { locale, section } = await params;
  const item = sections.find((s) => s.path === `/${section}`);
  if (!isLocale(locale) || !item) notFound();
  return { locale, item, dict: getDictionary(locale) };
}

export async function generateMetadata({ params }: PageProps<"/[locale]/[section]">): Promise<Metadata> {
  const { locale, item, dict } = await resolve(params);
  return pageMetadata({
    locale,
    path: item.path,
    title: dict.header.nav[item.key],
    description: dict.meta.description,
    published: false,
  });
}

export default async function SectionPage({ params }: PageProps<"/[locale]/[section]">) {
  const { locale, item, dict } = await resolve(params);
  return (
    <Container size="wide" className="py-20 sm:py-28">
      <Eyebrow>{dict.section.eyebrow}</Eyebrow>
      <h1 className="mt-5 font-display text-display font-semibold text-text">{dict.header.nav[item.key]}</h1>
      <p className="mt-6 max-w-2xl text-lead text-muted">{dict.section.body}</p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <a {...linkProps(enquiryLink("zirahr", locale))} className={buttonClasses("product", "lg")}>
          {dict.header.cta}
          <ArrowUpRight aria-hidden className="size-4 rtl:-scale-x-100" />
          <span className="sr-only">({dict.header.opensInNewTab})</span>
        </a>
        <Link href={localizePath(locale)} className={buttonClasses("secondary", "lg")}>
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          {dict.section.back}
        </Link>
      </div>
    </Container>
  );
}
