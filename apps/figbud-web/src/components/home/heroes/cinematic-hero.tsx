"use client";

import { type Locale, localizePath } from "@figbud/i18n";
import {
  BrandLogo,
  type BrandProfile,
  type HeroConfig,
  heroDepth,
  heroHeight,
  heroPace,
  useHeroMotion,
  usePointerParallax,
} from "@figbud/site-kit";
import { buttonClasses, cn } from "@figbud/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import { routes } from "@/lib/site";

import { heroText } from "./hero-text";

/**
 * A lit cube (top, front and side faces) built with CSS 3D: each face turned
 * and pushed out by half the size, viewed at an isometric angle. The entrance
 * animates the outer wrapper, so it never overrides the cube's transform.
 */
function Block({ size, x, y, z, delay }: { size: number; x: number; y: number; z: number; delay: number }) {
  const half = `${size / 2}rem`;
  const face = "absolute inset-0 rounded-[0.3rem] border border-white/10";
  return (
    <div
      className="fb-cine-block absolute"
      style={{
        width: `${size}rem`,
        height: `${size}rem`,
        left: `${x}%`,
        bottom: `${y}%`,
        animationDelay: `${delay}s`,
      }}
    >
      <div
        className="relative size-full [transform-style:preserve-3d]"
        style={{
          transform: `translate3d(calc(var(--px, 0) * ${z * -14}px * var(--depth)), calc(var(--py, 0) * ${z * -8}px * var(--depth)), 0) rotateX(-28deg) rotateY(-42deg)`,
        }}
      >
        <div
          className={cn(face, "bg-[linear-gradient(145deg,var(--cine-top-a),var(--cine-top-b))]")}
          style={{ transform: `rotateX(90deg) translateZ(${half})` }}
        />
        <div
          className={cn(face, "bg-[linear-gradient(180deg,var(--cine-side-a),var(--cine-side-b))]")}
          style={{ transform: `translateZ(${half})` }}
        />
        <div
          className={cn(face, "bg-[linear-gradient(90deg,var(--cine-edge-a),var(--cine-edge-b))]")}
          style={{ transform: `rotateY(90deg) translateZ(${half})` }}
        />
      </div>
    </div>
  );
}

/**
 * Variant 02 · Beyond the Ordinary: a cinematic stage of dimensional blocks
 * rising like steps, a FigBud token resting on the light, and a slow light
 * sweep. Pointer movement shifts the layers at different depths. The text is
 * rendered at once (LCP); with motion off or reduced, the stage is still.
 */
export function CinematicHero({
  locale,
  dict,
  config,
  brand,
}: {
  locale: Locale;
  dict: Dictionary;
  config: HeroConfig;
  brand: BrandProfile | null;
}) {
  const motion = useHeroMotion(config);
  const stage = usePointerParallax<HTMLDivElement>(motion);
  const text = heroText(locale, config, {
    eyebrow: dict.home.hero.eyebrow,
    headline: "Beyond the ordinary.",
    accent: "Designed for progress.",
    lead: dict.home.hero.lead,
  });
  const center = config.align === "center";
  const pace = heroPace(config);
  return (
    <section
      aria-labelledby="hero-title"
      data-hero="cinematic"
      className={cn("fb-cine relative isolate overflow-hidden", heroHeight(config))}
      style={{ "--depth": heroDepth(config), "--pace": pace } as CSSProperties}
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_70%_at_70%_40%,var(--cine-glow),transparent_70%)]"
      />
      <div className="mx-auto grid max-w-[92rem] items-center gap-10 px-5 pt-page-top pb-section-sm sm:px-8 md:px-10 lg:grid-cols-12 lg:px-16">
        <div className={cn("relative z-10 lg:col-span-6", center && "lg:col-span-12 lg:text-center")}>
          <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">{text.eyebrow}</p>
          <h1
            id="hero-title"
            className="mt-5 font-display text-display font-semibold tracking-tight text-text"
          >
            <span className="block">{text.headline}</span>
            <span className="fb-text-gradient block pb-1 text-[0.62em] leading-tight">{text.accent}</span>
          </h1>
          <p className={cn("mt-6 max-w-xl text-lead text-muted", center && "lg:mx-auto")}>{text.lead}</p>
          <div className={cn("mt-9 flex flex-col gap-3 sm:flex-row", center && "lg:justify-center")}>
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
        </div>
        {!center && (
          <div
            ref={stage}
            aria-hidden
            data-motion={motion || undefined}
            className="relative h-[22rem] [perspective:1400px] sm:h-[28rem] lg:col-span-6 lg:h-[34rem]"
          >
            <div className="absolute inset-0 [transform-style:preserve-3d]">
              <div className="absolute start-[6%] bottom-[18%] h-px w-[88%] origin-left -rotate-[18deg] bg-gradient-to-r from-transparent via-accent/70 to-transparent shadow-[0_0_24px_var(--accent)]" />
              <Block size={6.5} x={8} y={14} z={1} delay={0.05} />
              <Block size={8.5} x={32} y={22} z={2} delay={0.15} />
              <Block size={11} x={56} y={34} z={3} delay={0.25} />
              {/* The FigBud token on the top step. */}
              <div
                className="fb-cine-token absolute end-[10%] top-[8%] flex size-20 items-center justify-center rounded-full border border-white/20 bg-[radial-gradient(circle_at_30%_30%,rgb(255_255_255/0.95),rgb(203_213_225/0.6)_45%,rgb(71_85_105/0.6))] shadow-[0_30px_60px_-20px_rgb(2_6_23/0.7),inset_0_-8px_20px_rgb(2_6_23/0.25)] sm:size-24"
                style={{
                  transform:
                    "translate3d(calc(var(--px, 0) * -26px * var(--depth)), calc(var(--py, 0) * -18px * var(--depth)), 60px)",
                  animation: motion ? `fb-drift ${7 * pace}s ease-in-out infinite` : undefined,
                }}
              >
                <BrandLogo pair={brand?.logos.symbol} height={40} maxWidth={40} alt="" fallback="F" />
              </div>
            </div>
            {motion && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]">
                <div
                  className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent mix-blend-overlay"
                  style={{ animation: `fb-sweep ${9 * pace}s ease-in-out 1.2s infinite` }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
