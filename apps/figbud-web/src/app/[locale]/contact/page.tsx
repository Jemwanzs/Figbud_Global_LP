import { localizePath } from "@figbud/i18n";
import { EnquiryForm } from "@figbud/site-kit/enquiry-form";
import { Container } from "@figbud/ui";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { resolvePage } from "@/lib/page";
import { getClosedEnquiries, getCorporateEnquiryForm } from "@/lib/products";
import { localizedMetadata } from "@/lib/locales";
import { apiOrigin, routes } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.contact;
  return await localizedMetadata({
    locale,
    path: routes.contact,
    title: page.title,
    description: page.description,
  });
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.contact;
  const closed = await getClosedEnquiries();
  // The Studio's form settings (UI-EF3); its wording applies to English pages,
  // other languages keep theirs (as with hero text).
  const published = await getCorporateEnquiryForm();
  const config =
    published && locale !== "en" ? { ...published, labels: {}, hints: {}, texts: {} } : published;

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            locale={locale}
            label={dict.common.breadcrumb}
            items={[
              { label: dict.common.nav.home, path: routes.home },
              { label: dict.common.nav.contact, path: routes.contact },
            ]}
          />
        }
        eyebrow={page.eyebrow}
        title={page.title}
        lead={page.lead}
      />
      {/* The two-stage form (owner's brief, 14 Nov 2026): one card, who you are, then the details. */}
      <Container size="wide" className="py-section-sm">
        {/* The form reads ?kind=&product= from the URL, which is request-time data. */}
        <Suspense fallback={<div className="fb-panel h-[46rem] rounded-[var(--radius-panel)]" aria-hidden />}>
          <EnquiryForm
            locale={locale}
            copy={dict.form}
            closed={closed}
            privacyHref={localizePath(locale, routes.privacy)}
            apiOrigin={apiOrigin}
            stages={dict.formStages}
            config={config}
            form="figbud"
          />
        </Suspense>
        <section aria-labelledby="contact-next-title" className="mt-section-sm">
          <span aria-hidden className="fb-heading-accent" />
          <h2 id="contact-next-title" className="text-xl font-medium text-text">
            {page.nextTitle}
          </h2>
          {/* Three steps joined by a hairline: across on wide screens, down on phones. */}
          <ol className="fb-next-steps mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
            {page.nextSteps.map((step, i) => (
              <li key={step.title} className="relative flex gap-5 md:flex-col md:gap-4">
                <span className="relative z-[1] inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg font-mono text-sm text-accent">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-medium text-text">{step.title}</span>
                  <span className="mt-1 block leading-relaxed text-muted">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-10 border-t border-line pt-6 text-sm text-subtle">{page.privacyNote}</p>
        </section>
      </Container>
    </>
  );
}
