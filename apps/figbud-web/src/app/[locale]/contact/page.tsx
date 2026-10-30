import { localizePath } from "@figbud/i18n";
import { Container } from "@figbud/ui";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { EnquiryForm } from "@/components/contact/enquiry-form";
import { PageHeader } from "@/components/page-header";
import { resolvePage } from "@/lib/page";
import { getClosedEnquiries } from "@/lib/products";
import { pageMetadata, routes } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.contact;
  return pageMetadata({ locale, path: routes.contact, title: page.title, description: page.description });
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.contact;
  const closed = await getClosedEnquiries();

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
      <Container size="wide" className="grid gap-10 py-section-sm lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-7">
          {/* The form reads ?kind=&product= from the URL, which is request-time data. */}
          <Suspense
            fallback={<div className="fb-panel h-[52rem] rounded-[var(--radius-panel)]" aria-hidden />}
          >
            <EnquiryForm
              locale={locale}
              copy={dict.form}
              closed={closed}
              privacyHref={localizePath(locale, routes.privacy)}
            />
          </Suspense>
        </div>
        <aside className="lg:col-span-5 lg:pt-4" aria-labelledby="contact-next-title">
          <h2 id="contact-next-title" className="text-xl font-medium text-text">
            {page.nextTitle}
          </h2>
          <ol className="mt-8 space-y-8">
            {page.nextSteps.map((step, i) => (
              <li key={step.title} className="flex gap-5">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-sm text-accent">
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
        </aside>
      </Container>
    </>
  );
}
