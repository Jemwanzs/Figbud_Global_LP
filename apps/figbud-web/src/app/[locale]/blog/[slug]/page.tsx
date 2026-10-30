import { isLocale, localeInfo, localizePath } from "@figbud/i18n";
import { Container } from "@figbud/ui";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleCard } from "@/components/blog/article-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { type Article, getArticle, getPublishedSlugs } from "@/lib/cms";
import { fill, formatDate } from "@/lib/format";
import { resolvePage } from "@/lib/page";
import { pageMetadata, routes, siteOrigin } from "@/lib/site";

/**
 * Unknown slugs wait for the complete render instead of streaming a generic
 * shell, so a missing article answers with a real 404 status for crawlers.
 */
export const ensureStatic = "navigation";

/** Placeholder so the route still prerenders (and validates) before any article exists. */
const PLACEHOLDER = "__none__";

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const slugs = isLocale(params.locale) ? await getPublishedSlugs(params.locale) : [];
  return (slugs.length > 0 ? slugs : [PLACEHOLDER]).map((slug) => ({ slug }));
}

async function loadArticle(params: PageProps<"/[locale]/blog/[slug]">["params"]) {
  const [{ locale, dict }, { slug }] = await Promise.all([resolvePage(params), params]);
  const result = slug === PLACEHOLDER ? null : await getArticle(locale, slug);
  return { locale, dict, slug, result };
}

export async function generateMetadata({ params }: PageProps<"/[locale]/blog/[slug]">): Promise<Metadata> {
  const { locale, dict, slug, result } = await loadArticle(params);
  if (!result?.ok) {
    return { title: dict.pages.blog.title, robots: { index: false, follow: true } };
  }
  const article = result.data;
  const base = pageMetadata({
    locale,
    path: `${routes.blog}/${slug}`,
    title: article.seo_title,
    description: article.seo_description,
  });
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: article.published_at,
      modifiedTime: article.updated_at,
      authors: article.author ? [article.author.name] : undefined,
      tags: article.tags.map((t) => t.name),
      images: article.cover_image
        ? [{ url: article.cover_image.url, alt: article.cover_image.alt }]
        : undefined,
    },
  };
}

export default async function ArticlePage({ params }: PageProps<"/[locale]/blog/[slug]">) {
  const { locale, dict, slug, result } = await loadArticle(params);
  if (result === null) notFound();

  const copy = dict.pages.blog;
  const tag = localeInfo[locale].tag;
  const blogPath = localizePath(locale, routes.blog);

  if (!result.ok) {
    return (
      <Container size="prose" className="py-24">
        <h1 className="font-display text-title font-semibold text-text">{copy.unavailableTitle}</h1>
        <p className="mt-4 text-muted">{copy.unavailableBody}</p>
        <Link
          href={blogPath}
          className="mt-8 inline-flex min-h-11 items-center gap-2 font-medium text-accent"
        >
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          {copy.backToBlog}
        </Link>
      </Container>
    );
  }

  const article = result.data;
  const toc = article.headings.filter((h) => h.level === 2);
  const updated = article.updated_at.slice(0, 10) !== article.published_at.slice(0, 10);

  return (
    <>
      <article>
        <header className="border-b border-line">
          <Container size="wide" className="pt-page-top pb-section-sm">
            <div className="mb-8">
              <Breadcrumbs
                locale={locale}
                label={dict.common.breadcrumb}
                items={[
                  { label: dict.common.nav.home, path: routes.home },
                  { label: dict.common.nav.blog, path: routes.blog },
                  { label: article.title, path: `${routes.blog}/${slug}` },
                ]}
              />
            </div>
            <div className="max-w-3xl">
              {article.category && (
                <Link
                  href={`${blogPath}?category=${article.category.slug}`}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline"
                >
                  {article.category.name}
                </Link>
              )}
              <h1 className="mt-2 font-display text-page font-semibold text-balance text-text">
                {article.title}
              </h1>
              <p className="mt-6 text-lead text-muted">{article.excerpt}</p>
              <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-subtle">
                {article.author && (
                  <>
                    <span className="text-text">{fill(copy.byAuthor, { author: article.author.name })}</span>
                    {article.author.role && <span>{article.author.role}</span>}
                    <span aria-hidden className="max-sm:hidden">
                      ·
                    </span>
                  </>
                )}
                <time dateTime={article.published_at}>{formatDate(article.published_at, tag)}</time>
                <span aria-hidden className="max-sm:hidden">
                  ·
                </span>
                <span>{fill(copy.readingTime, { minutes: String(article.reading_minutes) })}</span>
                {updated && (
                  <>
                    <span aria-hidden className="max-sm:hidden">
                      ·
                    </span>
                    <span>{fill(copy.updated, { date: formatDate(article.updated_at, tag) })}</span>
                  </>
                )}
              </p>
            </div>
          </Container>
        </header>

        {article.cover_image && (
          <Container size="wide" className="pt-10">
            <div className="aspect-[16/9] overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={article.cover_image.url}
                alt={article.cover_image.alt}
                className="size-full object-cover"
              />
            </div>
          </Container>
        )}

        <Container size="wide" className="grid gap-10 py-section-sm lg:grid-cols-12">
          {toc.length >= 2 && (
            <aside className="lg:order-last lg:col-span-3" aria-labelledby="toc-title">
              <div className="lg:sticky lg:top-28">
                <h2 id="toc-title" className="text-sm font-medium text-subtle">
                  {copy.onThisPage}
                </h2>
                <ol className="mt-3 space-y-1 border-s border-line">
                  {toc.map((h) => (
                    <li key={h.id}>
                      <a
                        href={`#${h.id}`}
                        className="-ms-px flex min-h-11 items-center border-s border-transparent ps-4 text-sm text-muted hover:border-accent hover:text-text"
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          )}
          <div className="lg:col-span-8">
            {/* Rendered and sanitised by the API (raw HTML escaped, unsafe URLs removed). */}
            <div className="fb-prose" dangerouslySetInnerHTML={{ __html: article.body_html }} />

            {article.tags.length > 0 && (
              <ul
                className="mt-12 flex flex-wrap gap-2 border-t border-line pt-8"
                aria-label={copy.topicsLabel}
              >
                {article.tags.map((t) => (
                  <li key={t.slug}>
                    <Link
                      href={`${blogPath}?tag=${t.slug}`}
                      className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm text-muted hover:border-line-strong hover:text-text"
                    >
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Container>
      </article>

      {article.related.length > 0 && (
        <section aria-labelledby="related-title" className="border-t border-line">
          <Container size="wide" className="py-section-sm">
            <h2 id="related-title" className="font-display text-title font-semibold text-text">
              {copy.related}
            </h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {article.related.map((related) => (
                <li key={related.slug} className="flex">
                  <ArticleCard locale={locale} copy={copy} article={related} headingLevel="h3" />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            articleSchema(article, `${siteOrigin}${localizePath(locale, `${routes.blog}/${slug}`)}`, tag),
          ).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}

function articleSchema(article: Article, url: string, inLanguage: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.seo_description,
    url,
    mainEntityOfPage: url,
    inLanguage,
    datePublished: article.published_at,
    dateModified: article.updated_at,
    ...(article.cover_image ? { image: article.cover_image.url } : {}),
    ...(article.author ? { author: { "@type": "Person", name: article.author.name } } : {}),
    publisher: { "@type": "Organization", name: "FigBud Global", url: siteOrigin },
    keywords: article.tags.map((t) => t.name).join(", ") || undefined,
  };
}
