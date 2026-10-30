import { isLocale, localizePath } from "@figbud/i18n";
import { enquiryLink, linkProps } from "@figbud/site-kit";
import { Container, Eyebrow, Reveal, buttonClasses } from "@figbud/ui";
import { ArrowRight, ArrowUpRight, CalendarCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDictionary, pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);
  return pageMetadata({ locale, path: "/", description: dict.meta.description });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const copy = dict.home;
  const demo = linkProps(enquiryLink("zirahr", locale));

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute end-[-10%] -top-40 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(closest-side,var(--product-soft),transparent)]" />
          <div className="fb-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_80%_at_70%_0%,black,transparent_75%)] opacity-50" />
        </div>
        <Container size="wide" className="pt-page-top pb-section">
          <Eyebrow className="fb-rise">{copy.eyebrow}</Eyebrow>
          <h1 className="mt-6 max-w-4xl font-display text-display font-semibold text-text">{copy.title}</h1>
          <p className="fb-rise mt-6 max-w-2xl text-lead text-muted" style={{ animationDelay: "120ms" }}>
            {copy.lead}
          </p>
          <div className="fb-rise mt-10 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "200ms" }}>
            <a {...demo} className={buttonClasses("product", "lg")}>
              {dict.header.cta}
              <ArrowUpRight aria-hidden className="size-4 rtl:-scale-x-100" />
              <span className="sr-only">({dict.header.opensInNewTab})</span>
            </a>
            <Link href={localizePath(locale, "/modules")} className={buttonClasses("secondary", "lg")}>
              {copy.secondaryCta}
              <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </Link>
          </div>
        </Container>
      </section>

      <section aria-labelledby="modules-title">
        <Container size="wide" className="py-section">
          <Reveal className="max-w-3xl">
            <h2 id="modules-title" className="font-display text-title font-semibold text-text">
              {copy.modulesTitle}
            </h2>
            <p className="mt-4 text-lead text-muted">{copy.modulesLead}</p>
          </Reveal>
          <ul className="mt-12 grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
            {copy.modules.map((module) => (
              <li key={module.title} className="bg-surface p-6 sm:p-7">
                <h3 className="font-semibold text-text">{module.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{module.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="payroll-title" className="border-y border-line bg-surface/40">
        <Container size="wide" className="grid gap-10 py-section lg:grid-cols-12 lg:items-center">
          <Reveal className="lg:col-span-7">
            <h2 id="payroll-title" className="font-display text-title font-semibold text-text">
              {copy.payrollTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-lead text-muted">{copy.payrollBody}</p>
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="final-title">
        <Container size="wide" className="py-section">
          <Reveal className="relative isolate overflow-hidden rounded-[2rem] border border-line bg-surface px-6 py-12 text-center sm:px-12 sm:py-16">
            <div
              aria-hidden
              className="pointer-events-none absolute start-1/2 top-0 -z-10 h-80 w-[48rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--product-soft),transparent)]"
            />
            <CalendarCheck aria-hidden className="mx-auto size-8 text-product-text" />
            <h2
              id="final-title"
              className="mx-auto mt-5 max-w-2xl font-display text-title font-semibold text-text"
            >
              {copy.finalTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">{copy.finalBody}</p>
            <a {...demo} className={buttonClasses("product", "lg", "mt-8")}>
              {dict.header.cta}
              <ArrowUpRight aria-hidden className="size-4 rtl:-scale-x-100" />
              <span className="sr-only">({dict.header.opensInNewTab})</span>
            </a>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
