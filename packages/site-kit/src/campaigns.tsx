"use client";

import { cn, fieldClasses, formatMoment } from "@figbud/ui";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Gift, X } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  type CSSProperties,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { DemoControl, useAutoDemo } from "./auto-demo";
import { type MediaInfo, mediaImageSources } from "./blocks";
import { type BrandProfile, hasLogo } from "./brand";
import { BrandLogo } from "./brand-logo";

/* ------------------------------------------------------------------ types */

export type CampaignAction = "link" | "demo" | "waitlist" | "contact" | "webinar" | "start_now" | "book_demo";
export type CampaignPlacement =
  "announcement_bar" | "below_nav" | "home_hero" | "floating" | "modal" | "footer";

export interface CampaignCta {
  label: string;
  action: CampaignAction;
  href?: string | null;
}

export interface CampaignReward {
  id: string;
  label: string;
  description?: string | null;
  kind: string;
  available: boolean;
  /** Disclosed chance of winning, in percent. */
  odds: number;
}

/** A live campaign as `GET /v1/sites/{slug}/campaigns` returns it. */
export interface LiveCampaign {
  id: string;
  reference: string;
  kind: string;
  priority: number;
  /** Customer and partner banners (P10-B1). */
  announcement?: {
    kind: string;
    appearance: "auto" | "light" | "dark";
    organization?: { name?: string | null; logo?: MediaInfo | null } | null;
  } | null;
  content: {
    badge?: string | null;
    headline: string;
    subheadline?: string | null;
    body_html?: string | null;
    primary?: CampaignCta | null;
    secondary?: CampaignCta | null;
    terms_html?: string | null;
    promo_code?: string | null;
    countdown?: boolean;
    media?: MediaInfo | null;
  };
  design: {
    template: "spotlight" | "split" | "minimal";
    align: "start" | "center";
    background: "brand" | "gradient" | "soft" | "surface";
    show_logo: boolean;
    radius: "rounded" | "soft" | "square";
    animation: "rise" | "none" | "fade";
    button: "solid" | "outline";
    image_position: "end" | "start" | "background";
    scale: "standard" | "compact" | "large";
  };
  display: {
    placements: CampaignPlacement[];
    pages: "all" | "home" | "blog" | "contact" | "products" | "custom";
    paths: string[];
    devices: "all" | "desktop" | "mobile";
    frequency: "always" | "session" | "once" | "daily" | "weekly";
    trigger: "immediate" | "delay" | "scroll" | "exit_intent";
    trigger_value: number;
    dismissible: boolean;
    /** The announcement bar's presentation (18 Nov 2026); expanded when absent. */
    bar?: "expanded" | "compact" | "collapsible" | "auto_collapse";
    /** Seconds before an auto-collapsing bar folds. */
    collapse_after?: number;
    /** Takes turns in the bar with the other rotating announcements. */
    rotate?: boolean;
    /** Seconds each rotating announcement shows. */
    rotate_every?: number;
  };
  schedule: { starts_at?: string | null; ends_at?: string | null };
  rewards?: {
    max_attempts: number;
    eligibility: string;
    redeem_days: number;
    applicable?: string | null;
    restrictions?: string | null;
    rewards: CampaignReward[];
  } | null;
}

export interface CampaignLabels {
  close: string;
  dismiss: string;
  endsIn: string;
  code: string;
  copy: string;
  copied: string;
  terms: string;
  spin: string;
  spinning: string;
  email: string;
  accept: string;
  odds: string;
  attempts: string;
  won: string;
  redeemBy: string;
  allClaimed: string;
  error: string;
  open: string;
  /** The announcement bar's controls (18 Nov 2026). */
  previous: string;
  next: string;
  expand: string;
  collapse: string;
}

const LABELS: CampaignLabels = {
  close: "Close",
  dismiss: "Dismiss",
  endsIn: "Ends in",
  code: "Code",
  copy: "Copy code",
  copied: "Copied",
  terms: "Terms and conditions",
  spin: "Spin the wheel",
  spinning: "Spinning…",
  email: "Your email",
  accept: "I accept the rules and the terms and conditions.",
  odds: "Chances",
  attempts: "Attempts per person",
  won: "You won",
  redeemBy: "Redeem by",
  allClaimed: "Every reward in this promotion has been claimed.",
  error: "That didn't work. Please try again.",
  open: "Open promotion",
  previous: "Previous announcement",
  next: "Next announcement",
  expand: "Show the whole announcement",
  collapse: "Fold the announcement",
};

interface Context {
  campaigns: LiveCampaign[];
  apiOrigin: string;
  /** Contact form address with this website's product, e.g. `/en/contact?product=zirahr`. */
  enquiryUrl: string;
  /** Strips the locale or site prefix from the pathname (`/en/blog` → `/blog`). */
  pathPrefix: string;
  brand?: BrandProfile | null;
  product: string;
  mediaBase?: string;
  labels: CampaignLabels;
  /** The Studio's preview: no storage, events or triggers. */
  preview?: boolean;
}

const CampaignContext = createContext<Context | null>(null);

/* ---------------------------------------------------------------- helpers */

const ENQUIRY_KIND: Record<Exclude<CampaignAction, "link" | "start_now" | "book_demo">, string> = {
  demo: "demo_request",
  waitlist: "waitlist",
  contact: "contact",
  webinar: "contact",
};

function ctaHref(cta: CampaignCta, campaign: LiveCampaign, ctx: Context): string {
  if (cta.action === "link") {
    const href = cta.href ?? "/";
    // Site paths follow the website's address (locale or site prefix).
    return href.startsWith("/") && !href.startsWith("//")
      ? `${ctx.pathPrefix}${href === "/" ? "" : href}` || "/"
      : href;
  }
  // Opened in place by `CtaActions`, which reads the campaign from `data-campaign` (P8-M8).
  if (cta.action === "start_now") return "#start-now";
  if (cta.action === "book_demo") return "#book-demo";
  const sep = ctx.enquiryUrl.includes("?") ? "&" : "?";
  return `${ctx.enquiryUrl}${sep}kind=${ENQUIRY_KIND[cta.action]}&campaign=${campaign.id}`;
}

function pageMatches(campaign: LiveCampaign, path: string): boolean {
  const p = path.replace(/\/+$/, "") || "/";
  switch (campaign.display.pages) {
    case "all":
      return true;
    case "home":
      return p === "/";
    case "blog":
      return p === "/blog" || p.startsWith("/blog/");
    case "contact":
      return p === "/contact";
    case "products":
      return p === "/products" || p.startsWith("/products/");
    case "custom":
      return campaign.display.paths.some(
        (prefix) => p === prefix || p.startsWith(`${prefix.replace(/\/+$/, "")}/`),
      );
  }
}

const storageKey = (id: string) => `fb-campaign:${id}`;

function suppressed(campaign: LiveCampaign): boolean {
  const { frequency } = campaign.display;
  try {
    // Dismissed during this visit: not shown again until the next (18 Nov 2026).
    if (sessionStorage.getItem(`${storageKey(campaign.id)}:dismissed`) !== null) return true;
    if (frequency === "always") return false;
    if (frequency === "session") return sessionStorage.getItem(storageKey(campaign.id)) !== null;
    const at = Number(localStorage.getItem(storageKey(campaign.id)) ?? 0);
    if (!at) return false;
    if (frequency === "once") return true;
    return Date.now() - at < (frequency === "daily" ? 864e5 : 7 * 864e5);
  } catch {
    return false;
  }
}

/** Remembers that the visitor saw or dismissed it (their browser only). */
function remember(campaign: LiveCampaign) {
  try {
    if (campaign.display.frequency === "session") sessionStorage.setItem(storageKey(campaign.id), "1");
    else if (campaign.display.frequency !== "always")
      localStorage.setItem(storageKey(campaign.id), String(Date.now()));
  } catch {
    // Storage blocked: it may show again, which is harmless.
  }
}

function track(ctx: Context, id: string, kind: "impression" | "click" | "dismiss" | "conversion") {
  if (ctx.preview) return;
  void fetch(`${ctx.apiOrigin.replace(/\/$/, "")}/v1/campaigns/${id}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind }),
    keepalive: true,
  }).catch(() => undefined);
}

const ended = (c: LiveCampaign, now: number) =>
  Boolean(c.schedule.ends_at && Date.parse(c.schedule.ends_at) <= now);

/** Whether the campaign's display trigger has fired (delay, scroll, exit intent). */
function useTriggered(campaign: LiveCampaign | undefined, preview?: boolean): boolean {
  const [fired, setFired] = useState(false);
  useEffect(() => {
    if (!campaign) return;
    const { trigger, trigger_value } = campaign.display;
    if (preview || trigger === "immediate") {
      setFired(true);
      return;
    }
    if (trigger === "delay") {
      const timer = setTimeout(() => setFired(true), trigger_value * 1000);
      return () => clearTimeout(timer);
    }
    if (trigger === "scroll") {
      const onScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (max <= 0 || (window.scrollY / max) * 100 >= trigger_value) setFired(true);
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }
    // Exit intent: desktop pointers leaving through the top of the window.
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const onLeave = (event: MouseEvent) => {
      if (event.clientY <= 0 && !event.relatedTarget) setFired(true);
    };
    document.addEventListener("mouseout", onLeave);
    return () => document.removeEventListener("mouseout", onLeave);
  }, [campaign, preview]);
  return fired;
}

/**
 * The campaign to show in a placement on this page: matching page, device,
 * frequency and schedule; highest priority wins. Hides itself when the
 * campaign ends, even if the page stays open.
 */
function useCampaign(placement: CampaignPlacement) {
  const ctx = useContext(CampaignContext);
  const pathname = usePathname() ?? "/";
  const [ready, setReady] = useState(false);
  // Set on mount: campaigns never render on the server (time and storage are the visitor's).
  const [now, setNow] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    setReady(true);
    setNow(Date.now());
    const query = window.matchMedia("(min-width: 768px)");
    setDesktop(query.matches);
    const onChange = () => setDesktop(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const path =
    ctx && pathname.startsWith(ctx.pathPrefix) ? pathname.slice(ctx.pathPrefix.length) || "/" : pathname;
  const campaign = useMemo(() => {
    if (!ctx || (!ready && !ctx.preview)) return undefined;
    return ctx.campaigns
      .filter((c) => c.display.placements.includes(placement))
      .filter((c) => ctx.preview || pageMatches(c, path))
      .filter((c) => c.display.devices === "all" || (c.display.devices === "desktop") === desktop)
      .filter((c) => !ended(c, now))
      .filter((c) => ctx.preview || !suppressed(c))
      .filter((c) => c.id !== dismissed)
      .sort((a, b) => b.priority - a.priority)[0];
  }, [ctx, ready, placement, path, desktop, now, dismissed]);
  // Re-check when the campaign ends.
  useEffect(() => {
    const end = campaign?.schedule.ends_at ? Date.parse(campaign.schedule.ends_at) - Date.now() : null;
    if (end === null || end > 2 ** 31 - 1) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, end) + 50);
    return () => clearTimeout(timer);
  }, [campaign]);
  const dismiss = useCallback(
    (target: LiveCampaign | undefined = campaign) => {
      if (!target || !ctx) return;
      if (!ctx.preview) {
        remember(target);
        try {
          sessionStorage.setItem(`${storageKey(target.id)}:dismissed`, "1");
        } catch {
          // Storage blocked: it may show again on the next page, which is harmless.
        }
      }
      track(ctx, target.id, "dismiss");
      setDismissed(target.id);
    },
    [campaign, ctx],
  );
  // Every eligible campaign, best first: the announcement bar rotates through them.
  const eligible = useMemo(() => {
    if (!ctx || (!ready && !ctx.preview)) return [];
    return ctx.campaigns
      .filter((c) => c.display.placements.includes(placement))
      .filter((c) => ctx.preview || pageMatches(c, path))
      .filter((c) => c.display.devices === "all" || (c.display.devices === "desktop") === desktop)
      .filter((c) => !ended(c, now))
      .filter((c) => ctx.preview || !suppressed(c))
      .filter((c) => c.id !== dismissed)
      .sort((a, b) => b.priority - a.priority);
  }, [ctx, ready, placement, path, desktop, now, dismissed]);
  return { ctx, campaign, dismiss, eligible };
}

/** Counts one impression when a campaign appears (and remembers modals/floating as seen). */
function useImpression(
  ctx: Context | null,
  campaign: LiveCampaign | undefined,
  visible: boolean,
  rememberOnShow = false,
) {
  const counted = useRef<string | null>(null);
  useEffect(() => {
    if (!ctx || !campaign || !visible || counted.current === campaign.id) return;
    counted.current = campaign.id;
    track(ctx, campaign.id, "impression");
    if (rememberOnShow && !ctx.preview) remember(campaign);
  }, [ctx, campaign, visible, rememberOnShow]);
}

/* -------------------------------------------------------------- provider */

export function CampaignProvider({
  children,
  labels,
  ...value
}: Omit<Context, "labels"> & { children: ReactNode; labels?: Partial<CampaignLabels> }) {
  const ctx = useMemo(() => ({ ...value, labels: { ...LABELS, ...labels } }), [value, labels]);
  return <CampaignContext.Provider value={ctx}>{children}</CampaignContext.Provider>;
}

/* ------------------------------------------------------------ appearance */

const RADIUS = {
  rounded: "rounded-[var(--radius-panel)]",
  soft: "rounded-xl",
  square: "rounded-none",
} as const;

function surface(campaign: LiveCampaign): { className: string; style?: CSSProperties; onBrand: boolean } {
  switch (campaign.design.background) {
    case "brand":
      return { className: "bg-product text-product-ink", onBrand: true };
    case "gradient":
      return {
        className: "text-product-ink",
        style: { backgroundImage: "linear-gradient(135deg, var(--product), var(--product-2))" },
        onBrand: true,
      };
    case "soft":
      return { className: "bg-product-soft text-text", onBrand: false };
    case "surface":
      return { className: "border border-line bg-surface text-text", onBrand: false };
  }
}

function Countdown({ endsAt, label, className }: { endsAt: string; label: string; className?: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Date.parse(endsAt) - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);
  if (left === null) return null;
  const s = Math.floor(left / 1000);
  const parts = [
    [Math.floor(s / 86400), "d"],
    [Math.floor((s % 86400) / 3600), "h"],
    [Math.floor((s % 3600) / 60), "m"],
    [s % 60, "s"],
  ] as const;
  return (
    <p className={cn("flex flex-wrap items-center gap-2 text-sm", className)}>
      <span className="opacity-80">{label}</span>
      <span className="flex gap-1.5" role="timer" aria-live="off">
        {parts.map(([value, unit]) => (
          <span
            key={unit}
            className="min-w-11 rounded-lg bg-black/15 px-2 py-1 text-center font-semibold tabular-nums"
          >
            {String(value).padStart(2, "0")}
            <span className="ms-0.5 text-xs font-normal opacity-80">{unit}</span>
          </span>
        ))}
      </span>
    </p>
  );
}

function PromoCode({ code, labels }: { code: string; labels: CampaignLabels }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-current/25 px-3 py-1.5 text-sm">
      <span className="opacity-80">{labels.code}</span>
      <span className="font-mono font-semibold tracking-wider">{code}</span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
          } catch {
            // Clipboard unavailable: the code stays visible to copy by hand.
          }
        }}
        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg hover:bg-black/10"
      >
        {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
        <span className="sr-only">{copied ? labels.copied : labels.copy}</span>
      </button>
    </span>
  );
}

function Button({
  cta,
  campaign,
  ctx,
  primary,
  onBrand,
}: {
  cta: CampaignCta;
  campaign: LiveCampaign;
  ctx: Context;
  primary: boolean;
  onBrand: boolean;
}) {
  const href = ctaHref(cta, campaign, ctx);
  const external = href.startsWith("https://");
  const solid = primary && campaign.design.button === "solid";
  return (
    <a
      href={href}
      data-campaign={campaign.id}
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
      onClick={() => track(ctx, campaign.id, "click")}
      className={cn(
        "group/cta inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-[filter,background-color] focus-visible:outline-2 focus-visible:outline-offset-2",
        solid
          ? onBrand
            ? "bg-product-ink text-product hover:brightness-125 focus-visible:outline-product-ink"
            : "bg-product text-product-ink hover:brightness-110 focus-visible:outline-product"
          : onBrand
            ? "border border-current/40 hover:bg-black/10"
            : "border border-line-strong text-text hover:bg-surface-2",
      )}
    >
      {cta.label}
      {primary && (
        <ArrowRight
          aria-hidden
          className="size-4 transition-transform group-hover/cta:translate-x-0.5 rtl:rotate-180"
        />
      )}
    </a>
  );
}

function Logo({ ctx, onBrand, height }: { ctx: Context; onBrand: boolean; height: number }) {
  const logos = ctx.brand?.logos;
  const pair = hasLogo(logos?.symbol) ? logos?.symbol : logos?.horizontal;
  if (!hasLogo(pair)) return null;
  return (
    <BrandLogo pair={pair} height={height} maxWidth={height * 4} alt="" on={onBrand ? "dark" : undefined} />
  );
}

/** The campaign's content: used by every placement, sized by `variant`. */
/** A banner can stay in one theme whichever the page uses; others follow the page. */
function Appearance({ campaign, children }: { campaign: LiveCampaign; children: ReactNode }) {
  const appearance = campaign.announcement?.appearance;
  if (!appearance || appearance === "auto") return <>{children}</>;
  return (
    <div data-theme={appearance} className="contents">
      {children}
    </div>
  );
}

/** The named organisation: its logo when it has one, otherwise its name. */
function Organization({ campaign, ctx }: { campaign: LiveCampaign; ctx: Context }) {
  const organization = campaign.announcement?.organization;
  if (!organization?.name) return null;
  if (!organization.logo) return <span className="text-sm font-semibold">{organization.name}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...mediaImageSources(organization.logo, true, ctx.mediaBase)}
      alt={organization.name}
      className="h-7 w-auto max-w-40 rounded bg-white object-contain p-1"
    />
  );
}

function Creative({
  campaign,
  ctx,
  variant,
  onDismiss,
  titleId,
}: {
  campaign: LiveCampaign;
  ctx: Context;
  variant: "banner" | "card" | "dialog";
  onDismiss?: () => void;
  titleId?: string;
}) {
  const { content, design } = campaign;
  const look = surface(campaign);
  const center = design.align === "center";
  const large = design.scale === "large" && variant !== "card";
  const compact = design.scale === "compact" || variant === "card";
  const media = content.media;
  const showImage = media && design.template === "split" && variant !== "card";
  const background = media && design.image_position === "background" && variant !== "card";
  const animate =
    design.animation === "rise"
      ? "motion-safe:animate-[fb-campaign-in_500ms_var(--ease-out-expo)]"
      : design.animation === "fade"
        ? "motion-safe:animate-[fb-campaign-fade_400ms_ease-out]"
        : "";
  return (
    <Appearance campaign={campaign}>
      <div
        data-product={ctx.product}
        data-campaign={campaign.reference}
        className={cn("relative isolate overflow-hidden", RADIUS[design.radius], look.className, animate)}
        style={look.style}
      >
        {background && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              {...mediaImageSources(media, true, ctx.mediaBase)}
              alt=""
              className="absolute inset-0 -z-20 size-full object-cover"
            />
            <div aria-hidden className="absolute inset-0 -z-10 bg-black/45" />
          </>
        )}
        {!background && look.onBrand && (
          <div
            aria-hidden
            className="pointer-events-none absolute -end-24 -top-24 -z-10 size-72 rounded-full bg-white/15 blur-2xl"
          />
        )}
        <div
          className={cn(
            "grid gap-6",
            variant === "card"
              ? "p-5"
              : variant === "dialog"
                ? "p-6 sm:p-8"
                : compact
                  ? "p-5 sm:p-6"
                  : "p-6 sm:p-10 lg:p-12",
            showImage && "md:grid-cols-2 md:items-center md:gap-10",
          )}
        >
          <div
            className={cn(
              "min-w-0",
              center && "text-center",
              showImage && design.image_position === "start" && "md:order-2",
            )}
          >
            <div className={cn("flex flex-wrap items-center gap-3", center && "justify-center")}>
              {design.show_logo && (
                <Logo ctx={ctx} onBrand={look.onBrand || Boolean(background)} height={compact ? 24 : 32} />
              )}
              <Organization campaign={campaign} ctx={ctx} />
              {content.badge && (
                <span className="rounded-full bg-black/15 px-3 py-1 text-xs font-semibold tracking-wide uppercase">
                  {content.badge}
                </span>
              )}
            </div>
            <h2
              id={titleId}
              className={cn(
                "mt-4 font-display font-semibold tracking-tight text-balance",
                compact
                  ? "text-xl sm:text-2xl"
                  : large
                    ? "text-headline"
                    : "text-2xl sm:text-3xl lg:text-4xl",
              )}
            >
              {content.headline}
            </h2>
            {content.subheadline && (
              <p
                className={cn(
                  "mt-2 opacity-90",
                  compact ? "text-sm" : "text-base sm:text-lg",
                  center && "mx-auto",
                  "max-w-2xl",
                )}
              >
                {content.subheadline}
              </p>
            )}
            {content.body_html && variant !== "card" && (
              <div
                className={cn(
                  "fb-prose mt-3 max-w-2xl text-sm opacity-90 [&_a]:underline",
                  center && "mx-auto",
                )}
                // Rendered and sanitised by the API's Markdown pipeline.
                dangerouslySetInnerHTML={{ __html: content.body_html }}
              />
            )}
            {content.countdown && campaign.schedule.ends_at && (
              <Countdown
                endsAt={campaign.schedule.ends_at}
                label={ctx.labels.endsIn}
                className={cn("mt-4", center && "justify-center")}
              />
            )}
            {(content.primary || content.secondary || content.promo_code) && (
              <div
                className={cn(
                  "mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center",
                  center && "sm:justify-center",
                )}
              >
                {content.primary && (
                  <Button
                    cta={content.primary}
                    campaign={campaign}
                    ctx={ctx}
                    primary
                    onBrand={look.onBrand || Boolean(background)}
                  />
                )}
                {content.secondary && (
                  <Button
                    cta={content.secondary}
                    campaign={campaign}
                    ctx={ctx}
                    primary={false}
                    onBrand={look.onBrand || Boolean(background)}
                  />
                )}
                {content.promo_code && <PromoCode code={content.promo_code} labels={ctx.labels} />}
              </div>
            )}
            {campaign.rewards && <SpinToWin campaign={campaign} ctx={ctx} onBrand={look.onBrand} />}
            {content.terms_html && variant !== "card" && !campaign.rewards && (
              <details className={cn("mt-4 text-xs opacity-80", center && "mx-auto max-w-2xl")}>
                <summary className="cursor-pointer">{ctx.labels.terms}</summary>
                <div className="fb-prose mt-2" dangerouslySetInnerHTML={{ __html: content.terms_html }} />
              </details>
            )}
          </div>
          {showImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...mediaImageSources(media, false, ctx.mediaBase)}
              alt={media.alt}
              width={media.width}
              height={media.height}
              loading="lazy"
              decoding="async"
              className={cn(
                "h-auto w-full object-cover",
                RADIUS[design.radius] === "rounded-none" ? "" : "rounded-2xl",
              )}
            />
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute end-2 top-2 inline-flex size-10 items-center justify-center rounded-full hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-current"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">{ctx.labels.dismiss}</span>
          </button>
        )}
      </div>
    </Appearance>
  );
}

/* ------------------------------------------------------------ placements */

/**
 * An inline placement: the announcement bar above the header, a banner
 * below the navigation, the home page hero or a band above the footer.
 */
export function CampaignSlot({
  placement,
  className,
}: {
  placement: "announcement_bar" | "below_nav" | "home_hero" | "footer";
  className?: string;
}) {
  const { ctx, campaign, dismiss, eligible } = useCampaign(placement);
  const fired = useTriggered(campaign, ctx?.preview);
  const visible = Boolean(ctx && campaign && fired);
  useImpression(ctx, campaign, visible);
  if (!ctx || !campaign || !fired) return null;
  const onDismiss = campaign.display.dismissible ? () => dismiss() : undefined;
  if (placement === "announcement_bar")
    return (
      <AnnouncementBar
        ctx={ctx}
        // The best campaign leads; if it rotates, the other rotating ones take turns after it.
        campaigns={campaign.display.rotate ? eligible.filter((c) => c.display.rotate) : [campaign]}
        onDismiss={dismiss}
        className={className}
      />
    );
  return (
    <section aria-label={campaign.content.headline} className={className}>
      <Creative campaign={campaign} ctx={ctx} variant="banner" onDismiss={onDismiss} />
    </section>
  );
}

/** The floating card and the modal; at most one of each per page. */
export function CampaignOverlays() {
  return (
    <>
      <FloatingCampaign />
      <ModalCampaign />
    </>
  );
}

function FloatingCampaign() {
  const { ctx, campaign, dismiss } = useCampaign("floating");
  const fired = useTriggered(campaign, ctx?.preview);
  const [open, setOpen] = useState(true);
  useImpression(ctx, campaign, Boolean(campaign && fired), true);
  if (!ctx || !campaign || !fired) return null;
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-product={ctx.product}
        className="fixed end-4 bottom-4 z-40 inline-flex size-14 items-center justify-center rounded-full bg-product text-product-ink shadow-[var(--shadow-elevated)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-product"
      >
        <Gift aria-hidden className="size-6" />
        <span className="sr-only">{ctx.labels.open}</span>
      </button>
    );
  return (
    <aside
      aria-label={campaign.content.headline}
      className="fixed inset-x-4 bottom-4 z-40 sm:inset-x-auto sm:end-5 sm:bottom-5 sm:w-[22rem]"
    >
      <div className="shadow-[var(--shadow-elevated)]">
        <Creative
          campaign={campaign}
          ctx={ctx}
          variant="card"
          onDismiss={
            campaign.display.dismissible
              ? () => (campaign.display.frequency === "always" ? setOpen(false) : dismiss())
              : undefined
          }
        />
      </div>
    </aside>
  );
}

function ModalCampaign() {
  const { ctx, campaign, dismiss } = useCampaign("modal");
  const fired = useTriggered(campaign, ctx?.preview);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = Boolean(ctx && campaign && fired);
  useImpression(ctx, campaign, open, true);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open || dialog.open) return;
    // Never stack on top of the cookie banner or another dialog.
    if (document.querySelector("[data-consent-banner], dialog[open]")) return;
    dialog.showModal();
  }, [open]);
  if (!ctx || !campaign || !fired) return null;
  const close = () => {
    ref.current?.close();
    dismiss();
  };
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (!campaign.display.dismissible) event.preventDefault();
        else dismiss();
      }}
      onClick={(event) => {
        if (event.target === ref.current && campaign.display.dismissible) close();
      }}
      className="fb-overlay m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto bg-transparent p-0 backdrop:bg-black/60"
    >
      <Creative
        campaign={campaign}
        ctx={ctx}
        variant="dialog"
        titleId={titleId}
        onDismiss={campaign.display.dismissible ? close : undefined}
      />
    </dialog>
  );
}

/* ------------------------------------------------------------ spin to win */

const WHEEL_COLOURS = [
  "var(--product)",
  "var(--product-2)",
  "color-mix(in oklab, var(--product) 70%, white)",
  "color-mix(in oklab, var(--product-2) 70%, black)",
];

/**
 * Spin to win: the visitor reads the rules, enters an email and accepts the
 * terms; the API decides the reward and the wheel turns to show it.
 */
function SpinToWin({ campaign, ctx, onBrand }: { campaign: LiveCampaign; ctx: Context; onBrand: boolean }) {
  const rules = campaign.rewards!;
  const rewards = rules.rewards;
  const uid = useId();
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    label: string;
    instructions: string;
    code: string;
    redeem_by: string;
  } | null>(null);
  const segment = 360 / Math.max(1, rewards.length);
  const anyLeft = rewards.some((r) => r.available);
  const ready =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    accepted &&
    !busy &&
    !result &&
    anyLeft &&
    !ctx.preview;

  async function spin() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${ctx.apiOrigin.replace(/\/$/, "")}/v1/campaigns/${campaign.id}/spin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, accepted }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.fields?.[0]?.message ?? body?.error?.message ?? ctx.labels.error);
        setBusy(false);
        return;
      }
      const index = Math.max(
        0,
        rewards.findIndex((r) => r.id === body.reward.id),
      );
      // Land the pointer (at the top) in the middle of the won segment.
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const target = 360 * (reduce ? 1 : 6) - (index * segment + segment / 2);
      setRotation((r) => r - (r % 360) + target);
      track(ctx, campaign.id, "conversion");
      setTimeout(
        () => {
          setResult({
            label: body.reward.label,
            instructions: body.reward.instructions,
            code: body.code,
            redeem_by: body.redeem_by,
          });
          setBusy(false);
        },
        reduce ? 0 : 4300,
      );
    } catch {
      setError(ctx.labels.error);
      setBusy(false);
    }
  }

  const gradient = rewards
    .map((_, i) => `${WHEEL_COLOURS[i % WHEEL_COLOURS.length]} ${i * segment}deg ${(i + 1) * segment}deg`)
    .join(", ");

  return (
    <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,15rem)_1fr] sm:items-start">
      <div className="relative mx-auto aspect-square w-full max-w-60" aria-hidden>
        <div className="absolute start-1/2 -top-1 z-10 -translate-x-1/2 rtl:translate-x-1/2">
          <div className="size-0 border-x-[10px] border-t-[16px] border-x-transparent border-t-product-ink drop-shadow" />
        </div>
        <div
          className="size-full rounded-full border-4 border-product-ink/70 shadow-[var(--shadow-elevated)] transition-transform duration-[4200ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{ backgroundImage: `conic-gradient(${gradient})`, transform: `rotate(${rotation}deg)` }}
        >
          {rewards.map((r, i) => (
            <span
              key={r.id}
              className="absolute start-1/2 top-1/2 w-1/2 origin-left -translate-y-1/2 truncate ps-8 pe-2 text-[0.65rem] font-semibold text-product-ink"
              style={{ transform: `rotate(${i * segment + segment / 2 - 90}deg)` }}
            >
              {r.label}
            </span>
          ))}
        </div>
        <div className="absolute start-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-product-ink/70 bg-product rtl:translate-x-1/2" />
      </div>

      <div className="min-w-0">
        {result ? (
          <div role="status" className={cn("rounded-2xl p-4", onBrand ? "bg-black/15" : "bg-surface-2")}>
            <p className="text-sm opacity-80">{ctx.labels.won}</p>
            <p className="mt-1 font-display text-xl font-semibold">{result.label}</p>
            <p className="mt-2 text-sm">{result.instructions}</p>
            <div className="mt-3">
              <PromoCode code={result.code} labels={ctx.labels} />
            </div>
            <p className="mt-2 text-xs opacity-80">
              {/* A deadline, shown with its time zone (East Africa Time). */}
              {ctx.labels.redeemBy} {formatMoment(result.redeem_by)}
            </p>
          </div>
        ) : (
          <form
            method="post"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) void spin();
            }}
            className="space-y-3"
          >
            <p className="text-sm">{rules.eligibility}</p>
            <label className="block text-sm font-medium">
              {ctx.labels.email}
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClasses("mt-1 px-3")}
              />
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--product)]"
              />
              {ctx.labels.accept}
            </label>
            <button
              type="submit"
              disabled={!ready}
              className={cn(
                "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60",
                onBrand ? "bg-product-ink text-product" : "bg-product text-product-ink",
              )}
            >
              <Gift aria-hidden className="size-4" />
              {busy ? ctx.labels.spinning : ctx.labels.spin}
            </button>
            {!anyLeft && <p className="text-sm">{ctx.labels.allClaimed}</p>}
            {error && (
              <p role="alert" className="text-sm font-medium">
                {error}
              </p>
            )}
          </form>
        )}
        <details className="mt-4 text-xs opacity-85">
          <summary className="cursor-pointer">{ctx.labels.terms}</summary>
          <div className="mt-2 space-y-2">
            <table className="w-full text-start">
              <caption className="sr-only">{ctx.labels.odds}</caption>
              <tbody>
                {rewards.map((r) => (
                  <tr key={r.id} className={cn(!r.available && "line-through opacity-60")}>
                    <td className="py-0.5 pe-3">{r.label}</td>
                    <td className="py-0.5 text-end tabular-nums">{r.odds}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p id={`${uid}-attempts`}>
              {ctx.labels.attempts}: {rules.max_attempts}
            </p>
            {rules.applicable && <p>{rules.applicable}</p>}
            {rules.restrictions && <p>{rules.restrictions}</p>}
            {campaign.content.terms_html && (
              <div className="fb-prose" dangerouslySetInnerHTML={{ __html: campaign.content.terms_html }} />
            )}
          </div>
        </details>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- studio */

/** The Studio's live preview of one campaign in one placement. */
export function CampaignPreview({
  campaign,
  placement,
  ...value
}: Omit<Context, "labels" | "campaigns" | "preview"> & {
  campaign: LiveCampaign;
  placement: CampaignPlacement;
}) {
  const ctx: Context = { ...value, campaigns: [campaign], preview: true, labels: LABELS };
  return (
    <CampaignContext.Provider value={ctx}>
      {placement === "floating" ? (
        <div className="ms-auto w-full max-w-[22rem]">
          <Creative
            campaign={campaign}
            ctx={ctx}
            variant="card"
            onDismiss={campaign.display.dismissible ? () => undefined : undefined}
          />
        </div>
      ) : placement === "modal" ? (
        <div className="mx-auto w-full max-w-[36rem]">
          <Creative
            campaign={campaign}
            ctx={ctx}
            variant="dialog"
            onDismiss={campaign.display.dismissible ? () => undefined : undefined}
          />
        </div>
      ) : (
        <CampaignSlot placement={placement} />
      )}
    </CampaignContext.Provider>
  );
}

const collapsedKey = (id: string) => `fb-campaign:${id}:collapsed`;

/**
 * The announcement bar (owner's brief, 18 Nov 2026): expanded (the whole
 * message, its supporting line and both buttons), compact (one slim line),
 * collapsible (folds to the slim line and back; the visitor's choice is
 * remembered for that campaign), or auto-collapsing (folds after a few
 * seconds; a visitor can open it again). Several live announcements set to
 * rotate take turns, on the shared demonstration clock: they pause while
 * hovered or focused, a choice holds, there's a pause button, and nothing
 * moves by itself with reduced motion. Heights animate without moving the
 * page abruptly, and never with reduced motion.
 */
function AnnouncementBar({
  ctx,
  campaigns,
  onDismiss,
  className,
}: {
  ctx: Context;
  campaigns: LiveCampaign[];
  onDismiss: (campaign: LiveCampaign) => void;
  className?: string;
}) {
  const demo = useAutoDemo<HTMLDivElement>({
    durations: campaigns.map((c) => Math.min(30, Math.max(4, c.display.rotate_every ?? 8)) * 1000),
    // Keeps taking turns (a long while, not forever: rotation rests eventually).
    passes: 50,
    resumeAfter: 15_000,
  });
  const campaign = campaigns[Math.min(demo.index, campaigns.length - 1)] ?? campaigns[0]!;
  const mode = campaign.display.bar ?? "expanded";
  const [collapsed, setCollapsed] = useState<boolean>(mode === "compact");
  const opened = useRef(false);
  // Each campaign starts as its mode says, or as the visitor last left it.
  useEffect(() => {
    opened.current = false;
    if (mode === "compact") return setCollapsed(true);
    if (mode === "collapsible") {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(collapsedKey(campaign.id));
      } catch {
        // Storage blocked: start expanded.
      }
      return setCollapsed(saved === "1");
    }
    setCollapsed(false);
    if (mode !== "auto_collapse") return;
    const timer = window.setTimeout(
      () => !opened.current && setCollapsed(true),
      Math.min(60, Math.max(3, campaign.display.collapse_after ?? 8)) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [campaign.id, mode, campaign.display.collapse_after]);
  const toggle = () => {
    const next = !collapsed;
    opened.current = !next;
    setCollapsed(next);
    if (mode === "collapsible") {
      try {
        localStorage.setItem(collapsedKey(campaign.id), next ? "1" : "0");
      } catch {
        // Storage blocked: the choice lasts until the page changes.
      }
    }
  };
  const look = surface(campaign);
  const primary = campaign.content.primary;
  const secondary = campaign.content.secondary;
  const folds = mode === "collapsible" || mode === "auto_collapse";
  const many = campaigns.length > 1;
  const regionId = `fb-bar-${campaign.id}`;
  const link = (cta: CampaignCta, strong: boolean) => (
    <a
      href={ctaHref(cta, campaign, ctx)}
      data-campaign={campaign.id}
      onClick={() => track(ctx, campaign.id, "click")}
      className={cn(
        "inline-flex min-h-9 items-center gap-1 whitespace-nowrap underline-offset-4",
        strong
          ? "rounded-full border border-current/40 px-3 font-semibold hover:bg-black/10"
          : "font-medium underline",
      )}
    >
      {cta.label}
      <ArrowRight aria-hidden className="size-3.5 rtl:rotate-180" />
    </a>
  );
  return (
    <Appearance campaign={campaign}>
      <div
        ref={demo.ref}
        role="region"
        aria-label={campaign.content.headline}
        data-product={ctx.product}
        data-campaign={campaign.reference}
        data-bar={mode}
        data-collapsed={collapsed || undefined}
        className={cn("relative px-12 text-sm", look.className, className)}
        style={look.style}
        onMouseEnter={() => demo.hold(true)}
        onMouseLeave={() => demo.hold(false)}
      >
        <div
          key={campaign.id}
          className={cn(
            "fb-rise mx-auto flex max-w-[92rem] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center [animation-duration:.35s]",
            collapsed ? "py-1.5" : "py-2.5",
          )}
        >
          {campaign.content.badge && (
            <span className="rounded-full bg-black/15 px-2 py-0.5 text-xs font-semibold uppercase">
              {campaign.content.badge}
            </span>
          )}
          {campaign.announcement?.organization?.name && (
            <span className="font-semibold">{campaign.announcement.organization.name}:</span>
          )}
          <span className="font-medium">{campaign.content.headline}</span>
          {campaign.content.countdown && campaign.schedule.ends_at && !collapsed && (
            <Countdown
              endsAt={campaign.schedule.ends_at}
              label={ctx.labels.endsIn}
              className="inline-flex text-xs"
            />
          )}
          {primary && link(primary, !collapsed)}
          {/* The supporting line and the second button, while expanded; the height eases open and shut. */}
          <div
            id={regionId}
            className={cn(
              "grid w-full transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
              collapsed || !(campaign.content.subheadline || secondary)
                ? "grid-rows-[0fr] opacity-0"
                : "grid-rows-[1fr] opacity-100",
            )}
            aria-hidden={collapsed || undefined}
            inert={collapsed || undefined}
          >
            <div className="flex min-h-0 flex-wrap items-center justify-center gap-x-3 overflow-hidden">
              {campaign.content.subheadline && (
                <span className="opacity-90">{campaign.content.subheadline}</span>
              )}
              {secondary && link(secondary, false)}
            </div>
          </div>
        </div>
        <div className="absolute end-2 top-1.5 flex items-center gap-0.5">
          {many && (
            <>
              <button
                type="button"
                aria-label={ctx.labels.previous}
                onClick={() => demo.choose((demo.index - 1 + campaigns.length) % campaigns.length)}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-black/10"
              >
                <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />
              </button>
              <button
                type="button"
                aria-label={ctx.labels.next}
                onClick={() => demo.choose((demo.index + 1) % campaigns.length)}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-black/10"
              >
                <ChevronRight aria-hidden className="size-4 rtl:rotate-180" />
              </button>
              <DemoControl
                state={demo.state}
                onToggle={demo.toggle}
                className="size-8 border-current/30 bg-transparent text-current"
              />
            </>
          )}
          {folds && (
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-controls={regionId}
              aria-label={collapsed ? ctx.labels.expand : ctx.labels.collapse}
              onClick={toggle}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-black/10"
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 transition-transform motion-reduce:transition-none",
                  !collapsed && "rotate-180",
                )}
              />
            </button>
          )}
          {campaign.display.dismissible && (
            <button
              type="button"
              onClick={() => onDismiss(campaign)}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-black/10"
            >
              <X aria-hidden className="size-4" />
              <span className="sr-only">{ctx.labels.dismiss}</span>
            </button>
          )}
        </div>
      </div>
    </Appearance>
  );
}
