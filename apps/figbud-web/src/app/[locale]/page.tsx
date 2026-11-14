import { isLocale, localeInfo, localizePath } from "@figbud/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CampaignSlot, type HomeSection, JsonLd, sectionTones, websiteLd } from "@figbud/site-kit";

import { HeroSlot } from "@/components/home/heroes/hero-slot";
import {
  AfricaSection,
  CompanySection,
  CustomerProofSection,
  EngineerSection,
  FinalCtaSection,
  PhilosophySection,
  PlatformsSection,
  TrustedBySection,
} from "@/components/home/sections";
import { getDictionary } from "@/i18n/get-dictionary";
import {
  getBrands,
  getHero,
  getMapProducts,
  getProductRotation,
  getShowcase,
  getProof,
  getPublicProducts,
  getSectionThemes,
} from "@/lib/products";
import { localizedMetadata } from "@/lib/locales";
import { siteOrigin } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return await localizedMetadata({ locale, path: "/", description: dict.meta.description });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const [products, mapProducts, brands, rotation, showcase, proof, hero, themes] = await Promise.all([
    getPublicProducts(),
    getMapProducts(),
    getBrands(),
    getProductRotation(),
    getShowcase(),
    getProof(),
    getHero(),
    getSectionThemes(),
  ]);
  // Alternating bands (UI-TH6): the hero follows the global theme, Our Platforms
  // takes the opposite, and the sections on the page alternate from there.
  // Trusted By is its own band (owner's brief, 14 Nov 2026), once a published
  // organisation has a logo to show.
  const present: HomeSection[] = [
    "platforms",
    ...(proof.organizations.some((o) => o.logo) ? (["trusted"] as const) : []),
    "philosophy",
    "africa",
    "engineer",
    ...(proof.metrics.length || proof.testimonials.length ? (["proof"] as const) : []),
    "company",
    "closing",
  ];
  const tone = sectionTones(present, themes);

  return (
    <>
      <JsonLd
        data={websiteLd(dict.meta.siteName, `${siteOrigin}${localizePath(locale)}`, localeInfo[locale].tag)}
      />
      <CampaignSlot
        placement="home_hero"
        className="mx-auto block w-full max-w-[92rem] px-5 pt-page-top sm:px-8 md:px-10 lg:px-16"
      />
      <HeroSlot hero={hero} locale={locale} dict={dict} products={products} brands={brands} />
      {/* Each boundary hydrates as its own task, keeping the main thread responsive. */}
      <Suspense>
        <PlatformsSection
          tone={tone.platforms}
          locale={locale}
          dict={dict}
          products={products}
          brands={brands}
          rotation={rotation}
          showcase={showcase}
        />
      </Suspense>
      <Suspense>
        <TrustedBySection tone={tone.trusted} locale={locale} dict={dict} proof={proof} />
      </Suspense>
      <Suspense>
        <PhilosophySection tone={tone.philosophy} locale={locale} dict={dict} />
      </Suspense>
      <Suspense>
        <AfricaSection
          tone={tone.africa}
          locale={locale}
          dict={dict}
          products={mapProducts}
          brands={brands}
        />
      </Suspense>
      <Suspense>
        <EngineerSection tone={tone.engineer} locale={locale} dict={dict} />
      </Suspense>
      <Suspense>
        <CustomerProofSection tone={tone.proof} locale={locale} dict={dict} proof={proof} />
      </Suspense>
      <Suspense>
        <CompanySection tone={tone.company} locale={locale} dict={dict} />
      </Suspense>
      <Suspense>
        <FinalCtaSection tone={tone.closing} locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
