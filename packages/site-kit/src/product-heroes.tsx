"use client";

import { cn } from "@figbud/ui";
import type { CSSProperties, ReactNode } from "react";

import type { BrandProfile } from "./brand";
import { EditorialHero } from "./editorial-hero";
import { ProductIdentity } from "./brand-logo";
import type { ProductSlug } from "@figbud/brand";
import {
  HeroActions,
  type HeroConfig,
  type HeroDesign,
  heroDepth,
  heroHeight,
  heroPace,
  useHeroMotion,
  useOnScreen,
  usePointerParallax,
  useStages,
  useTween,
} from "./hero-kit";

/*
 * ZiraHR's hero collection (P12-H4). The product website and the Studio
 * preview render these same components. Demonstrations use synthetic data
 * and say so; nothing claims real payroll activity or customer figures.
 */

export interface ProductHeroProps {
  slug: string;
  name: string;
  brand: BrandProfile | null;
  config: HeroConfig;
  /** The pre-filled demo request (corporate enquiry form). */
  demoHref: string;
  /** Where "Explore features" goes by default (the website's platform page). */
  featuresHref: string;
}

const SYNTHETIC = "Illustrative product activity · synthetic data";

const copy = (
  c: HeroConfig,
  fallback: { eyebrow: string; headline: string; accent: string; lead: string },
) => ({
  eyebrow: c.eyebrow || fallback.eyebrow,
  headline: c.headline || fallback.headline,
  accent: c.headline_accent ?? fallback.accent,
  lead: c.lead || fallback.lead,
});

function Shell({
  slug,
  config,
  label,
  text,
  visual,
  identity,
  actions,
}: {
  slug: string;
  config: HeroConfig;
  label: string;
  text: { eyebrow: string; headline: string; accent: string; lead: string };
  visual: ReactNode;
  identity: ReactNode;
  actions: ReactNode;
}) {
  const center = config.align === "center";
  return (
    <section
      aria-labelledby={`hero-${slug}-title`}
      data-product={slug}
      data-hero={label}
      className={cn("relative isolate overflow-hidden", heroHeight(config))}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute end-[-12%] -top-48 h-[44rem] w-[44rem] rounded-full bg-[radial-gradient(closest-side,var(--product-soft),transparent)]" />
        <div className="fb-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_60%_30%,black,transparent_75%)] opacity-50" />
      </div>
      <div
        className={cn(
          "mx-auto grid max-w-[92rem] items-center gap-12 px-5 pt-page-top pb-section-sm sm:px-8 md:px-10 lg:gap-10 lg:px-16",
          center ? "text-center" : "lg:grid-cols-12",
        )}
      >
        <div className={cn(center ? "mx-auto max-w-3xl" : "lg:col-span-5")}>
          <div className={cn("flex", center && "justify-center")}>{identity}</div>
          <p className="mt-6 text-xs font-medium tracking-[0.18em] text-product-text uppercase">
            {text.eyebrow}
          </p>
          {/* The headline renders immediately (it's the page's LCP), never animated in. */}
          <h1
            id={`hero-${slug}-title`}
            className="mt-4 font-display text-display font-semibold text-balance text-text"
          >
            <span className="block">{text.headline}</span>
            {text.accent && (
              <span className="block bg-gradient-to-r from-product to-product-2 bg-clip-text pb-1 text-transparent">
                {text.accent}
              </span>
            )}
          </h1>
          <p className={cn("mt-5 text-lead text-muted", center ? "mx-auto max-w-2xl" : "max-w-xl")}>
            {text.lead}
          </p>
          {actions}
        </div>
        <div className={cn(center ? "mx-auto w-full max-w-5xl" : "lg:col-span-7")}>
          {visual}
          <p className="mt-3 text-end text-[0.7rem] text-subtle">{SYNTHETIC}</p>
        </div>
      </div>
    </section>
  );
}

function Actions({
  config,
  demoHref,
  featuresHref,
}: Pick<ProductHeroProps, "config" | "demoHref" | "featuresHref">) {
  return (
    <HeroActions
      center={config.align === "center"}
      primary={{ label: config.primary_label || "Request a demo", href: config.primary_href || demoHref }}
      secondary={{
        label: config.secondary_label || "Explore features",
        href: config.secondary_href || featuresHref,
      }}
    />
  );
}

const card =
  "rounded-2xl border border-line bg-surface/90 shadow-[0_24px_60px_-36px_rgb(2_6_23/0.55)] backdrop-blur";

/* ------------------------------------------------------------ 01 Workforce */

const LEAVE = [
  { who: "Amani W.", what: "Annual leave · 5 days", state: "Awaiting manager" },
  { who: "Brian O.", what: "Sick leave · 1 day", state: "Approved" },
  { who: "Chebet K.", what: "Study leave · 3 days", state: "Approved" },
];
const DEPARTMENTS = [
  { name: "Operations", value: 148 },
  { name: "Sales", value: 92 },
  { name: "Finance", value: 46 },
  { name: "Technology", value: 71 },
  { name: "People", value: 55 },
];

function WorkforceHero(props: ProductHeroProps) {
  const { config } = props;
  const motion = useHeroMotion(config);
  const depth = heroDepth(config);
  const stage = usePointerParallax<HTMLDivElement>(motion);
  const max = Math.max(...DEPARTMENTS.map((d) => d.value));
  const float = (delay: number): CSSProperties | undefined =>
    motion ? { animation: `fb-float ${6 * heroPace(config)}s ease-in-out ${delay}s infinite` } : undefined;
  return (
    <Shell
      slug={props.slug}
      config={config}
      label="workforce"
      identity={<ProductIdentity slug={props.slug as ProductSlug} brand={props.brand} name={props.name} />}
      text={copy(config, {
        eyebrow: "Your workforce, connected",
        headline: "HR Simplified.",
        accent: "Business Amplified.",
        lead: "People records, payroll and compliance, leave and approvals in one configurable platform built for growing organisations.",
      })}
      actions={<Actions {...props} />}
      visual={
        <div
          ref={stage}
          className="relative [perspective:1600px]"
          style={{ "--depth": depth } as CSSProperties}
        >
          <div
            className={cn(card, "relative p-5 transition-transform duration-500 ease-out sm:p-6")}
            style={{
              transform: motion
                ? "rotateX(calc(var(--py, 0) * -3deg * var(--depth))) rotateY(calc(var(--px, 0) * 4deg * var(--depth)))"
                : undefined,
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-text">Workforce overview · October</p>
              <span className="rounded-full bg-product-soft px-2.5 py-0.5 text-xs text-product-text">
                Live preview
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3">
              {[
                ["Headcount", "412"],
                ["Payroll", "Approved"],
                ["Leave requests", "7 pending"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line bg-bg-elevated/70 p-3">
                  <dt className="text-[0.7rem] text-subtle">{label}</dt>
                  <dd className="mt-1 font-display text-lg font-semibold text-text sm:text-xl">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 grid gap-4 sm:grid-cols-[1.2fr_1fr]">
              <div className="rounded-xl border border-line bg-bg-elevated/70 p-4">
                <p className="text-xs text-subtle">People by department</p>
                <ul className="mt-3 space-y-2.5">
                  {DEPARTMENTS.map((d, i) => (
                    <li key={d.name} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-xs">
                      <span className="text-muted">{d.name}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                        <span
                          className="block h-full origin-left rounded-full bg-product"
                          style={{
                            width: `${(d.value / max) * 100}%`,
                            animation: motion
                              ? `fb-grow 900ms var(--motion-ease) ${200 + i * 90}ms both`
                              : undefined,
                          }}
                        />
                      </span>
                      <span className="text-end font-mono text-text">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-line bg-bg-elevated/70 p-4">
                <p className="text-xs text-subtle">Statutory compliance</p>
                <ul className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {["PAYE", "SHIF", "NSSF", "Housing levy"].map((x) => (
                    <li
                      key={x}
                      className="flex items-center gap-1.5 rounded-lg bg-product-soft px-2 py-1.5 text-product-text"
                    >
                      <span aria-hidden>✓</span>
                      {x}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.7rem] text-subtle">Effective-dated rates · October run</p>
              </div>
            </div>
          </div>
          {/* Floating cards: depth without clutter; still on phones. */}
          <div
            className={cn(card, "absolute -start-4 -bottom-6 hidden w-64 p-4 sm:block lg:-start-10")}
            style={float(0.4)}
          >
            <p className="text-xs text-subtle">Leave requests</p>
            <ul className="mt-2 space-y-2">
              {LEAVE.map((l) => (
                <li key={l.who} className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-product-soft text-[0.65rem] font-semibold text-product-text">
                    {l.who
                      .split(" ")
                      .map((p) => p[0])
                      .join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-text">{l.what}</span>
                    <span
                      className={cn(
                        "block text-[0.65rem]",
                        l.state === "Approved" ? "text-product-text" : "text-subtle",
                      )}
                    >
                      {l.state}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div
            className={cn(card, "absolute -end-3 -top-6 hidden p-3 md:block lg:-end-8")}
            style={float(1.2)}
          >
            <p className="text-[0.7rem] text-subtle">Approval routed</p>
            <p className="mt-0.5 text-xs font-medium text-text">Manager → HR → Payroll</p>
          </div>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------ 02 Payroll */

const STAGES = [
  {
    key: "Prepare",
    title: "October run prepared",
    detail: [
      "412 employees in this run",
      "Allowances and overtime imported",
      "Effective-dated rates for October",
    ],
    totals: { gross: 48.21, deductions: 12.27, net: 35.94 },
  },
  {
    key: "Validate",
    title: "Checks before approval",
    detail: [
      "Bank and mobile money details verified",
      "Statutory rates current from 1 October",
      "2 anomalies flagged for review",
    ],
    totals: { gross: 48.21, deductions: 12.27, net: 35.94 },
  },
  {
    key: "Approve",
    title: "Approved in sequence",
    detail: ["Payroll officer · prepared", "Finance · reviewed", "Managing director · approved"],
    totals: { gross: 48.18, deductions: 12.26, net: 35.92 },
  },
  {
    key: "Disburse",
    title: "Payments released",
    detail: [
      "Bank transfers · 371 employees",
      "Mobile money · 41 employees",
      "Payslips sent to self-service",
    ],
    totals: { gross: 48.18, deductions: 12.26, net: 35.92 },
  },
  {
    key: "Report",
    title: "Returns ready to file",
    detail: ["PAYE return prepared", "SHIF and NSSF schedules prepared", "Housing levy schedule prepared"],
    totals: { gross: 48.18, deductions: 12.26, net: 35.92 },
  },
];

function Money({ value, motion }: { value: number; motion: boolean }) {
  const v = useTween(value, motion);
  return <span className="font-mono tabular-nums">{`KES ${v.toFixed(2)}M`}</span>;
}

function PayrollHero(props: ProductHeroProps) {
  const { config } = props;
  const motion = useHeroMotion(config);
  const { ref, on } = useOnScreen<HTMLDivElement>();
  const { index, choose, hold } = useStages(STAGES.length, 2.8 * heroPace(config), motion && on);
  const stage = STAGES[index]!;
  return (
    <Shell
      slug={props.slug}
      config={config}
      label="payroll"
      identity={<ProductIdentity slug={props.slug as ProductSlug} brand={props.brand} name={props.name} />}
      text={copy(config, {
        eyebrow: "Payroll in motion",
        headline: "Payroll you can see.",
        accent: "Compliance you can trust.",
        lead: "Prepare, validate, approve, disburse and report every run with effective-dated rules and approvals that follow how you work.",
      })}
      actions={<Actions {...props} />}
      visual={
        <div
          ref={ref}
          className={cn(card, "p-5 sm:p-6")}
          onPointerEnter={() => hold(true)}
          onPointerLeave={() => hold(false)}
        >
          <div role="tablist" aria-label="Payroll stages" className="grid grid-cols-5 gap-1.5">
            {STAGES.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={i === index}
                onClick={() => choose(i)}
                className="group flex min-h-11 flex-col justify-center gap-2 py-1 text-start"
              >
                <span className="h-1 overflow-hidden rounded-full bg-surface-3">
                  <span
                    className={cn(
                      "block h-full origin-left rounded-full bg-product transition-transform duration-500",
                      i < index ? "scale-x-100" : i === index ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </span>
                <span
                  className={cn(
                    "text-[0.7rem] font-medium sm:text-xs",
                    i <= index ? "text-text" : "text-subtle",
                  )}
                >
                  {s.key}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-[1.1fr_1fr]">
            <div
              role="tabpanel"
              aria-label={stage.key}
              className="rounded-xl border border-line bg-bg-elevated/70 p-4"
            >
              <p
                key={stage.key}
                className="font-medium text-text"
                style={motion ? { animation: "fb-rise 500ms var(--motion-ease) both" } : undefined}
              >
                {stage.title}
              </p>
              <ul className="mt-3 space-y-2">
                {stage.detail.map((d, i) => (
                  <li
                    key={`${stage.key}-${d}`}
                    className="flex items-start gap-2 text-sm text-muted"
                    style={
                      motion
                        ? { animation: `fb-rise 500ms var(--motion-ease) ${80 + i * 90}ms both` }
                        : undefined
                    }
                  >
                    <span aria-hidden className="mt-0.5 text-product-text">
                      ✓
                    </span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-bg-elevated/70 p-4">
              <p className="text-xs text-subtle">Run summary</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Gross pay</dt>
                  <dd className="text-text">
                    <Money value={stage.totals.gross} motion={motion} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Statutory deductions</dt>
                  <dd className="text-text">
                    <Money value={stage.totals.deductions} motion={motion} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line pt-2">
                  <dt className="font-medium text-text">Net pay</dt>
                  <dd className="font-semibold text-text">
                    <Money value={stage.totals.net} motion={motion} />
                  </dd>
                </div>
              </dl>
              <ul className="mt-4 flex flex-wrap gap-1.5 text-[0.7rem]">
                {["PAYE", "SHIF", "NSSF", "Housing levy"].map((x, i) => (
                  <li
                    key={x}
                    className={cn(
                      "rounded-full border px-2 py-0.5 transition-colors duration-500",
                      index >= 1 + Math.min(i, 3) / 2
                        ? "border-product/40 bg-product-soft text-product-text"
                        : "border-line text-subtle",
                    )}
                  >
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------ 03 Journey */

const JOURNEY = [
  {
    key: "Recruit",
    title: "A new starter is on the way",
    points: [
      "Hiring hands over to HR",
      "Offer details become the employee record",
      "Documents requested once",
    ],
  },
  {
    key: "Onboard",
    title: "Ready from day one",
    points: [
      "Onboarding checklist and documents",
      "Probation and confirmation dates",
      "Self-service access set up",
    ],
  },
  {
    key: "Manage",
    title: "One record, every detail",
    points: [
      "Employee 360 profile",
      "Leave, attendance and approvals",
      "Payroll with effective-dated changes",
    ],
  },
  {
    key: "Grow",
    title: "Progress that's recorded",
    points: [
      "Goals and performance reviews",
      "Promotions and pay changes, dated",
      "Development history in one place",
    ],
  },
  {
    key: "Exit",
    title: "A clean, compliant exit",
    points: [
      "Offboarding steps and approvals",
      "Final pay calculated in payroll",
      "Records kept and searchable",
    ],
  },
];

function JourneyHero(props: ProductHeroProps) {
  const { config } = props;
  const motion = useHeroMotion(config);
  const depth = heroDepth(config);
  const { ref, on } = useOnScreen<HTMLDivElement>();
  const { index, choose, hold } = useStages(JOURNEY.length, 3.2 * heroPace(config), motion && on);
  const onKey = (event: React.KeyboardEvent, i: number) => {
    const next = event.key === "ArrowRight" ? i + 1 : event.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const target = (next + JOURNEY.length) % JOURNEY.length;
    choose(target);
    (event.currentTarget.parentElement?.children[target] as HTMLElement | undefined)?.focus();
  };
  return (
    <Shell
      slug={props.slug}
      config={config}
      label="journey"
      identity={<ProductIdentity slug={props.slug as ProductSlug} brand={props.brand} name={props.name} />}
      text={copy(config, {
        eyebrow: "The employee journey",
        headline: "Every stage of work,",
        accent: "connected.",
        lead: "From the first day to the last, one record follows each person through onboarding, payroll, leave, performance and exit.",
      })}
      actions={<Actions {...props} />}
      visual={
        <div ref={ref} onPointerEnter={() => hold(true)} onPointerLeave={() => hold(false)}>
          <div role="tablist" aria-label="Employee journey" className="flex flex-wrap gap-1.5">
            {JOURNEY.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={i === index}
                tabIndex={i === index ? 0 : -1}
                onClick={() => choose(i)}
                onKeyDown={(e) => onKey(e, i)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors",
                  i === index
                    ? "border-product/50 bg-product-soft text-text"
                    : "border-line text-muted hover:text-text",
                )}
              >
                <span className="font-mono text-[0.7rem] text-product-text">{`0${i + 1}`}</span>
                {s.key}
              </button>
            ))}
          </div>
          {/* Layered cards in perspective; the chosen stage comes forward. Flat on small screens. */}
          <div className="relative mt-6 h-[19rem] [perspective:1400px] sm:h-[20rem]">
            {JOURNEY.map((s, i) => {
              const offset = (i - index + JOURNEY.length) % JOURNEY.length;
              const front = offset === 0;
              return (
                <div
                  key={s.key}
                  role={front ? "tabpanel" : undefined}
                  aria-hidden={!front || undefined}
                  className={cn(card, "absolute inset-x-0 top-0 mx-auto w-full max-w-xl p-6 sm:p-7")}
                  style={{
                    transform: `translate3d(${offset * 22 * depth}px, ${offset * 14}px, ${offset * -70 * depth}px) rotateY(${offset * -4 * depth}deg)`,
                    opacity: offset > 3 ? 0 : 1 - offset * 0.22,
                    zIndex: 10 - offset,
                    transition: motion
                      ? "transform 700ms var(--motion-ease), opacity 500ms var(--motion-ease)"
                      : "none",
                  }}
                >
                  <p className="font-mono text-xs text-product-text">{`Stage 0${i + 1} · ${s.key}`}</p>
                  <p className="mt-2 font-display text-title font-semibold text-text">{s.title}</p>
                  <ul className="mt-4 space-y-2.5">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5 text-sm text-muted">
                        <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-product" />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 h-1 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full bg-product"
                      style={{ width: `${((i + 1) / JOURNEY.length) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------ 04 Chapters (UI-MO8) */

/** A sheet's frame: a small title row, then its body. Synthetic content only. */
function Sheet({ title, tag, children }: { title: string; tag: string; children: ReactNode }) {
  return (
    <div className="flex size-full flex-col p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <p className="font-display text-base font-semibold text-text sm:text-lg">{title}</p>
        <span className="rounded-full bg-product-soft px-2.5 py-1 text-[0.7rem] font-medium text-product-text">
          {tag}
        </span>
      </div>
      <div className="mt-4 flex-1 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4 py-1.5",
        strong && "border-t border-line pt-2.5 font-semibold",
      )}
    >
      <span className={strong ? "text-text" : "text-muted"}>{label}</span>
      <span className="text-text tabular-nums">{value}</span>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-muted">
        <span>{label}</span>
        <span className="text-text tabular-nums">{value}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full bg-product" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

const CHAPTERS: { key: string; title: string; meta: string; sheet: ReactNode }[] = [
  {
    key: "core",
    title: "Core HR",
    meta: "One record from offer to exit",
    sheet: (
      <Sheet title="Employee record" tag="Core HR">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-product text-sm font-semibold text-product-ink">
            AW
          </span>
          <div>
            <p className="font-medium text-text">Amani Wanjiru</p>
            <p className="text-muted">Operations · Nairobi branch</p>
          </div>
        </div>
        <div className="mt-4">
          <Row label="Contract" value="Permanent" />
          <Row label="Reports to" value="Brian Otieno" />
          <Row label="Documents" value="6 of 6 on file" />
        </div>
      </Sheet>
    ),
  },
  {
    key: "payroll",
    title: "Payroll",
    meta: "Statutory rules you can see",
    sheet: (
      <Sheet title="Payslip preview" tag="Payroll">
        <Row label="Gross pay" value="KES 150,000.00" />
        <Row label="NSSF" value="− 6,480.00" />
        <Row label="SHIF" value="− 4,125.00" />
        <Row label="Housing levy" value="− 2,250.00" />
        <Row label="PAYE" value="− 33,526.85" />
        <Row label="Net pay" value="KES 103,618.15" strong />
      </Sheet>
    ),
  },
  {
    key: "leave",
    title: "Leave",
    meta: "Requests that find their approvers",
    sheet: (
      <Sheet title="Leave request" tag="Leave">
        <Row label="Annual leave" value="5 days" />
        <Row label="Balance after" value="9 days" />
        <ol className="mt-3 space-y-2">
          {["Line manager · approved", "HR · approved", "Payroll · notified"].map((step) => (
            <li key={step} className="flex items-center gap-2 text-muted">
              <span aria-hidden className="size-2 rounded-full bg-product" />
              {step}
            </li>
          ))}
        </ol>
      </Sheet>
    ),
  },
  {
    key: "attendance",
    title: "Attendance",
    meta: "Shifts and time across branches",
    sheet: (
      <Sheet title="This week" tag="Attendance">
        <div className="grid grid-cols-5 gap-2 text-center">
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, i) => (
            <div key={day} className="rounded-xl border border-line py-2.5">
              <p className="text-[0.7rem] text-subtle">{day}</p>
              <p className={cn("mt-1 font-semibold", i === 3 ? "text-muted" : "text-text")}>
                {i === 3 ? "Leave" : "8h"}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Row label="Clock-ins on time" value="4 of 4" />
          <Row label="Overtime to approve" value="2.5h" />
        </div>
      </Sheet>
    ),
  },
  {
    key: "performance",
    title: "Performance",
    meta: "Goals and reviews in one place",
    sheet: (
      <Sheet title="Quarter goals" tag="Performance">
        <Meter label="Customer onboarding time" value={80} />
        <Meter label="Branch audit readiness" value={65} />
        <Meter label="Team training plan" value={90} />
      </Sheet>
    ),
  },
];

/**
 * Variant 04 · People, in Chapters (UI-MO8): the editorial hero. ZiraHR's
 * modules as a numbered index beside layered sheets of one synthetic
 * employee's records, each sheet coming forward with its chapter.
 */
function ChaptersHero({ slug, name, brand, config, demoHref, featuresHref }: ProductHeroProps) {
  const text = copy(config, {
    eyebrow: "HR Simplified. Business Amplified.",
    headline: "Your people, in chapters.",
    accent: "One story, one platform.",
    lead: "Records, payroll, leave, attendance and performance as one connected story, so every change reaches everything it touches.",
  });
  return (
    <EditorialHero
      id={`hero-${slug}-title`}
      design="chapters"
      product={slug}
      config={config}
      identity={
        <ProductIdentity
          slug={slug as ProductSlug}
          brand={brand}
          name={name}
          maxWidth={150}
          nameClassName="text-base font-semibold text-text"
        />
      }
      eyebrow={text.eyebrow}
      headline={text.headline}
      accent={text.accent}
      lead={text.lead}
      actions={<Actions config={config} demoHref={demoHref} featuresHref={featuresHref} />}
      chapters={CHAPTERS}
      indexLabel={`${name} modules`}
      note={SYNTHETIC}
    />
  );
}

export const PRODUCT_HERO_DESIGNS: Partial<Record<HeroDesign, (props: ProductHeroProps) => ReactNode>> = {
  workforce: WorkforceHero,
  payroll: PayrollHero,
  journey: JourneyHero,
  chapters: ChaptersHero,
};

/** A product website's hero for a published (or previewed) variant, or null when its design isn't a product design. */
export function ProductHero({ design, ...props }: ProductHeroProps & { design: HeroDesign }) {
  const Component = PRODUCT_HERO_DESIGNS[design];
  return Component ? <Component {...props} /> : null;
}
