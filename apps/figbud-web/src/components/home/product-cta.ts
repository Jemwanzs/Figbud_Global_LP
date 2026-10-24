import type { Product } from "@figbud/brand";
import type { Locale } from "@figbud/i18n";

import type { Dictionary } from "@/i18n/get-dictionary";
import { fill } from "@/lib/format";
import { type ProductLink, productLink } from "@/lib/site";

/**
 * Where a product links to and what the call to action says: the waitlist
 * for coming-soon products, otherwise the product website (or its section on
 * the Products page until the website has a destination).
 */
export function productCta(
  { slug, name, status }: Product,
  locale: Locale,
  common: Dictionary["common"],
  exploreLabel: string,
): { link: ProductLink; label: string } {
  const link = productLink(slug, locale, status);
  const label =
    status === "coming_soon"
      ? common.cta.joinWaitlist
      : link.external
        ? fill(common.cta.visitSite, { product: name })
        : fill(exploreLabel, { product: name });
  return { link, label };
}
