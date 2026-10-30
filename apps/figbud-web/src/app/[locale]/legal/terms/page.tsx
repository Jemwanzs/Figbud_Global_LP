import type { Metadata } from "next";

import { LegalPage, legalMetadata } from "@/components/legal-page";
import { resolvePage } from "@/lib/page";

// Published from the Studio once legal counsel's text is approved; until then
// a holding notice that isn't indexed.
export async function generateMetadata({ params }: PageProps<"/[locale]/legal/terms">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  return legalMetadata(locale, "legal/terms", dict.pages.terms);
}

export default async function TermsPage({ params }: PageProps<"/[locale]/legal/terms">) {
  const { locale, dict } = await resolvePage(params);
  return <LegalPage locale={locale} dict={dict} path="legal/terms" title={dict.pages.terms.title} />;
}
