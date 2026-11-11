"use client";

import { cn, fieldClasses } from "@figbud/ui";
import { ChevronUp } from "lucide-react";
import { useId, useState } from "react";

import {
  BILLING_LABELS,
  CYCLE_LABELS,
  type CycleKey,
  type PriceBook,
  type PricingItem,
  PricingSummary,
  formatMoney,
  useCalculation,
  usesHeadcount,
} from "./pricing";

/*
 * Public pricing on a product website, in three steps (owner's brief, 12 Nov
 * 2026): choose modules, configure the subscription, add optional services,
 * with a live quotation summary. Shown only when "Show pricing on the
 * website" is on; the book is the API's public view, and every amount comes
 * from the API's one pricing engine (this component never calculates).
 */

/** Modules: recurring core and add-on items. Everything else is an optional service. */
const isModule = (i: PricingItem) =>
  i.billing !== "one_off" && (i.category === "core" || i.category === "add_on");
/** Quoted for each customer: no public price. */
const isQuoted = (i: PricingItem) => i.method === "custom_quote" || (!i.rate && !i.tiers.length);
/** Methods with their own quantity (not the headcount, not flat). */
const ownQuantity = (i: PricingItem) => i.method !== "flat" && !usesHeadcount(i.method) && !isQuoted(i);

const unit = (i: PricingItem) => i.unit_label.replace(/s$/, "") || "unit";

function priceLabel(i: PricingItem, currency: string) {
  if (isQuoted(i)) return { amount: "Request a quote", per: "Quoted for your organisation" };
  const amount = i.tiers.length
    ? `From ${formatMoney(i.tiers.at(-1)!.rate, currency)}`
    : formatMoney(i.rate, currency);
  const per =
    i.method === "flat"
      ? BILLING_LABELS[i.billing].per
      : `per ${unit(i)} ${BILLING_LABELS[i.billing].per}`.replace(" once", ", once");
  return { amount, per: i.tiers.length ? `${per} · volume pricing` : per };
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "focus-visible:outline-focus relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-[var(--motion-base)] focus-visible:outline-2 focus-visible:outline-offset-2",
        on ? "border-transparent bg-product" : "border-line-strong bg-surface-2",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute size-5 rounded-full shadow-sm transition-[inset-inline-start,background-color] duration-[var(--motion-base)] ease-out-expo motion-reduce:transition-none",
          on ? "start-6 bg-product-ink" : "start-1 bg-subtle",
        )}
      />
    </button>
  );
}

function Step({
  n,
  title,
  lead,
  children,
}: {
  n: number;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-7"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-product font-semibold text-product-ink"
        >
          {n}
        </span>
        <div>
          <h2 id={id} className="font-display text-xl font-semibold text-text">
            <span className="sr-only">{`Step ${n}: `}</span>
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted">{lead}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function PublicPricing({
  book,
  endpoint,
  quoteHref,
  demoHref,
}: {
  book: PriceBook;
  /** This website's proxy to the public calculation endpoint. */
  endpoint: string;
  /** The pre-filled enquiry form. */
  quoteHref: string;
  /** The enquiry form for a demo. */
  demoHref?: string;
}) {
  const cycles = book.cycles.filter((c) => c.enabled);
  const modules = book.items.filter(isModule);
  const services = book.items.filter((i) => !isModule(i));
  const [cycle, setCycle] = useState<CycleKey>(cycles[0]?.key ?? "monthly");
  const [employees, setEmployees] = useState(50);
  const [picked, setPicked] = useState<string[]>(() =>
    modules
      .filter((i) => i.category === "core")
      .slice(0, 2)
      .map((i) => i.id),
  );
  /** Quantities set per item; headcount items without one follow the company headcount. */
  const [qty, setQty] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  const chosen = book.items.filter((i) => picked.includes(i.id));
  const quantityOf = (i: PricingItem) =>
    qty[i.id] ?? (usesHeadcount(i.method) ? Math.max(0, Math.floor(employees || 0)) : 1);
  const { result, error, busy } = useCalculation(
    endpoint,
    {
      employees: Math.max(0, Math.floor(employees || 0)),
      cycle,
      lines: chosen.map((i) => ({
        item_id: i.id,
        ...(qty[i.id] !== undefined && i.method !== "flat" ? { quantity: qty[i.id] } : {}),
      })),
    },
    chosen.length > 0,
  );
  const setQuantity = (id: string, value: string) =>
    setQty((q) => {
      const next = { ...q };
      if (value === "") delete next[id];
      else next[id] = Math.max(0, Math.floor(Number(value) || 0));
      return next;
    });
  const quantityInput = (i: PricingItem, label: string, placeholder?: number) => (
    <label className="grid gap-1 text-sm text-muted">
      {label}
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={qty[i.id] ?? ""}
        placeholder={placeholder !== undefined ? String(placeholder) : "1"}
        onChange={(e) => setQuantity(i.id, e.target.value)}
        className={fieldClasses("min-h-11 w-32 px-3 font-mono")}
      />
    </label>
  );
  const summary = (
    <div className="space-y-5">
      {chosen.length === 0 ? (
        <p className="text-sm text-muted">Choose modules to see your estimate.</p>
      ) : (
        <>
          <ul aria-label="Your selection" className="space-y-1.5 text-sm">
            {chosen.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span className="text-text">{i.name}</span>
                <span className="shrink-0 text-muted tabular-nums">
                  {isQuoted(i)
                    ? "Quoted"
                    : i.method === "flat"
                      ? i.billing === "one_off"
                        ? "Once"
                        : "Included"
                      : `${quantityOf(i).toLocaleString("en-KE")} ${quantityOf(i) === 1 ? unit(i) : i.unit_label}`}
                </span>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {result && <PricingSummary calc={result} taxName={book.tax.name || "Tax"} />}
        </>
      )}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <a
          href={quoteHref}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-product px-5 font-medium text-product-ink"
        >
          Request a quote
        </a>
        {demoHref && (
          <a
            href={demoHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong px-5 font-medium text-text hover:bg-surface-2"
          >
            Book a demo
          </a>
        )}
      </div>
      <p className="text-xs text-subtle">
        An estimate from published prices. Your quotation confirms the final figures for your organisation.
      </p>
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="grid gap-6">
        <Step n={1} title="Choose your modules" lead="Pick your modules. We'll do the math.">
          <ul className="divide-y divide-line">
            {modules.map((i) => {
              const on = picked.includes(i.id);
              const price = priceLabel(i, book.currency);
              return (
                <li key={i.id} data-module={i.id} className="flex items-center gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", on ? "text-text" : "text-muted")}>{i.name}</p>
                    {i.description && <p className="mt-0.5 text-sm text-subtle">{i.description}</p>}
                  </div>
                  <div className="hidden text-end sm:block">
                    <p className="font-mono text-sm text-text tabular-nums">{price.amount}</p>
                    <p className="text-xs text-subtle">{price.per}</p>
                  </div>
                  <Switch on={on} label={i.name} onChange={(v) => toggle(i.id, v)} />
                </li>
              );
            })}
          </ul>
        </Step>

        <Step
          n={2}
          title="Configure your subscription"
          lead="Your headcount and billing. A module can count its own employees, users or other units."
        >
          <div className="flex flex-wrap items-end gap-6">
            <label className="grid gap-1 text-sm font-medium text-text">
              Employees
              <input
                id="pricing-employees"
                type="number"
                min={1}
                inputMode="numeric"
                value={employees}
                onChange={(e) => setEmployees(Number(e.target.value))}
                className={fieldClasses("min-h-11 w-36 px-3 font-mono")}
              />
            </label>
            <div>
              <p aria-hidden className="text-sm font-medium text-text">
                Billing cycle
              </p>
              <div
                role="radiogroup"
                aria-label="Billing cycle"
                className="mt-1 flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1"
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
                      cycle === c.key
                        ? "bg-surface font-medium text-text shadow-sm"
                        : "text-muted hover:text-text",
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
          </div>
          {chosen.some((i) => isModule(i) && i.method !== "flat") && (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {chosen
                .filter((i) => isModule(i) && i.method !== "flat")
                .map((i) => (
                  <li key={i.id}>
                    {quantityInput(
                      i,
                      usesHeadcount(i.method)
                        ? `${i.name}: ${i.unit_label}`
                        : `${i.name}: number of ${i.unit_label}`,
                      usesHeadcount(i.method) ? Math.max(0, Math.floor(employees || 0)) : 1,
                    )}
                  </li>
                ))}
            </ul>
          )}
        </Step>

        {services.length > 0 && (
          <Step
            n={3}
            title="Add optional services"
            lead="Set-up, training, integrations, migration and more. One-off charges are shown apart from the subscription."
          >
            <ul className="divide-y divide-line">
              {services.map((i) => {
                const on = picked.includes(i.id);
                const price = priceLabel(i, book.currency);
                return (
                  <li key={i.id} data-service={i.id} className="flex flex-wrap items-center gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className={cn("font-medium", on ? "text-text" : "text-muted")}>
                        {i.name}
                        <span className="ms-2 rounded-full border border-line px-2 py-0.5 text-xs font-normal text-subtle">
                          {i.billing === "one_off" ? "One-off" : "Recurring"}
                        </span>
                      </p>
                      {i.description && <p className="mt-0.5 text-sm text-subtle">{i.description}</p>}
                      <p className="mt-1 text-xs text-muted">
                        <span className="font-mono text-text">{price.amount}</span> · {price.per}
                      </p>
                    </div>
                    {on && ownQuantity(i) && quantityInput(i, `Number of ${i.unit_label}`)}
                    <Switch on={on} label={i.name} onChange={(v) => toggle(i.id, v)} />
                  </li>
                );
              })}
            </ul>
          </Step>
        )}
      </div>

      {/* Desktop: a sticky quotation summary. */}
      <aside aria-label="Your quotation" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
        <div
          className="rounded-[var(--radius-panel)] border border-line bg-surface p-5"
          aria-busy={busy || undefined}
        >
          <h2 className="font-semibold text-text">Your estimate</h2>
          <div className="mt-4">{summary}</div>
        </div>
      </aside>

      {/* Phones and tablets: a compact bar that expands into the summary. */}
      <div className="sticky bottom-3 z-20 lg:hidden">
        <div className="rounded-2xl border border-line bg-surface/95 shadow-[var(--shadow-elevated)] backdrop-blur">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="pricing-summary-compact"
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-start"
          >
            <span>
              <span className="block text-xs text-subtle">Due for the first period</span>
              <span className="font-mono font-semibold text-text tabular-nums">
                {result && chosen.length ? formatMoney(result.due_first_period, result.currency) : "—"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-text">
              {open ? "Hide summary" : "View summary"}
              <ChevronUp aria-hidden className={cn("size-4 transition-transform", !open && "rotate-180")} />
            </span>
          </button>
          <div
            id="pricing-summary-compact"
            hidden={!open}
            className="max-h-[50dvh] overflow-y-auto border-t border-line p-4"
          >
            {summary}
          </div>
        </div>
      </div>
    </div>
  );
}
