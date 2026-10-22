import { type Locale, localizePath } from "@figbud/i18n";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { siteOrigin } from "@/lib/site";

export interface Crumb {
  label: string;
  /** Locale-agnostic path, e.g. `/products`. */
  path: string;
}

/**
 * Visible breadcrumb trail plus matching BreadcrumbList structured data.
 * The last crumb is the current page: rendered as text with `aria-current`.
 */
export function Breadcrumbs({ locale, label, items }: { locale: Locale; label: string; items: Crumb[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      item: `${siteOrigin}${localizePath(locale, item.path)}`,
    })),
  };

  return (
    <nav aria-label={label} className="fb-rise">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-subtle">
        {items.map((item, i) => {
          const current = i === items.length - 1;
          return (
            <li key={item.path} className="flex items-center gap-1.5">
              {current ? (
                <span aria-current="page" className="text-muted">
                  {item.label}
                </span>
              ) : (
                <>
                  <Link
                    href={localizePath(locale, item.path)}
                    className="-mx-1 inline-flex min-h-11 items-center rounded-md px-1 transition-colors hover:text-text"
                  >
                    {item.label}
                  </Link>
                  <ChevronRight aria-hidden className="size-3.5 rtl:rotate-180" />
                </>
              )}
            </li>
          );
        })}
      </ol>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }}
      />
    </nav>
  );
}
