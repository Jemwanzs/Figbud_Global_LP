import type { Metadata } from "next";

import { InProgressPage } from "@/components/in-progress-page";
import { resolvePage } from "@/lib/page";
import { pageMetadata } from "@/lib/site";

// Scheduled for Phase 3 (see docs/ROADMAP.md). Not indexed until published.
export async function generateMetadata({ params }: PageProps<"/[locale]/legal/cookies">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.cookies;
  return pageMetadata({
    locale,
    path: "/legal/cookies",
    title: page.title,
    description: page.description,
    published: false,
  });
}

export default async function CookiesPage({ params }: PageProps<"/[locale]/legal/cookies">) {
  const { locale, dict } = await resolvePage(params);
  return (
    <InProgressPage
      locale={locale}
      dict={dict}
      title={dict.pages.cookies.title}
      body={dict.pages.legalPending}
    />
  );
}
