import { isLocale } from "@figbud/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CampaignSlot } from "@figbud/site-kit";

import { Hero } from "@/components/home/hero";
import {
  AfricaSection,
  CompanySection,
  EngineerSection,
  FinalCtaSection,
  PhilosophySection,
  PlatformsSection,
} from "@/components/home/sections";
import { getDictionary } from "@/i18n/get-dictionary";
import { getBrands, getMapProducts, getPublicProducts } from "@/lib/products";
import { pageMetadata } from "@/lib/site";

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
  const [products, mapProducts, brands] = await Promise.all([
    getPublicProducts(),
    getMapProducts(),
    getBrands(),
  ]);

  return (
    <>
      <CampaignSlot
        placement="home_hero"
        className="mx-auto block w-full max-w-[92rem] px-5 pt-page-top sm:px-8 md:px-10 lg:px-16"
      />
      <Hero locale={locale} dict={dict} products={products} brands={brands} />
      {/* Each boundary hydrates as its own task, keeping the main thread responsive. */}
      <Suspense>
        <PlatformsSection locale={locale} dict={dict} products={products} brands={brands} />
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
        <CompanySection locale={locale} dict={dict} />
      </Suspense>
      <Suspense>
        <FinalCtaSection locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
