import { type Locale, localizePath } from "@figbud/i18n";
import { Container, buttonClasses } from "@figbud/ui";
import { ArrowRight, ArrowUpRight, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getArticles } from "@/lib/cms";
import { fill } from "@/lib/format";
import { resolvePage } from "@/lib/page";
import { getPublicProducts } from "@/lib/products";
import { searchEntries, siteEntries } from "@/lib/site-search";
import { pageMetadata, routes } from "@/lib/site";

// Search results are never indexed: they repeat pages that are.
export async function generateMetadata({ params }: PageProps<"/[locale]/search">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  return pageMetadata({
    locale,
    path: routes.search,
    title: dict.common.search.title,
    description: dict.common.search.lead,
    published: false,
  });
}

export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/search">) {
  const { locale, dict } = await resolvePage(params);
  const copy = dict.common.search;
  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            locale={locale}
            label={dict.common.breadcrumb}
            items={[
              { label: dict.common.nav.home, path: routes.home },
              { label: copy.title, path: routes.search },
            ]}
          />
        }
        title={copy.title}
        lead={copy.lead}
      />
      <Container size="wide" className="py-section-sm">
        <Suspense fallback={<SearchForm locale={locale} dict={dict} />}>
          <Results locale={locale} dict={dict} searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

function SearchForm({ locale, dict, q }: { locale: Locale; dict: Dictionary; q?: string }) {
  const copy = dict.common.search;
  return (
    <form role="search" action={localizePath(locale, routes.search)} className="relative max-w-2xl">
      <label htmlFor="site-search" className="sr-only">
        {copy.label}
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-subtle"
      />
      <input
        id="site-search"
        type="search"
        name="q"
        defaultValue={q}
        maxLength={100}
        placeholder={copy.placeholder}
        className="min-h-12 w-full rounded-full border border-line-strong bg-surface ps-11 pe-28 text-text placeholder:text-subtle"
      />
      <button
        type="submit"
        className="absolute end-1.5 top-1/2 min-h-9 -translate-y-1/2 rounded-full bg-surface-2 px-4 text-sm font-medium text-text hover:bg-surface-3"
      >
        {copy.button}
      </button>
    </form>
  );
}

async function Results({
  locale,
  dict,
  searchParams,
}: {
  locale: Locale;
  dict: Dictionary;
  searchParams: PageProps<"/[locale]/search">["searchParams"];
}) {
  const copy = dict.common.search;
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) || undefined;
  if (!q) {
    return (
      <>
        <SearchForm locale={locale} dict={dict} />
        <p className="mt-4 text-sm text-subtle">{copy.hint}</p>
      </>
    );
  }

  const [products, articles] = await Promise.all([
    getPublicProducts(),
    getArticles({ locale, q, page: 1, perPage: 10 }),
  ]);
  const pages = searchEntries(siteEntries(locale, dict, products), q);
  const found = articles.ok ? articles.data.items : [];

  return (
    <>
      <SearchForm locale={locale} dict={dict} q={q} />
      <p className="mt-6 text-sm text-muted" aria-live="polite">
        {fill(copy.resultsFor, { q })}
      </p>

      {pages.length === 0 && found.length === 0 ? (
        // Ends the page with its own next steps, so the footer doesn't add a call to action.
        <div className="mt-10 max-w-3xl" data-section="call_to_action">
          <h2 className="font-display text-title font-semibold text-text">{copy.noneTitle}</h2>
          <p className="mt-3 leading-7 text-muted">{copy.noneBody}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href={localizePath(locale, routes.products)} className={buttonClasses("primary", "md")}>
              {dict.common.cta.exploreProducts}
              <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </Link>
            <Link href={localizePath(locale, routes.blog)} className={buttonClasses("secondary", "md")}>
              {dict.common.nav.blog}
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-12 lg:grid-cols-2">
          {pages.length > 0 && (
            <section aria-labelledby="search-pages">
              <h2 id="search-pages" className="font-display text-title font-semibold text-text">
                {copy.pages}
              </h2>
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {pages.map((entry) => (
                  <li key={entry.href}>
                    <Link
                      href={entry.href}
                      className="group flex items-start justify-between gap-4 py-4 hover:text-text"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-text group-hover:underline">
                          {entry.title}
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-muted">{entry.description}</span>
                      </span>
                      {entry.external && (
                        <ArrowUpRight
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-subtle rtl:-scale-x-100"
                        />
                      )}
                      {entry.external && <span className="sr-only">({copy.external})</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {found.length > 0 && (
            <section aria-labelledby="search-articles">
              <h2 id="search-articles" className="font-display text-title font-semibold text-text">
                {copy.articles}
              </h2>
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {found.map((article) => (
                  <li key={article.slug}>
                    <Link
                      href={localizePath(locale, `${routes.blog}/${article.slug}`)}
                      className="group block py-4"
                    >
                      <span className="block font-medium text-text group-hover:underline">
                        {article.title}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-muted">{article.excerpt}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
