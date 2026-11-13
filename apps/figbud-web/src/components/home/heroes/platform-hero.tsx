"use client";

import type { Product } from "@figbud/brand";
import { type Locale, localizePath } from "@figbud/i18n";
import {
  BrandLogo,
  type BrandProfile,
  type HeroConfig,
  ProductLogo,
  heroDepth,
  heroHeight,
  heroPace,
  useHeroMotion,
} from "@figbud/site-kit";
import { Container, StatusBadge, cn } from "@figbud/ui";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, useId } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import { productLink, routes } from "@/lib/site";

import { heroText } from "./hero-text";
import { PLATFORM_LOOKS, type PlatformDesign, SITE_PALETTE } from "./platform-looks";

/*
 * FigBud Global's platform heroes (owner's brief, 13 Nov 2026): Emerald
 * Innovation, Digital Future, Connected Ecosystem · Light, Enterprise Orbit
 * and Dark Enterprise. One component, each design its own look and picture:
 * a layered platform (stack), a glowing hub, or an orbit. Everything the
 * Studio sets (text, buttons, badges, products and their order, colours,
 * theme behaviour, motion) comes from the variant's settings; products,
 * their logos and their status come from the product registry and the
 * published brand profiles, never a separate list, and no figures are shown.
 * The headline renders at once (it's the LCP element); motion is decoration,
 * off for visitors who prefer reduced motion.
 */

/** Where the cards sit around the platform, in % of the picture (up to six). */
const SPOTS: [number, number][] = [
  [18, 14],
  [80, 18],
  [12, 58],
  [86, 62],
  [30, 88],
  [70, 90],
];

// Connected Ecosystem · Light keeps the right middle for its status card.
const SPOTS_BESIDE_STATUS: [number, number][] = [
  [18, 14],
  [72, 10],
  [12, 56],
  [26, 92],
  [66, 94],
  [36, 74],
];

type Shown = Product & { category: string; summary: string };

export function PlatformHero({
  design,
  locale,
  dict,
  config,
  products,
  brands,
}: {
  design: PlatformDesign;
  locale: Locale;
  dict: Dictionary;
  config: HeroConfig;
  products: Product[];
  brands: Record<string, BrandProfile | null>;
}) {
  const look = PLATFORM_LOOKS[design];
  const site = config.theme_mode === "site";
  const motion = useHeroMotion(config);
  const hero = dict.home.hero;
  const text = heroText(locale, config, {
    eyebrow: hero.eyebrow,
    headline: hero.titleLead,
    accent: hero.titleAccent,
    lead: hero.lead,
  });
  const badges = config.badges?.length ? config.badges : hero.pillars;
  const copy = dict.products as Record<string, { category: string; summary: string } | undefined>;
  // The Studio's choice and order, else every listed product.
  const chosen = config.products?.length
    ? config.products.flatMap((slug) => products.filter((p) => p.slug === slug))
    : products;
  const shown: Shown[] = chosen.slice(0, 6).map((p) => ({
    ...p,
    category: copy[p.slug]?.category ?? "",
    summary: copy[p.slug]?.summary ?? "",
  }));
  const colours = { ...(site ? SITE_PALETTE : look.palette), ...config.palette };
  const scheme = site ? undefined : look.scheme;
  const style = {
    "--ph-bg": colours.background,
    "--ph-bg-2": colours.background_2,
    "--ph-heading": colours.heading,
    "--ph-accent": colours.accent,
    "--ph-text": colours.text,
    "--ph-button": colours.button,
    "--ph-button-text": colours.button_text,
    "--ph-card": colours.card,
    "--ph-card-border": colours.card_border,
    "--ph-glow": colours.glow,
    "--ph-depth": heroDepth(config),
    "--ph-pace": heroPace(config),
  } as CSSProperties;

  return (
    <section
      aria-labelledby="hero-title"
      data-hero-design={design}
      // Its own look keeps its intended theme inside, whatever the visitor chose.
      data-theme={scheme}
      data-motion={motion ? "on" : "off"}
      style={style}
      className={cn("fb-platform-hero relative isolate overflow-hidden", heroHeight(config))}
    >
      <Backdrop design={design} />
      <Container
        size="wide"
        className={cn(
          "grid items-center gap-12 pt-page-top pb-section-sm lg:grid-cols-12 lg:gap-8 xl:gap-12",
          heroHeight(config) && "lg:min-h-[inherit]",
        )}
      >
        <div className={cn("lg:col-span-6", config.align === "center" && "text-center lg:text-start")}>
          <p className="fb-rise flex items-center gap-3 text-sm font-semibold tracking-[0.14em] text-[var(--ph-accent)] uppercase max-lg:justify-center lg:justify-start">
            <span aria-hidden className="h-px w-10 bg-[var(--ph-accent)]" />
            {text.eyebrow}
          </p>
          {/* The LCP element: rendered at once, never animated in. */}
          <h1
            id="hero-title"
            className="mt-5 font-display text-display font-semibold tracking-tight text-[var(--ph-heading)]"
          >
            <span className="block">{text.headline}</span>
            <span className="block pb-1 text-[var(--ph-accent)]">{text.accent}</span>
          </h1>
          <p
            className="fb-rise mt-5 max-w-xl text-lead text-[var(--ph-text)] max-lg:mx-auto"
            style={{ animationDelay: "120ms" }}
          >
            {text.lead}
          </p>
          <div
            className={cn(
              "fb-rise mt-8 flex flex-col gap-3 sm:flex-row sm:items-center",
              config.align === "center" && "sm:justify-center lg:justify-start",
            )}
            style={{ animationDelay: "200ms" }}
          >
            <Link
              href={config.primary_href || `${localizePath(locale)}#platforms`}
              className="group/btn inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--ph-button)] px-7 text-base font-semibold text-[var(--ph-button-text)] shadow-[0_10px_30px_-12px_var(--ph-glow)] transition-[translate,box-shadow,filter] duration-200 hover:-translate-y-0.5 hover:brightness-105 focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:hover:translate-y-0"
            >
              {config.primary_label || dict.common.cta.exploreProducts}
              <ArrowRight
                aria-hidden
                className="size-4 transition-transform group-hover/btn:translate-x-0.5 rtl:rotate-180"
              />
            </Link>
            <Link
              href={config.secondary_href || localizePath(locale, routes.contact)}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--ph-heading)_28%,transparent)] px-7 text-base font-semibold text-[var(--ph-heading)] transition-colors duration-200 hover:border-[var(--ph-accent)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
            >
              {config.secondary_label || dict.common.cta.talkToTeam}
            </Link>
          </div>
          <ul
            className={cn(
              "fb-rise mt-8 flex flex-col gap-3 text-sm text-[var(--ph-text)] sm:flex-row sm:flex-wrap sm:gap-x-6",
              config.mobile_layout === "compact" && "max-sm:hidden",
              config.align === "center" && "sm:justify-center lg:justify-start",
            )}
            style={{ animationDelay: "280ms" }}
          >
            {badges.map((badge) => (
              <li key={badge} className="flex items-center gap-2 max-sm:justify-center">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ph-accent)_18%,transparent)] text-[var(--ph-accent)]">
                  <Check aria-hidden className="size-3" strokeWidth={3} />
                </span>
                {badge}
              </li>
            ))}
          </ul>
        </div>

        <div
          className={cn("fb-rise lg:col-span-6", config.mobile_layout === "compact" && "max-sm:hidden")}
          style={{ animationDelay: "160ms" }}
        >
          <Picture
            look={look.visual}
            design={design}
            scheme={look.scheme}
            products={shown}
            locale={locale}
            dict={dict}
            brands={brands}
          />
        </div>
      </Container>
    </section>
  );
}

function Backdrop({ design }: { design: PlatformDesign }) {
  const waves = design === "digital" || design === "dark_enterprise";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[var(--ph-bg)]">
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_10%,var(--ph-bg-2),transparent_60%)]" />
      <div className="fb-ph-glow absolute end-[-8%] top-[8%] size-[38rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--ph-glow)_28%,transparent),transparent)]" />
      {waves && (
        <svg
          className="fb-ph-wave absolute inset-x-0 bottom-0 h-48 w-[120%] opacity-70"
          viewBox="0 0 1200 200"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`ph-wave-${design}`} x1="0" x2="1">
              <stop offset="0" stopColor="var(--ph-glow)" stopOpacity="0" />
              <stop offset="0.5" stopColor="var(--ph-glow)" stopOpacity="0.9" />
              <stop offset="1" stopColor="var(--ph-accent)" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path
              key={i}
              d={`M0 ${150 - i * 9} C 300 ${60 - i * 6}, 600 ${210 - i * 8}, 1200 ${70 - i * 5}`}
              fill="none"
              stroke={`url(#ph-wave-${design})`}
              strokeWidth="1.2"
              strokeDasharray="1 7"
              strokeLinecap="round"
            />
          ))}
        </svg>
      )}
    </div>
  );
}

/** A product, with its logo, category and status; a link where it has a website or waitlist. */
function ProductCard({
  p,
  locale,
  dict,
  brands,
  scheme,
  index,
  spots = SPOTS,
  plain = false,
}: {
  p: Shown;
  locale: Locale;
  dict: Dictionary;
  brands: Record<string, BrandProfile | null>;
  scheme: "light" | "dark";
  index: number;
  spots?: [number, number][];
  plain?: boolean;
}) {
  const tip = useId();
  const link = productLink(p.slug, locale, p.status);
  const [x, y] = spots[index] ?? [50, 50];
  const body = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--ph-glow)_14%,transparent)]">
        <ProductLogo slug={p.slug} brand={brands[p.slug]} name={p.name} size="sm" maxWidth={34} on={scheme} />
      </span>
      <span className="min-w-0 text-start">
        <span className="block truncate text-sm font-semibold text-[var(--ph-heading)]">{p.name}</span>
        <span className="block truncate text-xs text-[var(--ph-text)]">{p.category}</span>
      </span>
      {link.external && <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-[var(--ph-text)]" />}
    </>
  );
  const cardClass =
    "fb-ph-card group/card relative flex items-center gap-3 rounded-2xl border border-[var(--ph-card-border)] bg-[var(--ph-card)] px-3.5 py-3 shadow-[0_18px_40px_-24px_var(--ph-glow)] backdrop-blur transition-[border-color,translate] duration-200 hover:-translate-y-0.5 hover:border-[var(--ph-accent)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none motion-reduce:hover:translate-y-0";
  return (
    <li
      className={cn(!plain && "sm:absolute sm:w-[13.5rem] sm:-translate-x-1/2 sm:-translate-y-1/2")}
      style={plain ? undefined : ({ left: `${x}%`, top: `${y}%`, "--ph-i": index } as CSSProperties)}
    >
      <a
        href={link.href}
        target={link.external ? "_blank" : undefined}
        rel={link.external ? "noopener" : undefined}
        aria-describedby={tip}
        className={cardClass}
      >
        {body}
        <span className="sr-only">
          {` · ${dict.common.status[p.status]}`}
          {link.external ? ` (${dict.common.opensInNewTab})` : ""}
        </span>
      </a>
      {/* A short description on hover or keyboard focus. */}
      <span
        id={tip}
        role="tooltip"
        className="pointer-events-none absolute start-0 top-full z-10 mt-2 w-64 rounded-xl border border-[var(--ph-card-border)] bg-[var(--ph-card)] p-3 text-xs leading-relaxed text-[var(--ph-text)] opacity-0 shadow-lg transition-opacity duration-200 group-hover/card:opacity-100 [li:focus-within>&]:opacity-100 [li:hover>&]:opacity-100"
      >
        {p.summary}
      </span>
    </li>
  );
}

function Mark({ brands, size }: { brands: Record<string, BrandProfile | null>; size: number }) {
  return (
    <BrandLogo
      pair={brands.figbud?.logos.symbol}
      height={size}
      maxWidth={size}
      alt="FigBud Global"
      fallback="F"
    />
  );
}

function Picture({
  look,
  design,
  scheme,
  products,
  locale,
  dict,
  brands,
}: {
  look: "stack" | "hub" | "orbit";
  design: PlatformDesign;
  scheme: "light" | "dark";
  products: Shown[];
  locale: Locale;
  dict: Dictionary;
  brands: Record<string, BrandProfile | null>;
}) {
  const spots = design === "ecosystem_light" ? SPOTS_BESIDE_STATUS : SPOTS;
  const cards = (
    <ul
      aria-label={dict.home.hero.visual.label}
      className="relative grid grid-cols-1 gap-2 max-sm:mt-6 min-[420px]:max-sm:grid-cols-2 sm:contents"
    >
      {products.map((p, i) => (
        <ProductCard
          key={p.slug}
          p={p}
          index={i}
          spots={spots}
          locale={locale}
          dict={dict}
          brands={brands}
          scheme={scheme}
        />
      ))}
    </ul>
  );
  // Connections from each card to the platform at the centre.
  const lines = (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 size-full max-sm:hidden"
    >
      {products.map((p, i) => {
        const [x, y] = spots[i] ?? [50, 50];
        return (
          <path
            key={p.slug}
            className="fb-ph-line"
            d={`M${x} ${y} Q ${(x + 50) / 2} ${y < 50 ? 50 - (50 - y) * 0.2 : 50 + (y - 50) * 0.2}, 50 50`}
            fill="none"
            stroke="var(--ph-glow)"
            strokeOpacity="0.55"
            strokeWidth="0.35"
            strokeDasharray="1.4 1.6"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );

  if (look === "orbit") {
    const light = design === "ecosystem_light";
    return (
      <div className="relative">
        <div
          data-picture="orbit"
          className="relative mx-auto aspect-square w-full max-w-[34rem] sm:aspect-[6/5]"
        >
          <div aria-hidden className="absolute inset-0 grid place-items-center max-sm:hidden">
            {[92, 70, 48].map((s, i) => (
              <span
                key={s}
                className={cn("fb-ph-ring absolute rounded-full border", i === 1 ? "border-dashed" : "")}
                style={{
                  width: `${s}%`,
                  aspectRatio: "1",
                  borderColor: "color-mix(in srgb, var(--ph-glow) 35%, transparent)",
                  animationDelay: `${i * -6}s`,
                }}
              />
            ))}
          </div>
          {lines}
          <div className="absolute start-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center text-center max-sm:static max-sm:mx-auto max-sm:translate-x-0 max-sm:translate-y-0">
            <span
              className={cn(
                "grid place-items-center rounded-[2rem] border border-[var(--ph-card-border)] bg-[var(--ph-card)] shadow-[0_30px_60px_-30px_var(--ph-glow)]",
                light ? "size-24 rounded-full" : "size-36 rotate-0",
              )}
            >
              <Mark brands={brands} size={light ? 40 : 52} />
            </span>
            {!light && (
              <span className="mt-3 text-sm font-semibold text-[var(--ph-heading)]">FigBud Global</span>
            )}
          </div>
          {cards}
        </div>
        {/* Where each product stands: from the registry, no figures. */}
        <div
          className={cn(
            "rounded-2xl border border-[var(--ph-card-border)] bg-[var(--ph-card)] p-4 shadow-[0_20px_50px_-30px_var(--ph-glow)]",
            light
              ? "mt-4 sm:absolute sm:end-0 sm:top-1/2 sm:mt-0 sm:w-56 sm:-translate-y-1/2"
              : "mx-auto mt-4 max-w-sm",
          )}
        >
          <p className="text-sm font-semibold text-[var(--ph-heading)]">
            {dict.pages.products.compare.title}
          </p>
          <ul className="mt-2 grid gap-2">
            {products.map((p) => (
              <li
                key={p.slug}
                className="flex items-center justify-between gap-3 text-sm text-[var(--ph-text)]"
              >
                <span className="truncate">{p.name}</span>
                <StatusBadge status={p.status} label={dict.common.status[p.status]} className="py-0.5" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // A layered platform (stack) or a glowing hub, with the products around it.
  return (
    <div data-picture={look} className="relative mx-auto aspect-square w-full max-w-[36rem] sm:aspect-[6/5]">
      {lines}
      <div className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-sm:static max-sm:mx-auto max-sm:mt-6 max-sm:translate-x-0 max-sm:translate-y-0">
        {look === "stack" ? (
          <div aria-hidden className="fb-ph-stack relative size-44 sm:size-52">
            {[2, 1, 0].map((layer) => (
              <span
                key={layer}
                className="absolute inset-x-0 mx-auto size-[78%] rounded-[1.75rem] border border-[color-mix(in_srgb,var(--ph-glow)_55%,transparent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--ph-glow)_30%,var(--ph-card)),var(--ph-card))] shadow-[0_0_calc(40px*var(--ph-depth))_color-mix(in_srgb,var(--ph-glow)_45%,transparent)]"
                style={{
                  top: `${10 + layer * 16}%`,
                  transform: "rotateX(58deg) rotateZ(45deg)",
                  opacity: 1 - layer * 0.25,
                }}
              />
            ))}
            <span className="absolute inset-x-0 top-[14%] grid place-items-center">
              <Mark brands={brands} size={56} />
            </span>
          </div>
        ) : (
          <div className="relative grid size-48 place-items-center sm:size-56">
            {[100, 78].map((s) => (
              <span
                key={s}
                aria-hidden
                className="fb-ph-ring absolute rounded-full border border-[color-mix(in_srgb,var(--ph-glow)_45%,transparent)]"
                style={{ width: `${s}%`, aspectRatio: "1" }}
              />
            ))}
            <span className="relative grid size-28 place-items-center rounded-[1.75rem] border border-[color-mix(in_srgb,var(--ph-glow)_60%,transparent)] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--ph-glow)_22%,var(--ph-card)),var(--ph-card))] shadow-[0_0_calc(60px*var(--ph-depth))_color-mix(in_srgb,var(--ph-glow)_55%,transparent)]">
              <Mark brands={brands} size={52} />
            </span>
          </div>
        )}
      </div>
      {cards}
    </div>
  );
}
