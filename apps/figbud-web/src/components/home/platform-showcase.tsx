"use client";

import type { Product, ProductSlug } from "@figbud/brand";
import type { Locale } from "@figbud/i18n";
import { StatusBadge, buttonClasses, cn } from "@figbud/ui";
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { m } from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import { fill } from "@/lib/format";
import { productLink } from "@/lib/site";

import { type BrandProfile, ProductLogo, productLogoKind } from "@figbud/site-kit";
import { ProductPreview } from "./product-previews";

type Props = {
  locale: Locale;
  platforms: Dictionary["home"]["platforms"];
  products: Dictionary["products"];
  /** Public products with their current marketing status (lib/products). */
  items: Product[];
  /** Published brand profiles by product slug. */
  brands: Record<string, BrandProfile | null>;
  common: Dictionary["common"];
  /** Seconds per product when rotation is on in the Studio, else null. */
  rotation?: number | null;
};

/** Finger travel (px) that counts as a swipe, and trackpad travel that moves one product. */
const SWIPE = 48;
const WHEEL = 80;

/**
 * Our Platforms (UI-MO2): product tabs over a horizontal slider. Tabs, the
 * previous/next buttons, arrow keys, touch swipes and sideways trackpad
 * gestures all slide to a product; vertical scrolling is never captured
 * (`touch-action: pan-y`). On large screens the next product peeks in from
 * the edge. Optional rotation (Studio) pauses on hover, focus, any
 * interaction and while off screen, stops for good once the visitor chooses
 * a product, and never runs with reduced motion. Every product's content is
 * in the server HTML; panels off screen are inert.
 */
export function PlatformShowcase({ locale, platforms, products, items, brands, common, rotation }: Props) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [playing, setPlaying] = useState(Boolean(rotation));
  const [held, setHeld] = useState(false);
  // Previews replay only once the showcase has moved: first paint is the final state.
  const [moved, setMoved] = useState(false);
  const baseId = useId();
  const root = useRef<HTMLDivElement>(null);
  const tablist = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [height, setHeight] = useState<number | null>(null);
  const pointer = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
  const wheel = useRef({ travel: 0, locked: 0 });
  const last = items.length - 1;
  const active: ProductSlug = items[index]?.slug ?? "zirahr";

  /** Keeps the chosen tab visible in the tab row (phones) without scrolling the page. */
  const showTab = (i: number) => {
    const list = tablist.current;
    const tab = tabRefs.current[i];
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  };

  const go = (i: number, byVisitor = true) => {
    const next = (i + items.length) % items.length;
    setIndex(next);
    setMoved(true);
    showTab(next);
    // Choosing a product ends the rotation for this visit.
    if (byVisitor) setPlaying(false);
  };

  // Rotation: only while playing, not held (hover or focus), on screen and visible.
  useEffect(() => {
    if (!rotation || !playing || held || items.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = root.current;
    if (!el) return;
    let onScreen = false;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      if (onScreen && !document.hidden)
        timer = window.setTimeout(() => {
          setMoved(true);
          setIndex((i) => (i + 1) % items.length);
        }, rotation * 1000);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = Boolean(entry?.isIntersecting);
        schedule();
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", schedule);
      window.clearTimeout(timer);
    };
  }, [rotation, playing, held, index, items.length]);

  // After the first move, the slider takes the active panel's own height (panels differ).
  useEffect(() => {
    const panel = panelRefs.current[index];
    if (!panel) return;
    const observer = new ResizeObserver(() => setHeight(panel.offsetHeight));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [index]);

  const onKeyDown = (event: KeyboardEvent, i: number) => {
    const rtl = document.documentElement.dir === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    let next: number | null = null;
    if (event.key === forward) next = i === last ? 0 : i + 1;
    if (event.key === back) next = i === 0 ? last : i - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    go(next);
    tabRefs.current[next]?.focus();
  };

  // Touch and pen: the slide follows the finger once the gesture is clearly sideways.
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    pointer.current = { x: event.clientX, y: event.clientY, id: event.pointerId, horizontal: null };
  };
  const onPointerMove = (event: PointerEvent) => {
    const p = pointer.current;
    if (!p || p.id !== event.pointerId) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    if (p.horizontal === null && Math.hypot(dx, dy) > 8) p.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
    if (p.horizontal) setDrag(dx);
  };
  const onPointerEnd = (event: PointerEvent) => {
    const p = pointer.current;
    pointer.current = null;
    if (!p || p.id !== event.pointerId || !p.horizontal) return setDrag(null);
    const dx = event.clientX - p.x;
    setDrag(null);
    if (Math.abs(dx) < SWIPE) return;
    const rtl = document.documentElement.dir === "rtl";
    go(index + (dx < 0 !== rtl ? 1 : -1));
  };

  // Trackpads: a clearly sideways two-finger swipe moves one product.
  const onWheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    const w = wheel.current;
    if (event.timeStamp < w.locked) return;
    w.travel += event.deltaX;
    if (Math.abs(w.travel) < WHEEL) return;
    const rtl = document.documentElement.dir === "rtl";
    go(index + (w.travel > 0 !== rtl ? 1 : -1));
    w.travel = 0;
    w.locked = event.timeStamp + 650;
  };

  const nextProduct = items[(index + 1) % items.length];

  return (
    <div
      ref={root}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHeld(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
      }}
    >
      <div
        ref={tablist}
        role="tablist"
        aria-label={platforms.tabsLabel}
        style={{ "--tabs": items.length } as CSSProperties}
        className="flex snap-x snap-mandatory scroll-px-1.5 [scrollbar-width:none] gap-2 overflow-x-auto rounded-[1.4rem] border border-line bg-surface/50 p-1.5 md:grid md:snap-none md:grid-cols-[repeat(var(--tabs),minmax(0,1fr))] md:gap-3 md:overflow-visible md:p-2"
      >
        {items.map((product, i) => {
          const selected = product.slug === active;
          const wordmark = productLogoKind(brands[product.slug]) === "wordmark";
          return (
            <button
              key={product.slug}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`${baseId}-tab-${product.slug}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${product.slug}`}
              tabIndex={selected ? 0 : -1}
              data-product={product.slug}
              onClick={() => go(i)}
              onKeyDown={(event) => onKeyDown(event, i)}
              className={cn(
                "relative flex min-h-16 shrink-0 snap-start items-center gap-3 rounded-2xl px-3.5 py-2.5 text-start transition-colors md:min-w-0 md:px-4 md:py-3.5",
                selected ? "text-text" : "text-muted hover:bg-surface-2/60 hover:text-text",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-0 rounded-2xl border border-product/30 bg-bg-elevated shadow-[0_10px_30px_-18px_var(--product)] transition-[opacity,transform] duration-300 ease-out-expo",
                  selected ? "scale-100 opacity-100" : "scale-95 opacity-0",
                )}
              />
              <ProductLogo
                slug={product.slug}
                brand={brands[product.slug]}
                name={product.name}
                size="sm"
                maxWidth={88}
                className={cn(
                  "relative transition-[opacity,filter] duration-300",
                  !selected && "opacity-80 saturate-[.85]",
                )}
              />
              <span className="relative min-w-0">
                {!wordmark && (
                  <span className="block text-sm font-medium whitespace-nowrap md:text-base">
                    {product.name}
                  </span>
                )}
                <span className="hidden truncate text-xs text-subtle lg:block">
                  {products[product.slug].category}
                </span>
              </span>
              {/* Rotation progress under the active tab. */}
              {selected && rotation && playing && !held && (
                <span
                  key={index}
                  aria-hidden
                  style={{ animationDuration: `${rotation}s` }}
                  className="fb-progress absolute inset-x-4 bottom-1 h-0.5 rounded-full bg-product/70 motion-reduce:hidden"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* The slider: panels side by side, the track slides; the next one peeks in on large screens. */}
      <div
        className="fb-slider mt-6 [touch-action:pan-y] overflow-hidden overscroll-x-contain rounded-[var(--radius-panel)] transition-[height] duration-[var(--motion-slow)] ease-out-expo md:mt-8"
        // Only once it has moved: changing height on load would shift the page (CLS).
        style={moved && height ? { height } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={onWheel}
      >
        <div
          className="fb-slider-track flex items-start gap-[var(--slide-gap)]"
          data-dragging={drag !== null || undefined}
          style={{ "--slide": index, "--slides": last, "--drag": `${drag ?? 0}px` } as CSSProperties}
        >
          {items.map((product, i) => {
            const selected = i === index;
            const copy = products[product.slug];
            const link = productLink(product.slug, locale, product.status);
            const comingSoon = product.status === "coming_soon";
            return (
              <div
                key={product.slug}
                ref={(el) => {
                  panelRefs.current[i] = el;
                }}
                role="tabpanel"
                id={`${baseId}-panel-${product.slug}`}
                aria-labelledby={`${baseId}-tab-${product.slug}`}
                aria-hidden={!selected || undefined}
                inert={!selected || undefined}
                data-product={product.slug}
                className={cn(
                  "relative w-[var(--slide-width)] shrink-0 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface transition-opacity duration-[var(--motion-slow)]",
                  !selected && "opacity-45",
                )}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute end-[-10%] -top-32 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,var(--product-soft),transparent)]"
                />
                <div className="relative grid gap-10 p-6 sm:p-8 lg:grid-cols-12 lg:gap-12 lg:p-12">
                  <div className="flex flex-col lg:col-span-5">
                    <div className="flex flex-wrap items-center gap-3">
                      {productLogoKind(brands[product.slug]) === "wordmark" ? (
                        <div>
                          {/* The logo carries the name; it is the heading's text alternative. */}
                          <h3 className="text-2xl font-semibold tracking-tight text-text">
                            <ProductLogo
                              slug={product.slug}
                              brand={brands[product.slug]}
                              name={product.name}
                              size="lg"
                              maxWidth={170}
                            />
                          </h3>
                          <p className="mt-1 text-sm text-product-text">{copy.category}</p>
                        </div>
                      ) : (
                        <>
                          <ProductLogo
                            slug={product.slug}
                            brand={brands[product.slug]}
                            name={product.name}
                            size="lg"
                          />
                          <div>
                            <h3 className="text-2xl font-semibold tracking-tight text-text">
                              {product.name}
                            </h3>
                            <p className="text-sm text-product-text">{copy.category}</p>
                          </div>
                        </>
                      )}
                      <StatusBadge
                        status={product.status}
                        label={common.status[product.status]}
                        className="ms-auto self-start"
                      />
                    </div>
                    <p className="mt-8 font-display text-title font-medium text-text">{copy.tagline}</p>
                    <p className="mt-4 leading-relaxed text-muted">{copy.summary}</p>
                    <ul className="mt-6 space-y-3">
                      {copy.highlights.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-[0.95rem] text-text">
                          <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-product-soft text-product-text">
                            <Check aria-hidden className="size-3" strokeWidth={3} />
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                    {comingSoon && (
                      <p className="mt-6 text-sm text-muted">
                        {fill(platforms.waitlistNote, { product: product.name })}
                      </p>
                    )}
                    <div className="mt-8 lg:mt-auto lg:pt-10">
                      <a
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener" : undefined}
                        className={buttonClasses(
                          comingSoon ? "secondary" : "product",
                          "lg",
                          "w-full sm:w-auto",
                        )}
                      >
                        {comingSoon
                          ? common.cta.joinWaitlist
                          : fill(common.cta.visitSite, { product: product.name })}
                        {link.external ? (
                          <>
                            <ArrowUpRight aria-hidden className="size-4" />
                            <span className="sr-only">({common.opensInNewTab})</span>
                          </>
                        ) : (
                          <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
                        )}
                      </a>
                    </div>
                  </div>

                  <div className="lg:col-span-7">
                    <figure aria-label={fill(platforms.previewLabel, { product: product.name })}>
                      {/* Server HTML and first paint show final states; a product sliding in replays its preview. */}
                      <m.div
                        key={selected ? `on-${index}` : "off"}
                        initial={selected && moved ? { opacity: 0, y: 16, scale: 0.98 } : false}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        aria-hidden
                      >
                        <ProductPreview slug={product.slug} copy={platforms.previews} />
                      </m.div>
                      <figcaption className="mt-3 text-end text-[0.7rem] text-subtle">
                        {common.syntheticData}
                      </figcaption>
                    </figure>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Discovery: where you are, what's next, and the controls. */}
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div aria-hidden className="flex items-center gap-1.5">
            {items.map((product, i) => (
              <span
                key={product.slug}
                data-product={product.slug}
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] duration-[var(--motion-base)] ease-out-expo",
                  i === index ? "w-6 bg-product" : "w-1.5 bg-line-strong",
                )}
              />
            ))}
          </div>
          <p className="truncate text-xs text-subtle" aria-live="polite">
            <span className="sr-only">{items[index]?.name} · </span>
            {fill(platforms.position, { current: String(index + 1), total: String(items.length) })}
            <span className="ms-2 md:hidden">· {platforms.swipeHint}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rotation ? (
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? platforms.pauseRotation : platforms.playRotation}
              className="inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text motion-reduce:hidden"
            >
              {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label={platforms.previous}
            aria-controls={`${baseId}-panel-${active}`}
            className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface text-muted transition-[color,border-color,transform] duration-[var(--motion-fast)] hover:border-line-strong hover:text-text active:scale-95"
          >
            <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-controls={`${baseId}-panel-${active}`}
            data-product={nextProduct?.slug}
            className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface ps-4 pe-3 text-sm text-muted transition-[color,border-color,transform] duration-[var(--motion-fast)] hover:border-product/50 hover:text-text active:scale-95"
          >
            {/* Visible from sm up; the accessible name always names the next product. */}
            <span className="sr-only sm:not-sr-only">
              {fill(platforms.upNext, { product: nextProduct?.name ?? "" })}
            </span>
            <ChevronRight
              aria-hidden
              className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
