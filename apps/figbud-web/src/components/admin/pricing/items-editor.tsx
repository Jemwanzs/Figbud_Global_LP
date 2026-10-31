"use client";

import { CYCLE_LABELS, type CycleKey, METHOD_LABELS, type Method, type PricingItem } from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { CATEGORY_LABELS, GROUP_LABELS, newItem } from "./pricing-types";

const DECIMAL = /^\d{1,13}(\.\d{1,4})?$/;
/** "" means not set; anything else must be a plain decimal. */
export const validAmount = (v: string | null | undefined) => !v || DECIMAL.test(v);

const input =
  "min-h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-text disabled:opacity-60 aria-[invalid=true]:border-danger";

function Money({
  label,
  value,
  onChange,
  disabled,
  currency,
  placeholder = "Not set",
  className,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  disabled: boolean;
  currency: string;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const bad = !validAmount(value);
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-muted">
        {label}
      </label>
      <div className="relative mt-1">
        <span
          aria-hidden
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-xs text-subtle"
        >
          {currency}
        </span>
        <input
          id={id}
          inputMode="decimal"
          value={value ?? ""}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={bad}
          onChange={(e) => onChange(e.target.value.trim() === "" ? null : e.target.value.trim())}
          className={cn(input, "ps-12 text-end font-mono tabular-nums")}
        />
      </div>
      {bad && <p className="mt-1 text-xs text-danger">Use a number such as 1250 or 99.50.</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="inline-flex min-h-10 items-center gap-2 text-sm text-text">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}

const RECURRING_METHODS: Method[] = [
  "per_employee",
  "per_user",
  "per_payroll_employee",
  "flat",
  "per_entity",
  "per_country",
  "per_usage_unit",
  "custom_quote",
];
const ONE_OFF_METHODS: Method[] = [
  "flat",
  "per_employee",
  "per_participant",
  "per_session",
  "per_day",
  "per_entity",
  "per_country",
  "per_usage_unit",
  "custom_quote",
];

function ItemDetails({
  item,
  update,
  disabled,
  currency,
}: {
  item: PricingItem;
  update: (patch: Partial<PricingItem>) => void;
  disabled: boolean;
  currency: string;
}) {
  const uid = useId();
  const oneOff = item.billing === "one_off";
  const setTier = (i: number, patch: Partial<PricingItem["tiers"][number]>) =>
    update({ tiers: item.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const term = (cycle: CycleKey) => item.cycle_terms.find((t) => t.cycle === cycle);
  const setTerm = (cycle: CycleKey, patch: { rate?: string | null; discountPercent?: string | null }) => {
    const current = term(cycle) ?? { cycle, rate: null, discount: null };
    const next = {
      cycle,
      rate: "rate" in patch ? patch.rate : current.rate,
      discount:
        "discountPercent" in patch
          ? patch.discountPercent
            ? { kind: "percent" as const, value: patch.discountPercent }
            : null
          : current.discount,
    };
    const others = item.cycle_terms.filter((t) => t.cycle !== cycle);
    update({ cycle_terms: next.rate || next.discount ? [...others, next] : others });
  };
  return (
    <div className="grid gap-5 border-t border-line bg-surface-2/40 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor={`${uid}-name`} className="block text-xs font-medium text-muted">
            Name
          </label>
          <input
            id={`${uid}-name`}
            value={item.name}
            maxLength={80}
            disabled={disabled}
            onChange={(e) => update({ name: e.target.value })}
            className={cn(input, "mt-1")}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-cat`} className="block text-xs font-medium text-muted">
            Category
          </label>
          <select
            id={`${uid}-cat`}
            value={item.category}
            disabled={disabled}
            onChange={(e) => update({ category: e.target.value as PricingItem["category"] })}
            className={cn(input, "mt-1")}
          >
            {(oneOff
              ? (["implementation", "support", "integration", "custom"] as const)
              : (["core", "add_on", "support", "custom"] as const)
            ).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        {oneOff ? (
          <div>
            <label htmlFor={`${uid}-group`} className="block text-xs font-medium text-muted">
              Group
            </label>
            <select
              id={`${uid}-group`}
              value={item.group ?? "setup"}
              disabled={disabled}
              onChange={(e) => update({ group: e.target.value })}
              className={cn(input, "mt-1")}
            >
              {Object.entries(GROUP_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor={`${uid}-billing`} className="block text-xs font-medium text-muted">
              Rate is per
            </label>
            <select
              id={`${uid}-billing`}
              value={item.billing}
              disabled={disabled}
              onChange={(e) => update({ billing: e.target.value as PricingItem["billing"] })}
              className={cn(input, "mt-1")}
            >
              <option value="monthly">Month</option>
              <option value="annual">Year</option>
            </select>
          </div>
        )}
        <div className="sm:col-span-2 lg:col-span-4">
          <label htmlFor={`${uid}-desc`} className="block text-xs font-medium text-muted">
            Description
          </label>
          <input
            id={`${uid}-desc`}
            value={item.description}
            maxLength={400}
            disabled={disabled}
            onChange={(e) => update({ description: e.target.value })}
            className={cn(input, "mt-1")}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-unit`} className="block text-xs font-medium text-muted">
            Unit
          </label>
          <input
            id={`${uid}-unit`}
            value={item.unit_label}
            maxLength={40}
            disabled={disabled}
            onChange={(e) => update({ unit_label: e.target.value })}
            className={cn(input, "mt-1")}
          />
        </div>
        <Money
          label="Minimum charge"
          value={item.minimum_charge}
          onChange={(v) => update({ minimum_charge: v })}
          disabled={disabled}
          currency={currency}
          placeholder="None"
        />
        <div>
          <label htmlFor={`${uid}-min`} className="block text-xs font-medium text-muted">
            Minimum quantity
          </label>
          <input
            id={`${uid}-min`}
            type="number"
            min={0}
            value={item.min_qty ?? ""}
            disabled={disabled}
            onChange={(e) => update({ min_qty: e.target.value === "" ? null : Number(e.target.value) })}
            className={cn(input, "mt-1")}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-max`} className="block text-xs font-medium text-muted">
            Maximum quantity
          </label>
          <input
            id={`${uid}-max`}
            type="number"
            min={0}
            value={item.max_qty ?? ""}
            disabled={disabled}
            onChange={(e) => update({ max_qty: e.target.value === "" ? null : Number(e.target.value) })}
            className={cn(input, "mt-1")}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-eff`} className="block text-xs font-medium text-muted">
            Effective from
          </label>
          <input
            id={`${uid}-eff`}
            type="date"
            value={item.effective_from ?? ""}
            disabled={disabled}
            onChange={(e) => update({ effective_from: e.target.value || null })}
            className={cn(input, "mt-1")}
          />
        </div>
        {oneOff && (
          <div>
            <label htmlFor={`${uid}-mode`} className="block text-xs font-medium text-muted">
              On quotations
            </label>
            <select
              id={`${uid}-mode`}
              value={item.one_off_mode}
              disabled={disabled}
              onChange={(e) => update({ one_off_mode: e.target.value as PricingItem["one_off_mode"] })}
              className={cn(input, "mt-1")}
            >
              <option value="charged">Charged separately</option>
              <option value="included">Included</option>
              <option value="optional">Optional (off by default)</option>
              <option value="scoped">Quoted on scope</option>
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`${uid}-avail`} className="block text-xs font-medium text-muted">
            Availability
          </label>
          <select
            id={`${uid}-avail`}
            value={item.availability}
            disabled={disabled}
            onChange={(e) =>
              update({
                availability: e.target.value as PricingItem["availability"],
                ...(e.target.value === "planned" ? { public: false } : {}),
              })
            }
            className={cn(input, "mt-1")}
          >
            <option value="available">Available to quote</option>
            <option value="planned">Planned (not quotable or public)</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6">
        <Toggle
          label="Taxable"
          checked={item.taxable}
          onChange={(v) => update({ taxable: v })}
          disabled={disabled}
        />
        {!oneOff && (
          <Toggle
            label="Billing-cycle discounts apply"
            checked={item.discountable}
            onChange={(v) => update({ discountable: v })}
            disabled={disabled}
          />
        )}
      </div>

      {item.method !== "custom_quote" && item.method !== "flat" && (
        <fieldset>
          <legend className="text-sm font-medium text-text">Quantity tiers</legend>
          <p className="mt-0.5 text-xs text-subtle">
            Optional. Volume: the tier holding the quantity prices every unit. Graduated: each band at its own
            rate. Tiers replace the base rate.
          </p>
          {item.tiers.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="flex gap-4 text-sm">
                {(["volume", "graduated"] as const).map((mode) => (
                  <label key={mode} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name={`${uid}-tiermode`}
                      checked={item.tier_mode === mode}
                      disabled={disabled}
                      onChange={() => update({ tier_mode: mode })}
                    />
                    {mode === "volume" ? "Volume" : "Graduated"}
                  </label>
                ))}
              </div>
              {item.tiers.map((tier, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <div>
                    <label htmlFor={`${uid}-up-${i}`} className="block text-xs text-muted">
                      {`Tier ${i + 1}: up to (${item.unit_label || "units"})`}
                    </label>
                    <input
                      id={`${uid}-up-${i}`}
                      type="number"
                      min={1}
                      placeholder="And above"
                      value={tier.up_to ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        setTier(i, { up_to: e.target.value === "" ? null : Number(e.target.value) })
                      }
                      className={cn(input, "mt-1")}
                    />
                  </div>
                  <Money
                    label="Rate per unit"
                    value={tier.rate}
                    onChange={(v) => setTier(i, { rate: v ?? "" })}
                    disabled={disabled}
                    currency={currency}
                  />
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`Remove tier ${i + 1}`}
                    onClick={() => update({ tiers: item.tiers.filter((_, j) => j !== i) })}
                    className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={disabled || item.tiers.length >= 10}
            onClick={() => {
              const last = item.tiers.at(-1);
              const tiers = item.tiers.map((t, i) =>
                i === item.tiers.length - 1 && t.up_to === null ? { ...t, up_to: 100 * (i + 1) } : t,
              );
              update({ tiers: [...tiers, { up_to: null, rate: last?.rate ?? item.rate ?? "" }] });
            }}
            className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-accent hover:bg-accent-soft disabled:opacity-50"
          >
            <Plus aria-hidden className="size-4" />
            Add tier
          </button>
        </fieldset>
      )}

      {!oneOff && item.method !== "custom_quote" && (
        <fieldset>
          <legend className="text-sm font-medium text-text">Per billing cycle (optional)</legend>
          <p className="mt-0.5 text-xs text-subtle">
            A cycle rate replaces the base rate and any discount for that cycle, so nothing is discounted
            twice. An item discount replaces the cycle&apos;s discount for this item.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(CYCLE_LABELS) as CycleKey[]).map((cycle) => (
              <div key={cycle} className="rounded-xl border border-line p-3">
                <p className="text-sm font-medium text-text">{CYCLE_LABELS[cycle].label}</p>
                <Money
                  label={`Rate per ${item.billing === "annual" ? "year" : "month"}`}
                  value={term(cycle)?.rate}
                  onChange={(v) => setTerm(cycle, { rate: v })}
                  disabled={disabled}
                  currency={currency}
                  placeholder="Base rate"
                  className="mt-2"
                />
                <label className="mt-2 block text-xs font-medium text-muted" htmlFor={`${uid}-d-${cycle}`}>
                  Item discount %
                </label>
                <input
                  id={`${uid}-d-${cycle}`}
                  inputMode="decimal"
                  placeholder="Cycle's"
                  value={term(cycle)?.discount?.value ?? ""}
                  disabled={disabled}
                  onChange={(e) => setTerm(cycle, { discountPercent: e.target.value.trim() || null })}
                  className={cn(input, "mt-1 text-end font-mono")}
                />
              </div>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

/**
 * Chargeable items of one section: recurring modules and add-ons, or one-off
 * implementation and services (grouped A–E). Rates are typed inline; details
 * open below each row.
 */
export function ItemsEditor({
  items,
  section,
  onChange,
  disabled,
  currency,
}: {
  items: PricingItem[];
  section: "recurring" | "one_off";
  onChange: (items: PricingItem[]) => void;
  disabled: boolean;
  currency: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const inSection = (i: PricingItem) =>
    section === "one_off" ? i.billing === "one_off" : i.billing !== "one_off";
  const visible = items.filter(inSection);
  const update = (id: string, patch: Partial<PricingItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const move = (id: string, by: -1 | 1) => {
    const ids = visible.map((i) => i.id);
    const at = ids.indexOf(id);
    const to = at + by;
    if (to < 0 || to >= ids.length) return;
    const a = items.findIndex((i) => i.id === ids[at]);
    const b = items.findIndex((i) => i.id === ids[to]);
    const next = [...items];
    [next[a], next[b]] = [next[b]!, next[a]!];
    onChange(next);
  };
  const add = () => {
    let n = items.length + 1;
    while (items.some((i) => i.id === `item_${n}`)) n++;
    const item = {
      ...newItem(section, `item_${n}`),
      name: section === "recurring" ? "New module" : "New service",
    };
    onChange([...items, item]);
    setOpen(item.id);
  };
  const groups =
    section === "one_off"
      ? Object.keys(GROUP_LABELS).map((g) => ({
          key: g,
          label: GROUP_LABELS[g]!,
          items: visible.filter((i) => (i.group ?? "setup") === g),
        }))
      : [{ key: "all", label: "", items: visible }];

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label || "Modules and add-ons"}>
          {group.label && <h3 className="mb-2 text-sm font-semibold text-text">{group.label}</h3>}
          <div className="overflow-hidden rounded-2xl border border-line">
            {group.items.length === 0 && <p className="p-4 text-sm text-subtle">No items in this group.</p>}
            <ul className="divide-y divide-line">
              {group.items.map((item) => {
                const expanded = open === item.id;
                const methods = item.billing === "one_off" ? ONE_OFF_METHODS : RECURRING_METHODS;
                return (
                  <li key={item.id} data-item={item.id} className={cn(!item.active && "opacity-60")}>
                    <div className="grid items-center gap-3 p-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_9rem_auto] sm:p-4">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-text">
                          <span className="truncate">{item.name || "Untitled item"}</span>
                          <span className="rounded-full border border-line px-2 py-0.5 text-[0.7rem] font-normal text-subtle">
                            {CATEGORY_LABELS[item.category]}
                          </span>
                          {item.availability === "planned" && (
                            <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[0.7rem] font-normal text-amber-700 dark:text-amber-400">
                              Planned
                            </span>
                          )}
                          {item.public && (
                            <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[0.7rem] font-normal text-accent-strong">
                              Public
                            </span>
                          )}
                        </p>
                        {item.description && (
                          <p className="mt-0.5 truncate text-xs text-subtle">{item.description}</p>
                        )}
                      </div>
                      <div>
                        <label className="sr-only" htmlFor={`method-${item.id}`}>
                          {`${item.name}: pricing method`}
                        </label>
                        <select
                          id={`method-${item.id}`}
                          value={item.method}
                          disabled={disabled}
                          onChange={(e) =>
                            update(item.id, {
                              method: e.target.value as Method,
                              ...(e.target.value === "custom_quote" ? { rate: null } : {}),
                            })
                          }
                          className={input}
                        >
                          {methods.map((m) => (
                            <option key={m} value={m}>
                              {METHOD_LABELS[m]}
                            </option>
                          ))}
                        </select>
                      </div>
                      {item.method === "custom_quote" ? (
                        <p className="text-end text-sm text-subtle">Quoted on scope</p>
                      ) : (
                        <Money
                          label={`Rate${item.billing === "one_off" ? "" : item.billing === "annual" ? " / year" : " / month"}`}
                          value={item.rate}
                          onChange={(v) => update(item.id, { rate: v })}
                          disabled={disabled}
                          currency={currency}
                        />
                      )}
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${item.name} up`}
                          disabled={disabled}
                          onClick={() => move(item.id, -1)}
                          className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
                        >
                          <ArrowUp aria-hidden className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${item.name} down`}
                          disabled={disabled}
                          onClick={() => move(item.id, 1)}
                          className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
                        >
                          <ArrowDown aria-hidden className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Close" : "Edit"} ${item.name || "item"} details`}
                          onClick={() => setOpen(expanded ? null : item.id)}
                          className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
                        >
                          <ChevronDown
                            aria-hidden
                            className={cn("size-4 transition-transform", expanded && "rotate-180")}
                          />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 px-3 pb-3 sm:px-4">
                      <Toggle
                        label="Active"
                        checked={item.active}
                        onChange={(v) => update(item.id, { active: v })}
                        disabled={disabled}
                      />
                      <Toggle
                        label="Show publicly when pricing is on the website"
                        checked={item.public}
                        onChange={(v) => update(item.id, { public: v })}
                        disabled={disabled || item.availability === "planned"}
                      />
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (window.confirm(`Remove ${item.name || "this item"} from the draft?`))
                            onChange(items.filter((i) => i.id !== item.id));
                        }}
                        className="ms-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:text-danger"
                      >
                        <Trash2 aria-hidden className="size-4" />
                        Remove
                      </button>
                    </div>
                    {expanded && (
                      <ItemDetails
                        item={item}
                        update={(patch) => update(item.id, patch)}
                        disabled={disabled}
                        currency={currency}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={add}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 text-sm font-medium text-text hover:border-accent disabled:opacity-50"
      >
        <Plus aria-hidden className="size-4" />
        {section === "recurring" ? "Add module or add-on" : "Add implementation item"}
      </button>
    </div>
  );
}
