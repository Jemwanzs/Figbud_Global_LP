import { type Locale, localizePath } from "@figbud/i18n";
import { Container, buttonClasses } from "@figbud/ui";
import { ArrowLeft, ArrowRight, Search, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ArticleCard } from "@/components/blog/article-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getArticles, getCategories } from "@/lib/cms";
import { fill } from "@/lib/format";
import { resolvePage } from "@/lib/page";
import { pageMetadata, routes } from "@/lib/site";

const PER_PAGE = 12;

// Indexed only once at least one article is published: an empty blog is not a page worth ranking.
export async function generateMetadata({ params }: PageProps<"/[locale]/blog">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.blog;
  const latest = await getArticles({ locale, perPage: 1 });
  return pageMetadata({
    locale,
    path: routes.blog,
    title: page.title,
    description: page.description,
    published: latest.ok && latest.data.total > 0,
  });
}

export default async function BlogPage({ params, searchParams }: PageProps<"/[locale]/blog">) {
  const { locale, dict } = await resolvePage(params);
  const copy = dict.pages.blog;
  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            locale={locale}
            label={dict.common.breadcrumb}
            items={[
              { label: dict.common.nav.home, path: routes.home },
              { label: dict.common.nav.blog, path: routes.blog },
            ]}
          />
        }
        eyebrow={copy.eyebrow}
        title={copy.title}
        lead={copy.lead}
      />
      <Container size="wide" className="py-section-sm">
        <Suspense fallback={<ResultsSkeleton />}>
          <BlogResults locale={locale} dict={dict} searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() || undefined;
}

async function BlogResults({
  locale,
  dict,
  searchParams,
}: {
  locale: Locale;
  dict: Dictionary;
  searchParams: PageProps<"/[locale]/blog">["searchParams"];
}) {
  const copy = dict.pages.blog;
  const query = await searchParams;
  const category = one(query.category);
  const tag = one(query.tag);
  const q = one(query.q)?.slice(0, 100);
  const page = Math.max(1, Math.min(1000, Number.parseInt(one(query.page) ?? "1", 10) || 1));

  const [articles, categories] = await Promise.all([
    getArticles({ locale, category, tag, q, page, perPage: PER_PAGE }),
    getCategories(locale),
  ]);
  const blogPath = localizePath(locale, routes.blog);
  const filtered = Boolean(category || tag || q);

  const href = (next: { category?: string; tag?: string; q?: string; page?: number }) => {
    const search = new URLSearchParams();
    if (next.category) search.set("category", next.category);
    if (next.tag) search.set("tag", next.tag);
    if (next.q) search.set("q", next.q);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    const qs = search.toString();
    return qs ? `${blogPath}?${qs}` : blogPath;
  };

  if (!articles.ok) {
    return <Notice title={copy.unavailableTitle} body={copy.unavailableBody} />;
  }

  // No articles at all yet: an honest empty state, no filters to play with.
  if (!filtered && articles.data.total === 0) {
    return (
      <Notice title={copy.emptyTitle} body={copy.emptyBody}>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href={localizePath(locale, routes.products)} className={buttonClasses("primary", "md")}>
            {dict.common.cta.exploreProducts}
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </Link>
          <Link href={localizePath(locale, routes.contact)} className={buttonClasses("secondary", "md")}>
            {dict.common.cta.letsTalk}
          </Link>
        </div>
      </Notice>
    );
  }

  const topics = categories.ok ? categories.data.filter((c) => c.article_count > 0) : [];
  const { items, total_pages: totalPages } = articles.data;

  return (
    <div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        {topics.length > 0 && (
          <nav aria-label={copy.topicsLabel}>
            <ul className="flex flex-wrap gap-2">
              <TopicLink href={href({ q })} active={!category}>
                {copy.allTopics}
              </TopicLink>
              {topics.map((topic) => (
                <TopicLink
                  key={topic.slug}
                  href={href({ category: topic.slug, q })}
                  active={category === topic.slug}
                >
                  {topic.name}
                </TopicLink>
              ))}
            </ul>
          </nav>
        )}
        <form role="search" action={blogPath} className="relative w-full lg:max-w-sm">
          {category && <input type="hidden" name="category" value={category} />}
          <label htmlFor="blog-search" className="sr-only">
            {copy.searchLabel}
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-subtle"
          />
          <input
            id="blog-search"
            type="search"
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder={copy.searchPlaceholder}
            className="min-h-12 w-full rounded-full border border-line-strong bg-surface ps-11 pe-24 text-text placeholder:text-subtle"
          />
          <button
            type="submit"
            className="absolute end-1.5 top-1/2 min-h-9 -translate-y-1/2 rounded-full bg-surface-2 px-4 text-sm font-medium text-text hover:bg-surface-3"
          >
            {copy.searchButton}
          </button>
        </form>
      </div>

      {filtered && (
        <p className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted" aria-live="polite">
          {q && <span>{fill(copy.resultsFor, { q })}</span>}
          {tag && <span>{fill(copy.taggedWith, { tag })}</span>}
          <Link
            href={blogPath}
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent hover:underline"
          >
            <X aria-hidden className="size-4" />
            {copy.clearFilters}
          </Link>
        </p>
      )}

      {items.length === 0 ? (
        <Notice title={copy.noResultsTitle} body={copy.noResultsBody} />
      ) : (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((article) => (
            <li key={article.slug} className="flex">
              <ArticleCard locale={locale} copy={copy} article={article} />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav
          aria-label={copy.pagination}
          className="mt-12 flex items-center justify-between gap-4 border-t border-line pt-6"
        >
          {page > 1 ? (
            <Link
              href={href({ category, tag, q, page: page - 1 })}
              rel="prev"
              className={buttonClasses("secondary", "md")}
            >
              <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
              {copy.previous}
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm text-subtle">
            {fill(copy.pageOf, { page: String(page), total: String(totalPages) })}
          </p>
          {page < totalPages ? (
            <Link
              href={href({ category, tag, q, page: page + 1 })}
              rel="next"
              className={buttonClasses("secondary", "md")}
            >
              {copy.next}
              <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function TopicLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={
          active
            ? "inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-ink"
            : "inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm text-muted transition-colors hover:border-line-strong hover:text-text"
        }
      >
        {children}
      </Link>
    </li>
  );
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mt-10 rounded-[var(--radius-panel)] border border-dashed border-line-strong p-8 sm:p-12">
      <h2 className="font-display text-title font-semibold text-text">{title}</h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted">{body}</p>
      {children}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-hidden className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="fb-panel h-72 rounded-[var(--radius-panel)]" />
      ))}
    </div>
  );
}
