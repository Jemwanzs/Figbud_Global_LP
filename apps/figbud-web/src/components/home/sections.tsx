import type { Product } from "@figbud/brand";
import type { BrandProfile } from "@figbud/site-kit";
import { type Locale, localizePath } from "@figbud/i18n";
import { Container, Eyebrow, Reveal, buttonClasses } from "@figbud/ui";
import { ArrowRight, Calculator, Cable, ChartSpline, ShieldCheck, Workflow } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/i18n/get-dictionary";
import { routes } from "@/lib/site";

import { AfricaMap } from "./africa-map";
import { PlatformShowcase } from "./platform-showcase";
import { WorkflowDemo } from "./workflow-demo";

type SectionProps = { locale: Locale; dict: Dictionary };

function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  className?: string;
}) {
  return (
    <Reveal className={className}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="mt-5 max-w-3xl font-display text-headline font-semibold text-text">
        {title}
      </h2>
      {lead && <p className="mt-5 max-w-2xl text-lead text-muted">{lead}</p>}
    </Reveal>
  );
}

export function PlatformsSection({
  locale,
  dict,
  products,
  brands,
}: SectionProps & { products: Product[]; brands: Record<string, BrandProfile | null> }) {
  const platforms = dict.home.platforms;
  return (
    <section id="platforms" aria-labelledby="platforms-title" className="relative py-20 sm:py-24 lg:py-32">
      <Container size="wide">
        <SectionHeading
          id="platforms-title"
          eyebrow={platforms.eyebrow}
          title={platforms.title}
          lead={platforms.lead}
        />
        <Reveal delay={0.1} className="mt-12 lg:mt-16">
          <PlatformShowcase
            locale={locale}
            platforms={platforms}
            products={dict.products}
            items={products}
            brands={brands}
            common={dict.common}
          />
        </Reveal>
      </Container>
    </section>
  );
}

export function PhilosophySection({ dict }: SectionProps) {
  const philosophy = dict.home.philosophy;
  return (
    <section
      aria-labelledby="philosophy-title"
      className="relative border-y border-line bg-bg-elevated/50 py-20 sm:py-24 lg:py-32"
    >
      <Container>
        <SectionHeading id="philosophy-title" eyebrow={philosophy.eyebrow} title={philosophy.title} />
        <ol className="mt-14 lg:mt-20">
          {philosophy.items.map((item, i) => (
            <li key={item.title} className="border-t border-line last:border-b">
              <Reveal delay={i * 0.06} className="grid gap-4 py-8 md:grid-cols-12 md:gap-8 md:py-12">
                <span className="font-mono text-sm text-accent md:col-span-1 md:pt-2">0{i + 1}</span>
                <h3 className="font-display text-title font-medium text-text md:col-span-5">{item.title}</h3>
                <p className="leading-relaxed text-muted md:col-span-6 md:pt-1.5 md:text-lg">{item.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function AfricaSection({
  locale,
  dict,
  products,
  brands,
}: SectionProps & { products: Product[]; brands: Record<string, BrandProfile | null> }) {
  const africa = dict.home.africa;
  return (
    <section aria-labelledby="africa-title" className="relative overflow-hidden py-20 sm:py-24 lg:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute end-[-15%] top-1/2 -z-10 h-[46rem] w-[46rem] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] opacity-60"
      />
      <Container size="wide" className="grid items-center gap-14 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <SectionHeading
            id="africa-title"
            eyebrow={africa.eyebrow}
            title={africa.title}
            lead={africa.lead}
          />
          <Reveal delay={0.1}>
            <dl className="mt-10 divide-y divide-line border-y border-line">
              {africa.facts.map((fact) => (
                <div key={fact.label} className="grid gap-1 py-4 sm:grid-cols-[8rem_1fr] sm:gap-6">
                  <dt className="text-sm text-subtle">{fact.label}</dt>
                  <dd className="text-text">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
        <Reveal delay={0.05} className="mx-auto w-full max-w-xl lg:col-span-7 lg:max-w-none lg:ps-8">
          <AfricaMap
            locale={locale}
            labels={{
              label: africa.mapLabel,
              startingPoint: africa.startingPoint,
              originTagline: africa.originTagline,
              productsLabel: africa.productsLabel,
              explore: dict.home.hero.visual.explore,
            }}
            common={dict.common}
            copy={dict.products}
            products={products}
            brands={brands}
          />
          <p className="mt-4 text-center text-xs text-subtle">{africa.mapNote}</p>
        </Reveal>
      </Container>
    </section>
  );
}

const capabilityIcons = {
  workflow: Workflow,
  finance: Calculator,
  integrations: Cable,
  security: ShieldCheck,
  analytics: ChartSpline,
} as const;

export function EngineerSection({ dict }: SectionProps) {
  const engineer = dict.home.engineer;
  return (
    <section
      aria-labelledby="engineer-title"
      className="relative border-t border-line py-20 sm:py-24 lg:py-32"
    >
      <Container size="wide" className="grid gap-14 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <SectionHeading
              id="engineer-title"
              eyebrow={engineer.eyebrow}
              title={engineer.title}
              lead={engineer.lead}
            />
            <Reveal delay={0.1} className="mt-10">
              <WorkflowDemo copy={engineer.workflow} />
            </Reveal>
          </div>
        </div>
        <ul className="lg:col-span-7 lg:pt-4">
          {engineer.items.map((item, i) => {
            const Icon = capabilityIcons[item.key as keyof typeof capabilityIcons] ?? Workflow;
            return (
              <li key={item.key} className="border-b border-line first:border-t">
                <Reveal delay={i * 0.05} className="group flex gap-5 py-8 sm:gap-8 sm:py-10">
                  <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-accent transition-[transform,background-color,border-color] duration-500 ease-out-expo group-hover:-translate-y-0.5 group-hover:border-accent/40 group-hover:bg-accent-soft">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span>
                    <h3 className="text-xl font-medium tracking-tight text-text sm:text-2xl">{item.title}</h3>
                    <p className="mt-2 max-w-xl leading-relaxed text-muted">{item.body}</p>
                  </span>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

export function CompanySection({ locale, dict }: SectionProps) {
  const company = dict.home.company;
  return (
    <section
      aria-labelledby="company-title"
      className="relative border-t border-line py-20 sm:py-24 lg:py-32"
    >
      <Container size="wide" className="grid gap-16 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-7">
          <Eyebrow>{company.eyebrow}</Eyebrow>
          <h2 id="company-title" className="mt-5 font-display text-headline font-semibold text-text">
            {company.title}
          </h2>
          <p className="mt-6 max-w-xl text-lead text-muted">{company.body}</p>
          <Link
            href={localizePath(locale, routes.about)}
            className="group mt-8 inline-flex min-h-11 items-center gap-2 font-medium text-accent"
          >
            {company.cta}
            <ArrowRight
              aria-hidden
              className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
            />
          </Link>
        </Reveal>

        <Reveal delay={0.1} className="lg:col-span-5">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-xl font-medium text-text">{company.insightsTitle}</h3>
            <Link
              href={localizePath(locale, routes.blog)}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
            >
              {company.insightsCta}
              <ArrowRight aria-hidden className="size-3.5 rtl:rotate-180" />
            </Link>
          </div>
          <p className="mt-1 text-sm text-subtle">{company.insightsLead}</p>
          <ul className="mt-6 border-t border-line">
            {company.topics.map((topic) => (
              <li key={topic.title} className="border-b border-line">
                <Link
                  href={localizePath(locale, routes.blog)}
                  className="group flex items-center gap-4 py-5 transition-colors"
                >
                  <span className="flex-1">
                    <span className="block font-medium text-text transition-colors group-hover:text-accent">
                      {topic.title}
                    </span>
                    <span className="mt-1 block text-sm text-muted">{topic.body}</span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="size-4 text-subtle transition-transform group-hover:translate-x-1 group-hover:text-accent rtl:rotate-180 rtl:group-hover:-translate-x-1"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}

export function FinalCtaSection({ locale, dict }: SectionProps) {
  const cta = dict.home.finalCta;
  return (
    <section aria-labelledby="final-cta-title" className="pb-20 sm:pb-24 lg:pb-32">
      <Container size="wide">
        <Reveal className="relative isolate overflow-hidden rounded-[2rem] border border-line bg-surface px-6 py-16 text-center sm:px-12 sm:py-20 lg:py-28">
          <div aria-hidden className="absolute inset-0 -z-10">
            <div className="absolute start-1/2 top-0 h-[34rem] w-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] rtl:translate-x-1/2" />
            <div className="fb-grid absolute inset-0 [mask-image:radial-gradient(ellipse_60%_70%_at_50%_0%,black,transparent)] opacity-50" />
          </div>
          <h2
            id="final-cta-title"
            className="mx-auto max-w-4xl font-display text-headline font-semibold text-text"
          >
            <span className="block">{cta.titleLead}</span>
            <span className="fb-text-gradient block pb-1">{cta.titleAccent}</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lead text-muted">{cta.lead}</p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={localizePath(locale, routes.contact)} className={buttonClasses("primary", "lg")}>
              {dict.common.cta.talkToTeam}
              <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </Link>
            <Link href={localizePath(locale, routes.products)} className={buttonClasses("secondary", "lg")}>
              {dict.common.cta.exploreProducts}
            </Link>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
