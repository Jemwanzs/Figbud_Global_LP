import type { Metadata } from "next";

import { InProgressPage } from "@/components/in-progress-page";
import { resolvePage } from "@/lib/page";
import { pageMetadata } from "@/lib/site";

// Scheduled for Phase 3 (see docs/ROADMAP.md). Not indexed until published.
export async function generateMetadata({ params }: PageProps<"/[locale]/legal/privacy">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.privacy;
  return pageMetadata({
    locale,
    path: "/legal/privacy",
    title: page.title,
    description: page.description,
    published: false,
  });
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/legal/privacy">) {
  const { locale, dict } = await resolvePage(params);
  return (
    <InProgressPage
      locale={locale}
      dict={dict}
      title={dict.pages.privacy.title}
      body={dict.pages.legalPending}
    />
  );
}
