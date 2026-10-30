import type { Metadata } from "next";

import { LegalPage, legalMetadata } from "@/components/legal-page";
import { resolvePage } from "@/lib/page";

// Published from the Studio once legal counsel's text is approved; until then
// a holding notice that isn't indexed.
export async function generateMetadata({ params }: PageProps<"/[locale]/legal/privacy">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  return legalMetadata(locale, "legal/privacy", dict.pages.privacy);
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/legal/privacy">) {
  const { locale, dict } = await resolvePage(params);
  return <LegalPage locale={locale} dict={dict} path="legal/privacy" title={dict.pages.privacy.title} />;
}
