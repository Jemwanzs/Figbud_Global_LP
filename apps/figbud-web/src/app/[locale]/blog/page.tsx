import type { Metadata } from "next";

import { InProgressPage } from "@/components/in-progress-page";
import { resolvePage } from "@/lib/page";
import { pageMetadata } from "@/lib/site";

// Scheduled for Phase 3 (see docs/ROADMAP.md). Not indexed until published.
export async function generateMetadata({ params }: PageProps<"/[locale]/blog">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.blog;
  return pageMetadata({
    locale,
    path: "/blog",
    title: page.title,
    description: page.description,
    published: false,
  });
}

export default async function BlogPage({ params }: PageProps<"/[locale]/blog">) {
  const { locale, dict } = await resolvePage(params);
  return (
    <InProgressPage locale={locale} dict={dict} title={dict.pages.blog.title} lead={dict.pages.blog.lead} />
  );
}
