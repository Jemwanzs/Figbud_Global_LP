import { type Locale, localizePath } from "@figbud/i18n";
import { Container, buttonClasses } from "@figbud/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/i18n/get-dictionary";

import { Breadcrumbs } from "./breadcrumbs";
import { PageHeader } from "./page-header";

/**
 * Placeholder for pages scheduled in a later roadmap phase. These pages are
 * excluded from the sitemap and marked `noindex` until their content ships.
 */
export function InProgressPage({
  locale,
  dict,
  path,
  title,
  lead,
  body,
}: {
  locale: Locale;
  dict: Dictionary;
  /** Locale-agnostic path of this page, for its breadcrumb trail. */
  path: string;
  title: string;
  lead?: string;
  body?: string;
}) {
  const copy = dict.pages.inProgress;
  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            locale={locale}
            label={dict.common.breadcrumb}
            items={[
              { label: dict.common.nav.home, path: "/" },
              { label: title, path },
            ]}
          />
        }
        eyebrow={copy.eyebrow}
        title={title}
        lead={lead}
      />
      <Container size="wide" className="py-16 sm:py-20">
        <p className="max-w-2xl leading-relaxed text-muted">{body ?? copy.body}</p>
        <Link href={localizePath(locale)} className={buttonClasses("secondary", "md", "mt-8")}>
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          {copy.back}
        </Link>
      </Container>
    </>
  );
}
