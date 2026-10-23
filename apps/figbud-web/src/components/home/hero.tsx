import { type Locale, localizePath } from "@figbud/i18n";
import { Container, Eyebrow, buttonClasses } from "@figbud/ui";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/i18n/get-dictionary";
import { routes } from "@/lib/site";

import { EcosystemVisual } from "./ecosystem-visual";

export function Hero({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const hero = dict.home.hero;
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <HeroBackdrop />
      <Container
        size="wide"
        className="grid items-center gap-14 pt-10 pb-20 sm:pt-14 lg:grid-cols-12 lg:gap-8 lg:pt-20 lg:pb-28 xl:gap-12"
      >
        <div className="lg:col-span-6">
          <Eyebrow className="fb-rise">{hero.eyebrow}</Eyebrow>
          {/* The headline is the LCP element: rendered immediately, never animated in. */}
          <h1 id="hero-title" className="mt-6 font-display text-display font-semibold text-text">
            <span className="block">{hero.titleLead}</span>
            <span className="fb-text-gradient block pb-1">{hero.titleAccent}</span>
          </h1>
          <p className="fb-rise mt-6 max-w-xl text-lead text-muted" style={{ animationDelay: "120ms" }}>
            {hero.lead}
          </p>
          <div
            className="fb-rise mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
            style={{ animationDelay: "200ms" }}
          >
            <Link href={`${localizePath(locale)}#platforms`} className={buttonClasses("primary", "lg")}>
              {dict.common.cta.exploreProducts}
              <ArrowRight
                aria-hidden
                className="size-4 transition-transform group-hover/btn:translate-x-0.5 rtl:rotate-180"
              />
            </Link>
            <Link href={localizePath(locale, routes.contact)} className={buttonClasses("secondary", "lg")}>
              {dict.common.cta.talkToTeam}
            </Link>
          </div>
          <ul
            className="fb-rise mt-10 flex flex-col gap-3 text-sm text-muted sm:flex-row sm:flex-wrap sm:gap-x-6"
            style={{ animationDelay: "280ms" }}
          >
            {hero.pillars.map((pillar) => (
              <li key={pillar} className="flex items-center gap-2">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Check aria-hidden className="size-3" strokeWidth={3} />
                </span>
                {pillar}
              </li>
            ))}
          </ul>
        </div>

        <div className="fb-rise lg:col-span-6" style={{ animationDelay: "160ms" }}>
          <EcosystemVisual
            labels={hero.visual}
            status={dict.common.status}
            caption={dict.common.syntheticData}
          />
        </div>
      </Container>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute end-[-10%] -top-40 h-[42rem] w-[42rem] rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)]" />
      <div className="absolute start-[-20%] top-[30%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(closest-side,rgb(166_101_56/0.12),transparent)]" />
      <div className="fb-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_60%_30%,black,transparent_75%)] opacity-60" />
    </div>
  );
}
