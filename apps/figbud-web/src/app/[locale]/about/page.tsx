import type { Metadata } from "next";

import { InProgressPage } from "@/components/in-progress-page";
import { resolvePage } from "@/lib/page";
import { pageMetadata, routes } from "@/lib/site";

// Scheduled for Phase 3 (see docs/ROADMAP.md). Not indexed until published.
export async function generateMetadata({ params }: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.about;
  return pageMetadata({
    locale,
    path: "/about",
    title: page.title,
    description: page.description,
    published: false,
  });
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale, dict } = await resolvePage(params);
  return (
    <InProgressPage
      locale={locale}
      dict={dict}
      path={routes.about}
      title={dict.pages.about.title}
      lead={dict.pages.about.lead}
    />
  );
}
