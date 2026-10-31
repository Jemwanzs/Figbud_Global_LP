"use client";

import { cn } from "@figbud/ui";
import { useEffect, useRef, useState } from "react";

/*
 * Pricing (P11): types mirroring services/api/src/pricing/engine.rs, and the
 * shared pieces every product's calculator and quotation use. Amounts are
 * decimal strings from the API; the API is the only place prices are
 * calculated (docs/PRICING.md), so these components only format and lay out.
 */

export type Category = "core" | "add_on" | "implementation" | "support" | "integration" | "custom";
export type Method =
  | "flat"
  | "per_employee"
  | "per_user"
  | "per_payroll_employee"
  | "per_entity"
  | "per_country"
  | "per_usage_unit"
  | "per_participant"
  | "per_session"
  | "per_day"
  | "custom_quote";
export type Billing = "one_off" | "monthly" | "annual";
export type CycleKey = "monthly" | "quarterly" | "semi_annual" | "annual";
export type OneOffMode = "charged" | "included" | "optional" | "scoped";
export type DiscountKind = "none" | "percent" | "fixed";

export interface Discount {
  kind: DiscountKind;
  value: string;
}

export interface PricingItem {
  id: string;
  name: string;
  description: string;
  category: Category;
  group?: string | null;
  method: Method;
  unit_label: string;
  billing: Billing;
  rate: string | null;
  minimum_charge?: string | null;
  tiers: { up_to: number | null; rate: string }[];
  tier_mode: "volume" | "graduated";
  cycle_terms: { cycle: CycleKey; rate?: string | null; discount?: Discount | null }[];
  min_qty?: number | null;
  max_qty?: number | null;
  taxable: boolean;
  discountable: boolean;
  one_off_mode: OneOffMode;
  effective_from?: string | null;
  availability: "available" | "planned";
  active: boolean;
  public: boolean;
}

export interface PriceBook {
  currency: string;
  supported_currencies: string[];
  fx_source: string;
  fx_rates: { currency: string; rate: string; as_of?: string | null }[];
  tax: { name: string; rate: string | null; presentation: "exclusive" | "inclusive" };
  decimals: number;
  cycles: { key: CycleKey; enabled: boolean; discount: Discount }[];
  items: PricingItem[];
  plans: {
    id: string;
    name: string;
    description: string;
    item_ids: string[];
    public: boolean;
    active: boolean;
  }[];
  models: {
    id: string;
    kind: "implementation_support" | "subscription" | "enterprise";
    name: string;
    description: string;
    item_ids: string[];
    default_cycle: CycleKey;
    enabled: boolean;
  }[];
  minimum_monthly_subscription: string | null;
  quote_validity_days: number;
  terms: string;
}

export interface CalcLineInput {
  item_id: string;
  quantity?: number | null;
  mode?: OneOffMode | null;
}

export interface CalcInput {
  employees: number;
  cycle: CycleKey;
  currency?: string | null;
  lines: CalcLineInput[];
  proration?: { days_remaining: number; days_in_period: number } | null;
  model_id?: string | null;
}

export interface CalcLine {
  item_id: string;
  name: string;
  category: Category;
  method: Method;
  billing: Billing;
  quantity: number;
  unit_label: string;
  unit_rate: string;
  gross: string;
  discount: string;
  net: string;
  tax: string;
  notes: string[];
}

export interface Calculation {
  currency: string;
  fx_rate: string;
  cycle: CycleKey;
  months: number;
  employees: number;
  recurring: CalcLine[];
  one_off: CalcLine[];
  unpriced: {
    item_id: string;
    name: string;
    reason: "rate_not_set" | "custom_quote" | "scoped" | "planned";
  }[];
  subscription_subtotal: string;
  discount_total: string;
  minimum_adjustment: string;
  subscription_net: string;
  subscription_tax: string;
  one_off_total: string;
  one_off_tax: string;
  tax_total: string;
  tax_rate: string | null;
  tax_presentation: "exclusive" | "inclusive";
  due_first_period: string;
  renewal_amount: string;
  annualized_subscription: string;
  proration_factor: string | null;
  warnings: string[];
}

export const CYCLE_LABELS: Record<CycleKey, { label: string; period: string; months: number }> = {
  monthly: { label: "Monthly", period: "month", months: 1 },
  quarterly: { label: "Quarterly", period: "quarter", months: 3 },
  semi_annual: { label: "Semi-annual", period: "6 months", months: 6 },
  annual: { label: "Annual", period: "year", months: 12 },
};

export const METHOD_LABELS: Record<Method, string> = {
  flat: "Flat rate",
  per_employee: "Per employee",
  per_user: "Per user licence",
  per_payroll_employee: "Per payroll employee",
  per_entity: "Per entity",
  per_country: "Per country",
  per_usage_unit: "Per usage unit",
  per_participant: "Per participant",
  per_session: "Per session",
  per_day: "Per day",
  custom_quote: "Custom quote",
};

export const UNPRICED_LABELS: Record<Calculation["unpriced"][number]["reason"], string> = {
  rate_not_set: "Rate not set",
  custom_quote: "Quoted separately",
  scoped: "Quoted on scope",
  planned: "Planned, not yet available",
};

export const usesHeadcount = (method: Method) =>
  method === "per_employee" || method === "per_user" || method === "per_payroll_employee";

/** Formats an API amount (a decimal string) in its currency; never does arithmetic. */
export function formatMoney(amount: string | null | undefined, currency: string, locale = "en-KE") {
  if (amount === null || amount === undefined || amount === "") return "—";
  const [whole = "0", fraction = ""] = amount.replace(/^-/, "").split(".");
  const grouped = Number(whole).toLocaleString(locale);
  const sign = amount.startsWith("-") ? "−" : "";
  return `${sign}${currency} ${grouped}${fraction ? `.${fraction}` : ""}`;
}

/**
 * Live calculation: posts the input to `endpoint` (debounced) and returns
 * the API's result. Stale responses are ignored.
 */
export function useCalculation(endpoint: string, body: unknown, enabled = true) {
  const [result, setResult] = useState<Calculation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const serial = useRef(0);
  const payload = JSON.stringify(body);
  useEffect(() => {
    if (!enabled) return;
    const id = ++serial.current;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          credentials: "same-origin",
        });
        const data = await response.json().catch(() => null);
        if (id !== serial.current) return;
        if (!response.ok) {
          setError(data?.error?.fields?.[0]?.message ?? data?.error?.message ?? "The calculation failed.");
        } else {
          setError(null);
          setResult(data as Calculation);
        }
      } catch {
        if (id === serial.current) setError("The pricing service can't be reached.");
      } finally {
        if (id === serial.current) setBusy(false);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [endpoint, payload, enabled]);
  return { result, error, busy };
}

function Row({
  label,
  value,
  hint,
  strong,
  negative,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className={cn("text-sm", strong ? "font-medium text-text" : "text-muted")}>
        {label}
        {hint && <span className="block text-xs text-subtle">{hint}</span>}
      </dt>
      <dd
        className={cn(
          "shrink-0 text-end font-mono tabular-nums",
          strong ? "text-base font-semibold text-text" : "text-sm text-text",
          negative && "text-accent-strong",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The totals, each labelled with its period, so monthly, per-period, yearly
 * and one-off amounts are never added together without saying so.
 */
export function PricingSummary({ calc, taxName = "Tax" }: { calc: Calculation; taxName?: string }) {
  const c = calc.currency;
  const cycle = CYCLE_LABELS[calc.cycle];
  const inclusive = calc.tax_presentation === "inclusive";
  const taxLabel = calc.tax_rate
    ? `${taxName} ${Number(calc.tax_rate)}%${inclusive ? " (included)" : ""}`
    : null;
  return (
    <div className="space-y-5">
      <section aria-label="Subscription">
        <h3 className="text-xs font-medium tracking-[0.14em] text-subtle uppercase">
          Subscription · per {cycle.period}
        </h3>
        <dl className="mt-2 divide-y divide-line">
          <Row label="Subtotal" value={formatMoney(calc.subscription_subtotal, c)} />
          {calc.discount_total !== "0.00" && Number(calc.discount_total) !== 0 && (
            <Row label="Discount" value={`− ${formatMoney(calc.discount_total, c)}`} negative />
          )}
          {Number(calc.minimum_adjustment) > 0 && (
            <Row label="Minimum subscription top-up" value={formatMoney(calc.minimum_adjustment, c)} />
          )}
          <Row label="After discount" value={formatMoney(calc.subscription_net, c)} strong />
          {taxLabel && <Row label={taxLabel} value={formatMoney(calc.subscription_tax, c)} />}
        </dl>
      </section>
      {(calc.one_off.length > 0 || Number(calc.one_off_total) > 0) && (
        <section aria-label="One-off charges">
          <h3 className="text-xs font-medium tracking-[0.14em] text-subtle uppercase">
            One-off · charged once
          </h3>
          <dl className="mt-2 divide-y divide-line">
            <Row label="Implementation and services" value={formatMoney(calc.one_off_total, c)} />
            {taxLabel && <Row label={taxLabel} value={formatMoney(calc.one_off_tax, c)} />}
          </dl>
        </section>
      )}
      <section aria-label="Totals" className="rounded-2xl border border-line bg-surface-2/60 p-4">
        <dl>
          <Row
            label="Due for the first period"
            hint={`First ${cycle.period}${calc.proration_factor ? " (prorated)" : ""}, plus one-off charges${inclusive ? "" : ", with tax"}`}
            value={formatMoney(calc.due_first_period, c)}
            strong
          />
          <Row
            label={`Renewal per ${cycle.period}`}
            hint="Each following period, without one-off charges"
            value={formatMoney(calc.renewal_amount, c)}
          />
          <Row
            label="Annual subscription equivalent"
            hint="After discount, before tax, over 12 months"
            value={formatMoney(calc.annualized_subscription, c)}
          />
        </dl>
      </section>
      {calc.unpriced.length > 0 && (
        <div role="note" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-text">Not included in the totals</p>
          <ul className="mt-1.5 space-y-1 text-muted">
            {calc.unpriced.map((u) => (
              <li key={u.item_id}>
                {u.name} · {UNPRICED_LABELS[u.reason]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {calc.warnings.filter((w) => !w.startsWith("Some items have no price")).length > 0 && (
        <ul className="space-y-1 text-xs text-subtle">
          {calc.warnings
            .filter((w) => !w.startsWith("Some items have no price"))
            .map((w) => (
              <li key={w}>{w}</li>
            ))}
        </ul>
      )}
    </div>
  );
}

function LinesTable({
  title,
  lines,
  currency,
  period,
}: {
  title: string;
  lines: CalcLine[];
  currency: string;
  period: string;
}) {
  if (!lines.length) return null;
  return (
    <section className="break-inside-avoid">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm print:min-w-0">
          <thead>
            <tr className="border-b border-line text-start text-xs text-subtle">
              <th scope="col" className="py-2 pe-3 text-start font-medium">
                Item
              </th>
              <th scope="col" className="py-2 pe-3 text-end font-medium">
                Quantity
              </th>
              <th scope="col" className="py-2 pe-3 text-end font-medium">
                Rate
              </th>
              <th scope="col" className="py-2 pe-3 text-end font-medium">
                Discount
              </th>
              <th scope="col" className="py-2 text-end font-medium">
                {period}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.item_id} className="border-b border-line">
                <td className="py-2 pe-3 text-text">
                  {l.name}
                  {l.notes.includes("included") && (
                    <span className="ms-2 text-xs text-accent-strong">Included</span>
                  )}
                  {l.notes.includes("minimum") && (
                    <span className="ms-2 text-xs text-subtle">Minimum charge</span>
                  )}
                </td>
                <td className="py-2 pe-3 text-end font-mono text-muted tabular-nums">
                  {l.method === "flat" ? "—" : `${l.quantity.toLocaleString("en-KE")} ${l.unit_label}`}
                </td>
                <td className="py-2 pe-3 text-end font-mono text-muted tabular-nums">
                  {formatMoney(l.unit_rate, currency)}
                </td>
                <td className="py-2 pe-3 text-end font-mono text-muted tabular-nums">
                  {Number(l.discount) ? `− ${formatMoney(l.discount, currency)}` : "—"}
                </td>
                <td className="py-2 text-end font-mono text-text tabular-nums">
                  {formatMoney(l.net, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export interface QuoteView {
  reference: string;
  product: string;
  customer_name: string;
  status: string;
  issue_date: string;
  expiry_date: string;
  calculation: Calculation;
  model?: string | null;
  /** The tax's name on this quotation (e.g. VAT). */
  tax_name?: string | null;
  terms: string;
}

/**
 * A quotation as the customer sees it (shared link, print and PDF): the
 * frozen figures, never internal notes or the price book.
 */
export function QuoteDocument({ quote, brand }: { quote: QuoteView; brand?: React.ReactNode }) {
  const calc = quote.calculation;
  const cycle = CYCLE_LABELS[calc.cycle];
  const date = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <article className="fb-quote space-y-8 text-text">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
        <div>
          {brand}
          <p className="mt-4 text-xs font-medium tracking-[0.14em] text-subtle uppercase">Quotation</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{quote.reference}</h1>
          <p className="mt-1 text-muted">
            {quote.product}
            {quote.model ? ` · ${quote.model}` : ""}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-subtle">Prepared for</dt>
          <dd className="font-medium">{quote.customer_name}</dd>
          <dt className="text-subtle">Issued</dt>
          <dd>{date(quote.issue_date)}</dd>
          <dt className="text-subtle">Valid until</dt>
          <dd>{date(quote.expiry_date)}</dd>
          <dt className="text-subtle">Billing</dt>
          <dd>
            {cycle.label}
            {calc.employees ? ` · ${calc.employees.toLocaleString("en-KE")} employees` : ""}
          </dd>
        </dl>
      </header>
      {/* Lines full width, totals beneath: reads the same on screen, in print and as PDF. */}
      <div className="space-y-8">
        <div className="space-y-8">
          <LinesTable
            title={`Subscription (billed ${cycle.label.toLowerCase()})`}
            lines={calc.recurring}
            currency={calc.currency}
            period={`Per ${cycle.period}`}
          />
          <LinesTable
            title="Implementation and one-off services"
            lines={calc.one_off}
            currency={calc.currency}
            period="Once"
          />
        </div>
        <aside className="break-inside-avoid sm:ms-auto sm:max-w-md">
          <PricingSummary calc={calc} taxName={quote.tax_name || "Tax"} />
        </aside>
      </div>
      {quote.terms && (
        <section className="break-inside-avoid border-t border-line pt-6">
          <h2 className="text-sm font-semibold">Commercial terms</h2>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-muted">{quote.terms}</p>
        </section>
      )}
      <p className="text-xs text-subtle">
        Amounts in {calc.currency}. This quotation is valid until {date(quote.expiry_date)}.
      </p>
    </article>
  );
}

/**
 * Public pricing on a product website (only when "Show pricing on the
 * website" is on): cards for the public modules and a calculator. The book is
 * the API's public view, so nothing internal can appear here.
 */
export function PublicPricing({
  book,
  endpoint,
  quoteHref,
}: {
  book: PriceBook;
  /** This website's proxy to the public calculation endpoint. */
  endpoint: string;
  /** The pre-filled enquiry form. */
  quoteHref: string;
}) {
  const cycles = book.cycles.filter((c) => c.enabled);
  const [cycle, setCycle] = useState<CycleKey>(cycles[0]?.key ?? "monthly");
  const [employees, setEmployees] = useState(50);
  const [picked, setPicked] = useState<string[]>(() =>
    book.items.filter((i) => i.billing !== "one_off" && i.category === "core").map((i) => i.id),
  );
  const recurring = book.items.filter((i) => i.billing !== "one_off");
  const { result, error } = useCalculation(
    endpoint,
    {
      employees: Math.max(0, Math.floor(employees || 0)),
      cycle,
      lines: picked.map((item_id) => ({ item_id })),
    },
    picked.length > 0,
  );
  const per = (i: PricingItem) =>
    `${i.billing === "annual" ? "per year" : "per month"}${usesHeadcount(i.method) ? ` per ${i.unit_label.replace(/s$/, "") || "employee"}` : ""}`;
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="pricing-employees" className="block text-sm font-medium text-text">
            Employees
          </label>
          <input
            id="pricing-employees"
            type="number"
            min={1}
            inputMode="numeric"
            value={employees}
            onChange={(e) => setEmployees(Number(e.target.value))}
            className="mt-1 min-h-11 w-36 rounded-xl border border-line-strong bg-surface px-3 font-mono text-text"
          />
        </div>
        <div
          role="radiogroup"
          aria-label="Billing cycle"
          className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1"
        >
          {cycles.map((c) => (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={cycle === c.key}
              onClick={() => setCycle(c.key)}
              className={cn(
                "min-h-10 rounded-lg px-3 text-sm transition-colors",
                cycle === c.key ? "bg-surface font-medium text-text shadow-sm" : "text-muted hover:text-text",
              )}
            >
              {CYCLE_LABELS[c.key].label}
              {c.discount.kind === "percent" && Number(c.discount.value) > 0 && (
                <span className="ms-1 text-xs text-accent-strong">{`−${Number(c.discount.value)}%`}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ul className="grid gap-4 sm:grid-cols-2">
          {recurring.map((item) => {
            const on = picked.includes(item.id);
            return (
              <li key={item.id}>
                <label
                  className={cn(
                    "flex h-full cursor-pointer flex-col rounded-[var(--radius-card)] border bg-surface p-5 transition-[border-color,box-shadow] duration-[var(--motion-base)]",
                    on
                      ? "border-product/60 shadow-[0_16px_40px_-28px_var(--product)]"
                      : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-text">{item.name}</span>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setPicked((p) =>
                          e.target.checked ? [...p, item.id] : p.filter((x) => x !== item.id),
                        )
                      }
                      className="mt-1 size-4 accent-[var(--product)]"
                    />
                  </span>
                  {item.description && <span className="mt-1 text-sm text-muted">{item.description}</span>}
                  <span className="mt-4 font-mono text-lg text-text">
                    {item.tiers.length ? "Volume pricing" : formatMoney(item.rate, book.currency)}
                  </span>
                  <span className="text-xs text-subtle">{per(item)}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
            <h2 className="font-semibold text-text">Your estimate</h2>
            <div className="mt-4">
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              {picked.length === 0 ? (
                <p className="text-sm text-muted">Choose modules to see an estimate.</p>
              ) : result ? (
                <PricingSummary calc={result} taxName={book.tax.name || "Tax"} />
              ) : null}
            </div>
            <a
              href={quoteHref}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-product px-5 font-medium text-product-ink"
            >
              Request a quote
            </a>
            <p className="mt-3 text-xs text-subtle">
              An estimate from published prices. Implementation, integrations and support are quoted for your
              organisation.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
