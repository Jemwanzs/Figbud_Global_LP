import "server-only";

import type { Locale } from "@figbud/i18n";
import { cacheLife, cacheTag } from "next/cache";

import { apiOrigin } from "./site";

/**
 * Read-only client for the Blog & Insights API (services/api, `/v1/articles`).
 *
 * Results are cached briefly so pages stay static and fast; every call
 * resolves (never throws) so a slow or unreachable API degrades to an
 * honest "unavailable" state instead of breaking the build or the page.
 *
 * `API_INTERNAL_URL` (server-only) lets the server reach the API over a
 * private network; browsers never use it.
 */
const base = (process.env.API_INTERNAL_URL ?? apiOrigin).replace(/\/$/, "");
const TIMEOUT_MS = 5000;

export interface TermRef {
  slug: string;
  name: string;
}

export interface ArticleSummary {
  slug: string;
  title: string;
  excerpt: string;
  cover_image?: { url: string; alt: string };
  category?: TermRef;
  tags: TermRef[];
  author?: { slug: string; name: string; role?: string };
  published_at: string;
  reading_minutes: number;
}

export interface ArticlePage {
  items: ArticleSummary[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface Article extends ArticleSummary {
  updated_at: string;
  seo_title: string;
  seo_description: string;
  /** Rendered and sanitised by the API: raw HTML escaped, unsafe URLs removed. */
  body_html: string;
  headings: { id: string; text: string; level: number }[];
  related: ArticleSummary[];
}

export interface TermCount extends TermRef {
  description?: string;
  article_count: number;
}

export type Result<T> = { ok: true; data: T } | { ok: false };

export interface ArticleQuery {
  locale: Locale;
  category?: string;
  tag?: string;
  q?: string;
  page?: number;
  perPage?: number;
}

async function request<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<Result<T> | "not_found"> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  try {
    const response = await fetch(`${base}${path}?${search}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 404) return "not_found";
    if (!response.ok) return { ok: false };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false };
  }
}

export async function getArticles(query: ArticleQuery): Promise<Result<ArticlePage>> {
  "use cache";
  cacheLife("minutes");
  cacheTag("cms");
  const result = await request<ArticlePage>("/v1/articles", {
    locale: query.locale,
    category: query.category,
    tag: query.tag,
    q: query.q,
    page: query.page,
    per_page: query.perPage,
  });
  return result === "not_found" ? { ok: false } : result;
}

/** `null` when no published article has this slug in this locale. */
export async function getArticle(locale: Locale, slug: string): Promise<Result<Article> | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("cms");
  const result = await request<Article>(`/v1/articles/${encodeURIComponent(slug)}`, { locale });
  return result === "not_found" ? null : result;
}

export async function getCategories(locale: Locale): Promise<Result<TermCount[]>> {
  "use cache";
  cacheLife("minutes");
  cacheTag("cms");
  const result = await request<TermCount[]>("/v1/categories", { locale });
  return result === "not_found" ? { ok: false } : result;
}

/** Every published slug in a locale, for static params and the sitemap. */
export async function getPublishedSlugs(locale: Locale): Promise<string[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("cms");
  const slugs: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const result = await getArticles({ locale, page, perPage: 50 });
    if (!result.ok) break;
    slugs.push(...result.data.items.map((a) => a.slug));
    if (page >= result.data.total_pages) break;
  }
  return slugs;
}
