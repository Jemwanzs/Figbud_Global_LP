import type { Locale } from "@figbud/i18n";
import { PageBlocks } from "@figbud/site-kit";
import { Container } from "@figbud/ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import { getCorporatePage, localizedHrefs } from "@/lib/corporate-pages";
import { pageMetadata } from "@/lib/site";

import { Breadcrumbs } from "./breadcrumbs";
import { InProgressPage } from "./in-progress-page";
import { PageHeader } from "./page-header";

/** The Studio paths of the legal pages (the `figbud` website's pages). */
export const LEGAL_PATHS = ["legal/privacy", "legal/terms", "legal/cookies"] as const;
type LegalPath = (typeof LEGAL_PATHS)[number];

/**
 * Metadata for a legal page: indexed only once its text, reviewed by legal
 * counsel, is published in the Studio without "Hide from search engines".
 */
export async function legalMetadata(
  locale: Locale,
  path: LegalPath,
  copy: { title: string; description: string },
): Promise<Metadata> {
  const studio = await getCorporatePage(path);
  return pageMetadata({
    locale,
    path: `/${path}`,
    title: studio?.seo_title || copy.title,
    description: studio?.seo_description || copy.description,
    published: Boolean(studio && !studio.seo_noindex),
  });
}

/**
 * A legal page: the policy published in the Studio (Websites → FigBud Global
 * → Pages), or a holding notice until counsel's text is published. `children`
 * (such as the factual cookie list) follows either.
 */
export async function LegalPage({
  locale,
  dict,
  path,
  title,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  path: LegalPath;
  title: string;
  children?: ReactNode;
}) {
  const studio = await getCorporatePage(path);
  if (!studio)
    return (
      <InProgressPage
        locale={locale}
        dict={dict}
        path={`/${path}`}
        title={title}
        body={dict.pages.legalPending}
      >
        {children}
      </InProgressPage>
    );
  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            locale={locale}
            label={dict.common.breadcrumb}
            items={[
              { label: dict.common.nav.home, path: "/" },
              { label: studio.title, path: `/${path}` },
            ]}
          />
        }
        title={studio.title}
      />
      <Container size="wide" className="py-section-sm">
        <div className="max-w-4xl">
          <PageBlocks document={studio} firstHeading={2} resolveHref={localizedHrefs(locale)} />
          {children}
        </div>
      </Container>
    </>
  );
}
