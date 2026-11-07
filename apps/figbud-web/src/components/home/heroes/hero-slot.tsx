import type { Product } from "@figbud/brand";
import type { Locale } from "@figbud/i18n";
import type { BrandProfile, PublishedHero } from "@figbud/site-kit";

import type { Dictionary } from "@/i18n/get-dictionary";

import { Hero } from "../hero";
import { CinematicHero } from "./cinematic-hero";
import { EditionHero } from "./edition-hero";
import { UniverseHero } from "./universe-hero";

/**
 * The corporate home page's hero: the variant published in the Hero Design
 * Studio, or Hero 01 (Connected Ecosystem) exactly as approved when none is.
 * The Studio preview renders this same component with a draft variant.
 */
export function HeroSlot({
  hero,
  ...props
}: {
  hero: Pick<PublishedHero, "design" | "config"> | null;
  locale: Locale;
  dict: Dictionary;
  products: Product[];
  brands: Record<string, BrandProfile | null>;
}) {
  if (hero?.design === "cinematic")
    return (
      <CinematicHero
        locale={props.locale}
        dict={props.dict}
        config={hero.config}
        brand={props.brands.figbud ?? null}
      />
    );
  if (hero?.design === "universe") return <UniverseHero {...props} config={hero.config} />;
  if (hero?.design === "edition") return <EditionHero {...props} config={hero.config} />;
  return <Hero {...props} config={hero?.design === "ecosystem" ? hero.config : undefined} />;
}
