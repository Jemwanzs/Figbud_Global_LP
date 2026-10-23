import { isLocale } from "@figbud/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

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
import { getPublicProducts } from "@/lib/products";
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

  return (
    <>
      <Hero locale={locale} dict={dict} />
      {/* Each boundary hydrates as its own task, keeping the main thread responsive. */}
      <Suspense>
        <PlatformsSection locale={locale} dict={dict} products={await getPublicProducts()} />
      </Suspense>
      <Suspense>
        <PhilosophySection locale={locale} dict={dict} />
      </Suspense>
      <Suspense>
        <AfricaSection locale={locale} dict={dict} />
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
