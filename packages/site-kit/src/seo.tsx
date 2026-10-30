import type { PageDocument } from "./blocks";

/**
 * Search identity of a website (Studio → Websites → SEO & search
 * visibility; services/api/src/seo.rs `public()`), and JSON-LD built only
 * from facts shown on the page: no ratings, reviews, offers or prices.
 */
export interface SiteSeo {
  /** With `%s` for the page title, e.g. "%s · ZiraHR". */
  title_template?: string | null;
  default_description?: string | null;
  google_verification?: string | null;
  bing_verification?: string | null;
  /** Verified official profiles. */
  same_as?: string[];
  languages?: string[];
  /** Off while a website is prepared: every page is `noindex`. */
  indexing?: boolean;
}

/** `metadata.verification` from a website's tags (Search Console, Bing). */
export function verificationMeta(seo?: SiteSeo | null) {
  if (!seo?.google_verification && !seo?.bing_verification) return undefined;
  return {
    ...(seo.google_verification ? { google: seo.google_verification } : {}),
    ...(seo.bing_verification ? { other: { "msvalidate.01": seo.bing_verification } } : {}),
  };
}

type Thing = Record<string, unknown>;

/** FigBud Global as publisher (the parent organisation of every product). */
export function organizationLd(origin: string, sameAs: string[] = []): Thing {
  return {
    "@type": "Organization",
    name: "FigBud Global",
    url: origin,
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function websiteLd(name: string, url: string, language = "en"): Thing {
  return { "@context": "https://schema.org", "@type": "WebSite", name, url, inLanguage: language };
}

/** A FigBud product as a web application (no offers or ratings: none are published). */
export function softwareApplicationLd({
  name,
  description,
  url,
  publisher,
  sameAs = [],
}: {
  name: string;
  description?: string | null;
  url: string;
  publisher: Thing;
  sameAs?: string[];
}): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    ...(description ? { description } : {}),
    url,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    publisher,
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function breadcrumbLd(items: { name: string; url: string }[]): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

const strip = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** The page's visible questions and answers, or null when it has none. */
export function faqLd(document: PageDocument): Thing | null {
  const items = document.sections
    .filter((s) => !s.hidden && s.type === "faq")
    .flatMap((s) => (s.type === "faq" ? s.items : []))
    .map((item) => {
      const answer =
        "answer_html" in item && typeof item.answer_html === "string" ? strip(item.answer_html) : "";
      return { question: item.question, answer };
    })
    .filter((i) => i.question && i.answer);
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}

/** Structured data as a script tag (`<` escaped so content can't close it). */
export function JsonLd({ data }: { data: Thing | Thing[] | null }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
