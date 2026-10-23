"use client";

import type { Product, ProductSlug } from "@figbud/brand";
import type { Locale } from "@figbud/i18n";
import { BrandLogo, type BrandProfile, ProductMark, hasLogo } from "@figbud/site-kit";
import { FigBudMark, cn } from "@figbud/ui";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AnimatePresence, m, useInView, useReducedMotion } from "motion/react";
import { type CSSProperties, type MouseEvent, useEffect, useId, useRef, useState } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import { fill } from "@/lib/format";
import { productLink } from "@/lib/site";

/** Composition coordinates in a 400 × 340 design space. */
const W = 400;
const H = 340;
const CORE = { x: 200, y: 172 };

const NODES: Record<ProductSlug, { x: number; y: number; bend: number }> = {
  zirahr: { x: 92, y: 74, bend: -34 },
  jasiri: { x: 318, y: 96, bend: 30 },
  expense_now: { x: 244, y: 290, bend: -30 },
};

/** Where each description card opens so it stays inside the panel. */
const CARD_POSITION: Record<ProductSlug, string> = {
  zirahr: "top-full left-0 mt-2",
  jasiri: "top-full right-0 mt-2",
  expense_now: "bottom-full right-0 mb-2",
};

/** Integration endpoints orbiting the products (banks, mobile money, identity, accounting). */
const SATELLITES: Array<{ from: ProductSlug; x: number; y: number }> = [
  { from: "zirahr", x: 30, y: 168 },
  { from: "zirahr", x: 178, y: 22 },
  { from: "jasiri", x: 378, y: 206 },
  { from: "jasiri", x: 262, y: 20 },
  { from: "expense_now", x: 104, y: 300 },
  { from: "expense_now", x: 362, y: 316 },
];

function curve(a: { x: number; y: number }, b: { x: number; y: number }, bend: number) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * bend;
  const cy = my + (dx / len) * bend;
  return `M${a.x} ${a.y} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}`;
}

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

/** A published primary colour tints a product's connection line, glow and highlight. */
const accent = (brand?: BrandProfile | null) =>
  (brand ? { "--product": brand.colors.primary } : undefined) as CSSProperties | undefined;

type Props = {
  locale: Locale;
  labels: Dictionary["home"]["hero"]["visual"];
  common: Dictionary["common"];
  copy: Dictionary["products"];
  caption: string;
  /** Listed products with their registry status (lib/products). */
  products: Product[];
  /** Published brand profiles by website slug (Admin → Websites → Branding). */
  brands: Record<string, BrandProfile | null>;
};

export function EcosystemVisual({ locale, labels, common, copy, caption, products, brands }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-10% 0px" });
  const reduceMotion = useReducedMotion();
  const [tick, setTick] = useState(0);
  const shown = products.filter((p) => p.slug in NODES);
  const figbudSymbol = brands.figbud?.logos.symbol;

  useEffect(() => {
    if (!inView || reduceMotion) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    }, 2800);
    return () => window.clearInterval(id);
  }, [inView, reduceMotion]);

  const events = labels.events;
  const visible = [0, 1, 2].map((offset) => {
    const n = tick - offset;
    return { key: n, event: events[((n % events.length) + events.length) % events.length]! };
  });

  return (
    <figure ref={ref} className="relative">
      <div
        role="group"
        aria-label={labels.label}
        className="fb-panel relative overflow-hidden rounded-[var(--radius-panel)]"
      >
        <div
          aria-hidden
          className="fb-grid absolute inset-0 [mask-image:radial-gradient(circle_at_50%_50%,black,transparent_78%)] opacity-70"
        />
        <div className="relative aspect-[400/340] w-full">
          <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" fill="none">
            <defs>
              <radialGradient id="eco-core" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="var(--fb-amber)" stopOpacity="0.35" />
                <stop offset="1" stopColor="var(--fb-amber)" stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle cx={CORE.x} cy={CORE.y} r="92" stroke="var(--line-strong)" strokeDasharray="2 6" />
            <circle cx={CORE.x} cy={CORE.y} r="150" stroke="var(--line)" />
            <circle
              cx={CORE.x}
              cy={CORE.y}
              r="70"
              fill="url(#eco-core)"
              className="origin-center [transform-box:fill-box] motion-safe:animate-[fb-orbit-glow_6s_ease-in-out_infinite]"
            />

            {SATELLITES.filter((s) => shown.some((p) => p.slug === s.from)).map((s, i) => {
              const node = NODES[s.from];
              return (
                <g key={i}>
                  <path d={curve(node, s, 18)} stroke="var(--line-strong)" strokeWidth="1" />
                  <circle cx={s.x} cy={s.y} r="3.5" fill="var(--surface-3)" stroke="var(--line-strong)" />
                </g>
              );
            })}

            {shown.map(({ slug, status }) => {
              const node = NODES[slug];
              const d = curve(CORE, node, node.bend);
              const live = status === "active";
              return (
                <g key={slug} data-product={slug} style={accent(brands[slug])}>
                  <path d={d} stroke="var(--product)" strokeOpacity={live ? 0.35 : 0.2} strokeWidth="1.5" />
                  <path
                    d={d}
                    stroke="var(--product)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={live ? "3 22" : "2 23"}
                    className="motion-safe:animate-[fb-dash_6s_linear_infinite]"
                    style={{
                      animationDuration: slug === "jasiri" ? "7.5s" : slug === "zirahr" ? "6s" : "11s",
                    }}
                  />
                </g>
              );
            })}
          </svg>

          {/* Core */}
          <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
            style={{ left: pct(CORE.x, W), top: pct(CORE.y, H) }}
          >
            {hasLogo(figbudSymbol) ? (
              // The official symbol is drawn for dark backgrounds, so it sits on a dark tile in both themes.
              <span className="flex size-14 items-center justify-center rounded-[18px] bg-[#15120f] shadow-[0_0_0_1px_rgb(240_166_93/0.35),0_12px_40px_-8px_var(--glow)] sm:size-16">
                <BrandLogo pair={figbudSymbol} on="dark" height={30} maxWidth={36} alt="FigBud Global" />
              </span>
            ) : (
              <span className="rounded-[18px] bg-bg/60 p-2 shadow-[0_0_0_1px_var(--line-strong),0_12px_40px_-8px_var(--glow)] backdrop-blur">
                <FigBudMark className="size-10 sm:size-12" title="FigBud Global" />
              </span>
            )}
            <span className="mt-2 text-[0.7rem] font-medium whitespace-nowrap text-text sm:text-xs">
              {labels.core}
            </span>
            <span className="hidden text-[0.65rem] whitespace-nowrap text-subtle sm:block">
              {labels.coreDetail}
            </span>
          </div>

          {/* Product nodes: links to each product, with a short description on hover, focus or first tap */}
          {shown.map((product) => (
            <ProductNode
              key={product.slug}
              product={product}
              brand={brands[product.slug]}
              locale={locale}
              summary={copy[product.slug].summary}
              common={common}
              exploreLabel={labels.explore}
            />
          ))}
        </div>
      </div>

      {/* Live activity feed */}
      <div className="fb-panel relative mt-4 rounded-2xl p-4 sm:p-5 lg:absolute lg:-bottom-10 lg:-left-8 lg:mt-0 lg:w-[19rem] xl:-left-14">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium tracking-wide text-muted">{labels.feedTitle}</p>
          <span className="flex items-center gap-1.5 text-[0.68rem] text-success">
            <span className="size-1.5 rounded-full bg-current motion-safe:animate-[fb-pulse_2s_ease-in-out_infinite]" />
            {labels.live}
          </span>
        </div>
        <ul className="mt-3 space-y-2" aria-hidden>
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map(({ key, event }, i) => (
              <m.li
                key={key}
                data-product={event.product}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: i === 2 ? 0.55 : 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3 rounded-xl bg-surface-2/70 px-3 py-2.5"
              >
                <span className="size-2 shrink-0 rounded-full bg-product shadow-[0_0_10px_var(--product)]" />
                <span className="min-w-0 flex-1 truncate text-[0.8rem] text-text">{event.text}</span>
                <span className="shrink-0 text-[0.68rem] text-subtle">{event.meta}</span>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <figcaption className="mt-3 text-end text-[0.7rem] text-subtle lg:mt-4">{caption}</figcaption>
    </figure>
  );
}

function ProductNode({
  product,
  brand,
  locale,
  summary,
  common,
  exploreLabel,
}: {
  product: Product;
  brand?: BrandProfile | null;
  locale: Locale;
  summary: string;
  common: Dictionary["common"];
  exploreLabel: string;
}) {
  const { slug, name, status } = product;
  const node = NODES[slug];
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const link = productLink(slug, locale, status);
  const cta =
    status === "coming_soon"
      ? common.cta.joinWaitlist
      : link.external
        ? fill(common.cta.visitSite, { product: name })
        : fill(exploreLabel, { product: name });
  // A product without a symbol but with a full logo shows the logo in place of its name.
  const horizontal = !hasLogo(brand?.logos.symbol) && hasLogo(brand?.logos.horizontal);

  // Touch screens have no hover: the first tap shows the description, the next one opens the product.
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!open && window.matchMedia("(hover: none)").matches) {
      event.preventDefault();
      setOpen(true);
    }
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      data-product={slug}
      data-open={open || undefined}
      className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 focus-within:z-20 hover:z-20 data-open:z-20"
      style={{ left: pct(node.x, W), top: pct(node.y, H), ...accent(brand) }}
    >
      <a
        href={link.href}
        {...(link.external ? { target: "_blank", rel: "noopener" } : {})}
        onClick={onClick}
        aria-describedby={id}
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-2xl border border-line-strong bg-bg-elevated/90 py-1.5 ps-1.5 pe-3 shadow-[0_10px_30px_-12px_var(--product)] backdrop-blur transition-[translate,border-color] duration-300 hover:border-[var(--product)] focus-visible:border-[var(--product)] motion-safe:hover:-translate-y-0.5",
          status !== "active" && "opacity-90",
        )}
      >
        {horizontal ? (
          <BrandLogo pair={brand!.logos.horizontal} height={28} maxWidth={84} alt={name} className="ps-1.5" />
        ) : (
          <ProductMark slug={slug} brand={brand} size="sm" className="size-7 sm:size-8" />
        )}
        <span className="leading-tight">
          {!horizontal && (
            <span className="block text-[0.72rem] font-medium whitespace-nowrap text-text sm:text-[0.8rem]">
              {name}
            </span>
          )}
          <span className="flex items-center gap-1 text-[0.62rem] whitespace-nowrap text-product-text sm:text-[0.68rem]">
            <span aria-hidden className="size-1 rounded-full bg-current" />
            {common.status[status]}
          </span>
        </span>
        {link.external && <span className="sr-only">({common.opensInNewTab})</span>}
      </a>
      <div
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute w-[13.5rem] max-w-[62vw] rounded-2xl border border-line-strong bg-bg-elevated p-3.5 text-start opacity-0 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.6)] transition-[opacity,translate,visibility] duration-200 motion-safe:translate-y-1",
          "group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-data-open:visible group-data-open:translate-y-0 group-data-open:opacity-100",
          CARD_POSITION[slug],
        )}
      >
        <p className="text-[0.78rem] leading-relaxed text-muted">{summary}</p>
        <p className="mt-2 flex items-center gap-1 text-[0.78rem] font-medium text-product-text">
          {cta}
          {link.external ? (
            <ArrowUpRight aria-hidden className="size-3.5" />
          ) : (
            <ArrowRight aria-hidden className="size-3.5 rtl:rotate-180" />
          )}
        </p>
      </div>
    </div>
  );
}
