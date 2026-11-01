import { isLocale, localeInfo, localizePath } from "@figbud/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CampaignSlot, JsonLd, websiteLd } from "@figbud/site-kit";

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
} from "@/lib/products";
import { pageMetadata, siteOrigin } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return pageMetadata({ locale, path: "/", description: dict.meta.description });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const [products, mapProducts, brands, rotation, showcase, proof, hero] = await Promise.all([
    getPublicProducts(),
    getMapProducts(),
    getBrands(),
    getProductRotation(),
    getShowcase(),
    getProof(),
    getHero(),
  ]);

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
          locale={locale}
          dict={dict}
          products={products}
          brands={brands}
          rotation={rotation}
          showcase={showcase}
        />
      </Suspense>
      <Suspense>
        <TrustedBySection locale={locale} dict={dict} proof={proof} />
      </Suspense>
      <Suspense>
        <PhilosophySection locale={locale} dict={dict} />
      </Suspense>
      <Suspense>
        <AfricaSection locale={locale} dict={dict} products={mapProducts} brands={brands} />
      </Suspense>
      <Suspense>
        <EngineerSection locale={locale} dict={dict} />
      </Suspense>
      <Suspense>
        <CustomerProofSection locale={locale} dict={dict} proof={proof} />
      </Suspense>
      <Suspense>
        <CompanySection locale={locale} dict={dict} />
      </Suspense>
      <Suspense>
        <FinalCtaSection locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
