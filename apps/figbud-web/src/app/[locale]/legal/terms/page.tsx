import type { Metadata } from "next";

import { InProgressPage } from "@/components/in-progress-page";
import { resolvePage } from "@/lib/page";
import { pageMetadata } from "@/lib/site";

// Scheduled for Phase 3 (see docs/ROADMAP.md). Not indexed until published.
export async function generateMetadata({ params }: PageProps<"/[locale]/legal/terms">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.terms;
  return pageMetadata({
    locale,
    path: "/legal/terms",
    title: page.title,
    description: page.description,
    published: false,
  });
}

export default async function TermsPage({ params }: PageProps<"/[locale]/legal/terms">) {
  const { locale, dict } = await resolvePage(params);
  return (
    <InProgressPage
      locale={locale}
      dict={dict}
      path="/legal/terms"
      title={dict.pages.terms.title}
      body={dict.pages.legalPending}
    />
  );
}
