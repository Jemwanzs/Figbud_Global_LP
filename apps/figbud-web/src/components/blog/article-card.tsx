import { type Locale, localeInfo, localizePath } from "@figbud/i18n";
import Link from "next/link";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { ArticleSummary } from "@/lib/cms";
import { fill, formatDate } from "@/lib/format";
import { routes } from "@/lib/site";

/** One article in a listing; the whole card is a single link target. */
export function ArticleCard({
  locale,
  copy,
  article,
  headingLevel = "h2",
}: {
  locale: Locale;
  copy: Dictionary["pages"]["blog"];
  article: ArticleSummary;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const href = localizePath(locale, `${routes.blog}/${article.slug}`);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface transition-colors hover:border-line-strong has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-[var(--focus)]">
      {article.cover_image && (
        <div className="aspect-[16/9] overflow-hidden border-b border-line bg-surface-2">
          {/* Remote cover images vary by host; a fixed ratio box prevents layout shift. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.cover_image.url}
            alt={article.cover_image.alt}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-6 sm:p-7">
        {article.category && <p className="text-sm font-medium text-accent">{article.category.name}</p>}
        <Heading className="mt-3 text-xl font-semibold tracking-tight text-text">
          <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
            {article.title}
          </Link>
        </Heading>
        <p className="mt-3 line-clamp-3 leading-relaxed text-muted">{article.excerpt}</p>
        <p className="mt-auto pt-6 text-sm text-subtle">
          <time dateTime={article.published_at}>
            {formatDate(article.published_at, localeInfo[locale].tag)}
          </time>
          <span aria-hidden> · </span>
          {fill(copy.readingTime, { minutes: String(article.reading_minutes) })}
        </p>
      </div>
    </article>
  );
}
