"use client";

import {
  CYCLE_LABELS,
  type CalcInput,
  type CycleKey,
  METHOD_LABELS,
  type OneOffMode,
  type PriceBook,
  PricingSummary,
  formatMoney,
  useCalculation,
  usesHeadcount,
} from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import { FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";

import { ActionButton } from "../action-button";
import { GROUP_LABELS } from "./pricing-types";

type Selection = Record<string, { on: boolean; quantity: number | null; mode: OneOffMode }>;

const field =
  "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text disabled:opacity-60";

/**
 * The pricing calculator (Studio tab and full-screen workspace). Every total
 * comes from the API's engine; this component only collects the choices.
 */
export function PricingCalculator({
  slug,
  book,
  source,
  canQuote,
  initial,
}: {
  slug: string;
  book: PriceBook;
  /** Which version to price: the draft (trying changes) or the published one. */
  source: "draft" | "published";
  /** Quotations come from the published book only. */
  canQuote: boolean;
  initial?: CalcInput;
}) {
  const uid = useId();
  const router = useRouter();
  const cycles = book.cycles.filter((c) => c.enabled);
  const usable = book.items.filter((i) => i.active);
  const [employees, setEmployees] = useState(initial?.employees ?? 250);
  const [cycle, setCycle] = useState<CycleKey>(initial?.cycle ?? cycles[0]?.key ?? "monthly");
  const [currency, setCurrency] = useState(initial?.currency ?? book.currency);
  const [modelId, setModelId] = useState<string>(initial?.model_id ?? "");
  const [selection, setSelection] = useState<Selection>(() => {
    const s: Selection = {};
    for (const item of usable) {
      const line = initial?.lines.find((l) => l.item_id === item.id);
      s[item.id] = {
        on: Boolean(line),
        quantity: line?.quantity ?? null,
        mode: line?.mode ?? item.one_off_mode,
      };
    }
    return s;
  });
  // Items added to the book after this mounted start unselected.
  const pick = (id: string) =>
    selection[id] ?? {
      on: false,
      quantity: null,
      mode: usable.find((i) => i.id === id)?.one_off_mode ?? "charged",
    };
  const set = (id: string, patch: Partial<Selection[string]>) =>
    setSelection((s) => ({ ...s, [id]: { ...(s[id] ?? pick(id)), ...patch } }));

  const input: CalcInput = useMemo(
    () => ({
      employees: Number.isFinite(employees) ? Math.max(0, Math.floor(employees)) : 0,
      cycle,
      currency,
      model_id: modelId || null,
      lines: usable
        .filter((i) => selection[i.id]?.on)
        .map((i) => ({
          item_id: i.id,
          quantity: selection[i.id]!.quantity,
          mode: i.billing === "one_off" ? selection[i.id]!.mode : null,
        })),
    }),
    [employees, cycle, currency, modelId, selection, usable],
  );
  const { result, error, busy } = useCalculation(`/admin/api/sites/${slug}/pricing/calculate`, {
    input,
    source,
  });

  const applyModel = (id: string) => {
    setModelId(id);
    const model = book.models.find((m) => m.id === id);
    if (!model) return;
    setCycle(cycles.some((c) => c.key === model.default_cycle) ? model.default_cycle : cycle);
    setSelection((s) =>
      Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, on: model.item_ids.includes(k) }])),
    );
  };

  const [quoting, setQuoting] = useState(false);
  const [customer, setCustomer] = useState({ name: "", contact: "", notes: "" });
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function createQuote() {
    setSaving(true);
    setQuoteError(null);
    try {
      const { id } = await adminFetch<{ id: string }>(`sites/${slug}/pricing/quotes`, {
        customer_name: customer.name,
        customer_contact: customer.contact,
        internal_notes: customer.notes,
        input,
      });
      router.push(`/admin/pricing/quotes/${id}`);
    } catch (err) {
      setQuoteError(
        err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      );
      setSaving(false);
    }
  }

  const recurring = usable.filter((i) => i.billing !== "one_off");
  const oneOff = usable.filter((i) => i.billing === "one_off");
  const cycleDiscount = (key: CycleKey) => {
    const d = book.cycles.find((c) => c.key === key)?.discount;
    if (!d || d.kind === "none" || Number(d.value) === 0) return null;
    return d.kind === "percent" ? `−${Number(d.value)}%` : `−${formatMoney(d.value, book.currency)}`;
  };

  const row = (item: (typeof usable)[number]) => {
    const s = pick(item.id);
    const headcount = usesHeadcount(item.method);
    const planned = item.availability === "planned";
    return (
      <tr key={item.id} className={cn("border-b border-line align-top", !s.on && "text-muted")}>
        <td className="py-3 pe-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={s.on}
              disabled={planned}
              onChange={(e) => set(item.id, { on: e.target.checked })}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span className={cn("block font-medium", s.on ? "text-text" : "text-muted")}>{item.name}</span>
              <span className="block text-xs text-subtle">
                {METHOD_LABELS[item.method]}
                {item.billing === "annual" ? " · per year" : item.billing === "monthly" ? " · per month" : ""}
                {planned && " · planned, not yet available"}
              </span>
            </span>
          </label>
        </td>
        <td className="py-3 pe-3">
          {item.method !== "flat" && item.method !== "custom_quote" && (
            <>
              <label className="sr-only" htmlFor={`${uid}-q-${item.id}`}>
                {`${item.name}: quantity`}
              </label>
              <input
                id={`${uid}-q-${item.id}`}
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={headcount ? String(input.employees) : "1"}
                value={s.quantity ?? ""}
                disabled={!s.on}
                onChange={(e) =>
                  set(item.id, {
                    quantity: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                  })
                }
                className={cn(field, "min-h-10 w-24 text-end font-mono")}
              />
              <span className="mt-1 block text-xs text-subtle">
                {headcount && s.quantity === null ? "Uses the employee count" : item.unit_label}
              </span>
            </>
          )}
        </td>
        <td className="py-3 pe-3 text-end font-mono text-sm whitespace-nowrap tabular-nums">
          {item.method === "custom_quote" ? (
            "On scope"
          ) : item.tiers.length ? (
            "Tiered"
          ) : item.rate ? (
            formatMoney(item.rate, book.currency)
          ) : (
            <span className="text-amber-700 dark:text-amber-400">Not set</span>
          )}
        </td>
        {item.billing === "one_off" ? (
          <td className="py-3">
            <label className="sr-only" htmlFor={`${uid}-m-${item.id}`}>
              {`${item.name}: on the quotation`}
            </label>
            <select
              id={`${uid}-m-${item.id}`}
              value={s.mode}
              disabled={!s.on}
              onChange={(e) => set(item.id, { mode: e.target.value as OneOffMode })}
              className={cn(field, "min-h-10")}
            >
              <option value="charged">Charged</option>
              <option value="included">Included</option>
              <option value="scoped">On scope</option>
            </select>
          </td>
        ) : (
          <td className="py-3 text-end font-mono text-sm text-text tabular-nums">
            {result?.recurring.find((l) => l.item_id === item.id)
              ? formatMoney(result.recurring.find((l) => l.item_id === item.id)!.net, result.currency)
              : "—"}
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="min-w-0 space-y-6">
        <div className="grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
          <div>
            <label htmlFor={`${uid}-emp`} className="block text-xs font-medium text-muted">
              Employees / licences
            </label>
            <input
              id={`${uid}-emp`}
              type="number"
              min={0}
              inputMode="numeric"
              value={employees}
              onChange={(e) => setEmployees(Number(e.target.value))}
              className={cn(field, "mt-1 font-mono text-lg font-semibold")}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <p id={`${uid}-cycle`} className="text-xs font-medium text-muted">
              Billing cycle
            </p>
            <div
              role="radiogroup"
              aria-labelledby={`${uid}-cycle`}
              className="mt-1 grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2 p-1 sm:grid-cols-4"
            >
              {cycles.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={cycle === c.key}
                  onClick={() => setCycle(c.key)}
                  className={cn(
                    "min-h-10 rounded-lg px-2 text-sm transition-colors",
                    cycle === c.key
                      ? "bg-surface font-medium text-text shadow-sm"
                      : "text-muted hover:text-text",
                  )}
                >
                  {CYCLE_LABELS[c.key].label}
                  {cycleDiscount(c.key) && (
                    <span className="ms-1 text-xs text-accent-strong">{cycleDiscount(c.key)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-1 lg:grid-cols-1">
            {book.models.filter((m) => m.enabled).length > 0 && (
              <div>
                <label htmlFor={`${uid}-model`} className="block text-xs font-medium text-muted">
                  Commercial model
                </label>
                <select
                  id={`${uid}-model`}
                  value={modelId}
                  onChange={(e) => applyModel(e.target.value)}
                  className={cn(field, "mt-1")}
                >
                  <option value="">Custom selection</option>
                  {book.models
                    .filter((m) => m.enabled)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            {book.supported_currencies.length > 1 && (
              <div>
                <label htmlFor={`${uid}-cur`} className="block text-xs font-medium text-muted">
                  Currency
                </label>
                <select
                  id={`${uid}-cur`}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={cn(field, "mt-1")}
                >
                  {book.supported_currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <section aria-labelledby={`${uid}-rec`}>
          <h3 id={`${uid}-rec`} className="text-sm font-semibold text-text">
            Subscription modules
          </h3>
          <div className="mt-2 overflow-x-auto rounded-2xl border border-line bg-surface px-4">
            <table className="w-full min-w-[30rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-subtle">
                  <th scope="col" className="py-2.5 pe-3 text-start font-medium">
                    Module
                  </th>
                  <th scope="col" className="py-2.5 pe-3 text-start font-medium">
                    Quantity
                  </th>
                  <th scope="col" className="py-2.5 pe-3 text-end font-medium">
                    Rate
                  </th>
                  <th
                    scope="col"
                    className="py-2.5 text-end font-medium"
                  >{`Per ${CYCLE_LABELS[cycle].period}`}</th>
                </tr>
              </thead>
              <tbody>{recurring.map(row)}</tbody>
            </table>
          </div>
        </section>

        {oneOff.length > 0 && (
          <section aria-labelledby={`${uid}-one`}>
            <h3 id={`${uid}-one`} className="text-sm font-semibold text-text">
              Implementation & one-off charges
            </h3>
            <div className="mt-2 overflow-x-auto rounded-2xl border border-line bg-surface px-4">
              <table className="w-full min-w-[30rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-subtle">
                    <th scope="col" className="py-2.5 pe-3 text-start font-medium">
                      Item
                    </th>
                    <th scope="col" className="py-2.5 pe-3 text-start font-medium">
                      Quantity
                    </th>
                    <th scope="col" className="py-2.5 pe-3 text-end font-medium">
                      Rate
                    </th>
                    <th scope="col" className="py-2.5 text-start font-medium">
                      On the quotation
                    </th>
                  </tr>
                </thead>
                {Object.keys(GROUP_LABELS).map((g) => {
                  const items = oneOff.filter((i) => (i.group ?? "setup") === g);
                  if (!items.length) return null;
                  return (
                    <tbody key={g}>
                      <tr>
                        <th
                          scope="rowgroup"
                          colSpan={4}
                          className="pt-4 pb-1 text-start text-xs font-medium tracking-[0.12em] text-subtle uppercase"
                        >
                          {GROUP_LABELS[g]}
                        </th>
                      </tr>
                      {items.map(row)}
                    </tbody>
                  );
                })}
              </table>
            </div>
          </section>
        )}
      </div>

      <aside aria-label="Calculation summary" className="xl:sticky xl:top-6 xl:self-start">
        <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-elevated)]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-text">Summary</h3>
            <span className="inline-flex items-center gap-1.5 text-xs text-subtle" aria-live="polite">
              {busy && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
              {source === "draft" ? "Draft prices" : "Published prices"}
            </span>
          </div>
          <div className="mt-4">
            {error && (
              <p role="alert" className="mb-3 text-sm text-danger">
                {error}
              </p>
            )}
            {result ? (
              <PricingSummary calc={result} taxName={book.tax.name || "Tax"} />
            ) : (
              <p className="text-sm text-subtle">Choose modules to see the calculation.</p>
            )}
          </div>
          {canQuote && (
            <div className="mt-5 border-t border-line pt-5">
              {!quoting ? (
                <ActionButton
                  ready={input.lines.length > 0 && !error}
                  hint={input.lines.length ? undefined : "Choose at least one item."}
                  onClick={() => setQuoting(true)}
                  icon={<FileText aria-hidden className="size-4" />}
                  className="w-full"
                >
                  Create quotation
                </ActionButton>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (customer.name.trim()) void createQuote();
                  }}
                >
                  <div>
                    <label htmlFor={`${uid}-cust`} className="block text-xs font-medium text-muted">
                      Customer or organisation
                    </label>
                    <input
                      id={`${uid}-cust`}
                      required
                      maxLength={160}
                      value={customer.name}
                      onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                      className={cn(field, "mt-1")}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-contact`} className="block text-xs font-medium text-muted">
                      Contact (optional)
                    </label>
                    <input
                      id={`${uid}-contact`}
                      maxLength={200}
                      value={customer.contact}
                      onChange={(e) => setCustomer((c) => ({ ...c, contact: e.target.value }))}
                      className={cn(field, "mt-1")}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-notes`} className="block text-xs font-medium text-muted">
                      Internal notes (never shown to the customer)
                    </label>
                    <textarea
                      id={`${uid}-notes`}
                      rows={2}
                      maxLength={2000}
                      value={customer.notes}
                      onChange={(e) => setCustomer((c) => ({ ...c, notes: e.target.value }))}
                      className={cn(field, "mt-1 py-2")}
                    />
                  </div>
                  {quoteError && (
                    <p role="alert" className="text-sm text-danger">
                      {quoteError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <ActionButton type="submit" ready={Boolean(customer.name.trim())} busy={saving}>
                      Save draft quotation
                    </ActionButton>
                    <ActionButton variant="ghost" ready onClick={() => setQuoting(false)}>
                      Cancel
                    </ActionButton>
                  </div>
                </form>
              )}
            </div>
          )}
          {!canQuote && source === "draft" && (
            <p className="mt-5 border-t border-line pt-4 text-xs text-subtle">
              Quotations use the published prices. Publish this pricing to issue them.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
