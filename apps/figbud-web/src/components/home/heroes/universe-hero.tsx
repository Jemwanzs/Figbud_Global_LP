"use client";

import type { Product } from "@figbud/brand";
import { company } from "@figbud/brand";
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
  usePointerParallax,
} from "@figbud/site-kit";
import { StatusBadge, buttonClasses, cn } from "@figbud/ui";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import { fill } from "@/lib/format";
import { productLink, routes } from "@/lib/site";

import { heroText } from "./hero-text";

type Phase = "identity" | "unfold" | "connect" | "settled";

/**
 * Variant 03 · The FigBud Universe: a short presentation. The FigBud
 * identity appears, product panels unfold in perspective, connections draw
 * between them, and it settles into an interactive showcase; choosing a
 * panel brings it forward with its details. Server HTML and reduced motion
 * show the settled showcase; phones get a swipeable row of flat panels.
 */
export function UniverseHero({
  locale,
  dict,
  config,
  products,
  brands,
}: {
  locale: Locale;
  dict: Dictionary;
  config: HeroConfig;
  products: Product[];
  brands: Record<string, BrandProfile | null>;
}) {
  const motion = useHeroMotion(config);
  const pace = heroPace(config);
  const depth = heroDepth(config);
  const stage = usePointerParallax<HTMLDivElement>(motion);
  const [phase, setPhase] = useState<Phase>("settled");
  const [active, setActive] = useState(0);
  const text = heroText(locale, config, {
    eyebrow: dict.home.hero.eyebrow,
    headline: company.tagline,
    accent: "",
    lead: dict.home.hero.lead,
  });

  // The sequence plays once per visit, after hydration; settled is the default (no-JS, reduced motion).
  useEffect(() => {
    if (!motion) return;
    const steps: [Phase, number][] = [
      ["identity", 0],
      ["unfold", 700],
      ["connect", 700 + 900],
      ["settled", 700 + 900 + 900],
    ];
    const timers = steps.map(([p, at]) => window.setTimeout(() => setPhase(p), at * pace));
    return () => timers.forEach(window.clearTimeout);
  }, [motion, pace]);

  const panels = products.slice(0, 6);
  const n = panels.length;
  const mid = (n - 1) / 2;
  const open = phase !== "identity";
  const connected = phase === "connect" || phase === "settled";
  const focus = panels[active];

  return (
    <section
      aria-labelledby="hero-title"
      data-hero="universe"
      className={cn("relative isolate overflow-hidden", heroHeight(config))}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute start-1/2 top-[38%] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] rtl:translate-x-1/2" />
        <div className="fb-grid absolute inset-0 [mask-image:radial-gradient(ellipse_60%_55%_at_50%_45%,black,transparent_75%)] opacity-50" />
      </div>
      <div className="mx-auto max-w-[92rem] px-5 pt-page-top pb-section-sm text-center sm:px-8 md:px-10 lg:px-16">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">{text.eyebrow}</p>
        <h1
          id="hero-title"
          className="mx-auto mt-5 max-w-4xl font-display text-display font-semibold tracking-tight text-text"
        >
          <span className="fb-text-gradient block pb-1">{text.headline}</span>
          {text.accent && <span className="block text-[0.6em]">{text.accent}</span>}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lead text-muted">{text.lead}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={config.primary_href || `${localizePath(locale)}#platforms`}
            className={buttonClasses("primary", "lg")}
          >
            {config.primary_label || dict.common.cta.exploreProducts}
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </Link>
          <Link
            href={config.secondary_href || localizePath(locale, routes.contact)}
            className={buttonClasses("secondary", "lg")}
          >
            {config.secondary_label || dict.common.cta.talkToTeam}
          </Link>
        </div>

        {/* md and up: the panels in perspective. */}
        <div
          ref={stage}
          className="relative mx-auto mt-14 hidden h-[24rem] max-w-6xl [perspective:1800px] md:block"
          style={{ "--depth": depth } as CSSProperties}
        >
          <svg
            aria-hidden
            viewBox="0 0 1000 380"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            {panels.map((p, i) => (
              <path
                key={p.slug}
                d={`M500 300 C ${500 + (i - mid) * 60} 220, ${500 + (i - mid) * 150} 200, ${500 + (i - mid) * 190} 150`}
                fill="none"
                strokeWidth="1.5"
                strokeDasharray="5 7"
                className="stroke-line-strong transition-opacity duration-700"
                style={{ opacity: connected ? 1 : 0, transitionDelay: `${i * 120}ms` }}
              />
            ))}
          </svg>
          <div
            className="absolute inset-0 [transform-style:preserve-3d]"
            style={{
              transform: motion
                ? "rotateX(calc(var(--py, 0) * -4deg * var(--depth))) rotateY(calc(var(--px, 0) * 6deg * var(--depth)))"
                : undefined,
              transition: "transform 600ms var(--motion-ease)",
            }}
          >
            <ul className="contents">
              {panels.map((p, i) => {
                const offset = i - mid;
                const chosen = i === active;
                const transform = open
                  ? `translate3d(${offset * 245}px, ${chosen ? -18 : 0}px, ${chosen ? 90 : -Math.abs(offset) * 60}px) rotateY(${chosen ? 0 : offset * -9}deg)`
                  : `translate3d(0, 30px, -260px) rotateY(90deg)`;
                return (
                  <li
                    key={p.slug}
                    data-product={p.slug}
                    className="absolute start-1/2 top-6 -ms-28 w-56"
                    style={{
                      transform,
                      opacity: open ? 1 : 0,
                      zIndex: chosen ? 20 : 10 - Math.round(Math.abs(offset)),
                      transition: motion
                        ? `transform 900ms var(--motion-ease) ${open && phase === "unfold" ? i * 110 : 0}ms, opacity 700ms var(--motion-ease) ${i * 110}ms`
                        : "none",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onPointerEnter={() => phase === "settled" && setActive(i)}
                      aria-pressed={chosen}
                      className={cn(
                        "flex h-56 w-full flex-col rounded-[1.4rem] border bg-surface/95 p-5 text-start shadow-[0_40px_80px_-40px_rgb(2_6_23/0.6)] backdrop-blur transition-[border-color,box-shadow] duration-500",
                        chosen
                          ? "border-product/60 shadow-[0_40px_90px_-36px_var(--product)]"
                          : "border-line",
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <ProductLogo
                          slug={p.slug}
                          brand={brands[p.slug]}
                          name={p.name}
                          size="md"
                          maxWidth={110}
                        />
                        <StatusBadge
                          status={p.status}
                          label={dict.common.status[p.status]}
                          className="py-0.5"
                        />
                      </span>
                      <span className="mt-auto block text-sm font-semibold text-text">{p.name}</span>
                      <span className="mt-1 block text-xs text-product-text">
                        {dict.products[p.slug].category}
                      </span>
                      <span className="mt-2 block text-xs leading-relaxed text-muted">
                        {dict.products[p.slug].tagline}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* The FigBud core: appears first, anchors the connections. */}
            <div
              className="absolute start-1/2 bottom-0 flex -translate-x-1/2 flex-col items-center rtl:translate-x-1/2"
              style={{
                opacity: phase === "identity" || open ? 1 : 0,
                transform: `translateZ(40px) scale(${phase === "identity" && motion ? 1.15 : 1})`,
                transition: "transform 800ms var(--motion-ease), opacity 600ms var(--motion-ease)",
              }}
            >
              <span className="flex size-16 items-center justify-center rounded-2xl bg-[var(--fb-ink)] shadow-[0_0_60px_-10px_var(--accent)]">
                <BrandLogo pair={brands.figbud?.logos.symbol} height={36} maxWidth={36} alt="" fallback="F" />
              </span>
              <span className="mt-2 text-xs font-medium text-text">{dict.home.hero.visual.core}</span>
            </div>
          </div>
        </div>
        {focus && (
          <p className="mx-auto mt-6 hidden max-w-xl text-sm text-muted md:block" aria-live="polite">
            <span className="font-medium text-text">{focus.name}</span>
            {` · ${dict.products[focus.slug].summary} `}
            {(() => {
              const link = productLink(focus.slug, locale, focus.status);
              return (
                <a
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener" : undefined}
                  className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                >
                  {fill(dict.home.hero.visual.explore, { product: focus.name })}
                  {link.external ? <ArrowUpRight aria-hidden className="size-3.5" /> : null}
                </a>
              );
            })()}
          </p>
        )}

        {/* Phones: a swipeable row of flat panels. */}
        <ul className="-mx-5 mt-10 flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto px-5 pb-2 md:hidden">
          {panels.map((p) => {
            const link = productLink(p.slug, locale, p.status);
            return (
              <li key={p.slug} data-product={p.slug} className="w-[72%] shrink-0 snap-start">
                <a
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener" : undefined}
                  className="flex h-full flex-col rounded-2xl border border-line bg-surface p-4 text-start"
                >
                  <span className="flex items-center justify-between gap-2">
                    <ProductLogo slug={p.slug} brand={brands[p.slug]} name={p.name} size="sm" maxWidth={96} />
                    <StatusBadge status={p.status} label={dict.common.status[p.status]} className="py-0.5" />
                  </span>
                  <span className="mt-3 text-sm font-semibold text-text">{p.name}</span>
                  <span className="mt-1 text-xs text-muted">{dict.products[p.slug].tagline}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
