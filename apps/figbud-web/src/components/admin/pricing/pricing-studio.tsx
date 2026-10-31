"use client";

import { CYCLE_LABELS, type CycleKey, type PriceBook, formatMoney } from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import { ExternalLink, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useId, useState } from "react";

import { AdminError, type FieldError, adminFetch } from "@/lib/admin-client";
import { useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "../action-button";
import { ItemsEditor, validAmount } from "./items-editor";
import { PricingCalculator } from "./pricing-calculator";
import { type PricingAdmin, QUOTE_STATUS, type QuoteSummary } from "./pricing-types";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "items", label: "Modules & items" },
  { key: "plans", label: "Plans" },
  { key: "billing", label: "Billing, tax & terms" },
  { key: "implementation", label: "Implementation" },
  { key: "calculator", label: "Calculator" },
  { key: "quotes", label: "Quotes" },
  { key: "publishing", label: "Publishing" },
  { key: "history", label: "History" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const field =
  "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text disabled:opacity-60";

const STATUS: Record<PricingAdmin["status"], { label: string; tone: string }> = {
  draft: { label: "Draft, not published", tone: "border-line-strong text-muted" },
  in_review: { label: "Awaiting approval", tone: "border-amber-500/40 text-amber-700 dark:text-amber-400" },
  published: { label: "Published", tone: "border-accent/40 text-accent-strong" },
  changes_pending: { label: "Published · draft changes", tone: "border-accent/40 text-accent-strong" },
};

function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface p-5", className)}>
      {title && <h3 className="font-semibold text-text">{title}</h3>}
      {children}
    </section>
  );
}

/**
 * Pricing Studio (P11): one workspace per website for its price book,
 * calculator, quotations, publishing and history. The draft saves without
 * changing published prices; publishing needs a different reviewer; showing
 * prices on the website is a separate switch, off by default.
 */
export function PricingStudio({
  data,
  quotes,
  isOwner,
}: {
  data: PricingAdmin;
  quotes: QuoteSummary[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const uid = useId();
  const initialTab = (TABS.find((t) => t.key === params.get("tab"))?.key ?? "overview") as Tab;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [book, setBook] = useState<PriceBook>(data.draft);
  const [version, setVersion] = useState(data.draft_version);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [effective, setEffective] = useState("");
  const { dirty, markSaved } = useSavedBaseline(book);
  useUnsavedChangesWarning(data.can_edit && dirty);
  const editable = data.can_edit;
  const c = book.currency;
  const amountsValid = book.items.every(
    (i) => validAmount(i.rate) && validAmount(i.minimum_charge) && i.tiers.every((t) => validAmount(t.rate)),
  );

  const choose = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };

  async function run(name: string, task: () => Promise<string>) {
    setBusy(name);
    setMessage(null);
    setFields([]);
    try {
      setMessage({ tone: "ok", text: await task() });
      router.refresh();
    } catch (err) {
      if (err instanceof AdminError) {
        setFields(err.fields);
        setMessage({
          tone: "error",
          text: err.status === 422 ? (err.fields[0]?.message ?? "Some details need attention.") : err.message,
        });
      } else setMessage({ tone: "error", text: "Something went wrong. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", async () => {
      const saved = await adminFetch<{ version: number }>(`sites/${data.site.slug}/pricing/draft`, {
        document: book,
        version,
      });
      setVersion(saved.version);
      markSaved();
      return "Draft saved. Published prices, calculators and quotations are unchanged until a reviewer approves.";
    });
  const action = (name: string, body: Record<string, unknown>, done: string, confirm?: string) => () => {
    if (confirm && !window.confirm(confirm)) return;
    return run(name, async () => {
      await adminFetch(`sites/${data.site.slug}/pricing/${name}`, body);
      return done;
    });
  };

  const priced = book.items.filter((i) => i.rate || i.tiers.length);
  const planned = book.items.filter((i) => i.availability === "planned");
  const unpriced = book.items.filter(
    (i) =>
      i.active && i.availability === "available" && !i.rate && !i.tiers.length && i.method !== "custom_quote",
  );
  const status = STATUS[data.status];
  const review = data.review;
  const canDecide = review && data.can_review && (!review.own || isOwner);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs", status.tone)}>{status.label}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
            data.public_visible ? "border-accent/40 text-accent-strong" : "border-line-strong text-muted",
          )}
        >
          {data.public_visible ? (
            <Eye aria-hidden className="size-3.5" />
          ) : (
            <EyeOff aria-hidden className="size-3.5" />
          )}
          {data.public_visible ? "Shown on the website" : "Hidden from the website"}
        </span>
        <a
          href={`/admin/pricing-workspace/${data.site.slug}`}
          target="_blank"
          rel="noopener"
          className="ms-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm text-text hover:border-line-strong"
          title="Open the calculator in a new tab"
        >
          <ExternalLink aria-hidden className="size-4" />
          Open calculator in a new tab
        </a>
      </div>

      <nav aria-label="Pricing sections" className="mt-6 [scrollbar-width:none] overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {TABS.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                aria-current={tab === t.key ? "page" : undefined}
                onClick={() => choose(t.key)}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors",
                  tab === t.key
                    ? "border-accent font-medium text-text"
                    : "border-transparent text-muted hover:text-text",
                )}
              >
                {t.label}
                {t.key === "quotes" && quotes.length > 0 && (
                  <span className="ms-1.5 rounded-full bg-surface-2 px-1.5 text-xs text-subtle">
                    {quotes.length}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("mt-4 text-sm", message.tone === "error" ? "text-danger" : "text-accent-strong")}
        >
          {message.text}
        </p>
      )}

      <div className="mt-6">
        {tab === "overview" && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card title="Price book">
              <p className="mt-2 text-sm text-muted">
                {data.published_number
                  ? `Version ${data.published_number} published${data.published_at ? ` on ${new Date(data.published_at).toLocaleDateString("en-GB")}` : ""}.`
                  : "Nothing published yet. Quotations need a published version."}
              </p>
              <p className="mt-2 text-sm text-muted">{`Currency ${book.currency}${book.tax.rate ? ` · ${book.tax.name} ${book.tax.rate}% ${book.tax.presentation}` : " · no tax configured"}`}</p>
            </Card>
            <Card title="Items">
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-muted">Priced</dt>
                <dd className="text-end font-mono">{priced.length}</dd>
                <dt className="text-muted">Rate not set</dt>
                <dd className="text-end font-mono">{unpriced.length}</dd>
                <dt className="text-muted">Planned</dt>
                <dd className="text-end font-mono">{planned.length}</dd>
                <dt className="text-muted">Public</dt>
                <dd className="text-end font-mono">{book.items.filter((i) => i.public).length}</dd>
              </dl>
            </Card>
            <Card title="Billing cycles">
              <ul className="mt-2 space-y-1 text-sm">
                {book.cycles.map((cy) => (
                  <li key={cy.key} className="flex justify-between gap-2">
                    <span className={cy.enabled ? "text-text" : "text-subtle line-through"}>
                      {CYCLE_LABELS[cy.key].label}
                    </span>
                    <span className="text-muted">
                      {cy.discount.kind === "none" || Number(cy.discount.value) === 0
                        ? "No discount"
                        : cy.discount.kind === "percent"
                          ? `${cy.discount.value}% off`
                          : `${formatMoney(cy.discount.value, c)} off`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Quotations">
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
                {(["draft", "pending_approval", "sent", "accepted"] as const).map((s) => (
                  <div key={s} className="contents">
                    <dt className="text-muted">{QUOTE_STATUS[s].label}</dt>
                    <dd className="text-end font-mono">{quotes.filter((q) => q.status === s).length}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            {unpriced.length > 0 && (
              <Card className="md:col-span-2 xl:col-span-4">
                <p className="text-sm text-muted">
                  {`${unpriced.length} available item${unpriced.length === 1 ? " has" : "s have"} no rate yet. They're left out of calculations and block quotations until priced. Nothing is ever priced automatically, and the reference USD figures are not selling prices.`}
                </p>
              </Card>
            )}
          </div>
        )}

        {tab === "items" && (
          <ItemsEditor
            items={book.items}
            section="recurring"
            onChange={(items) => setBook({ ...book, items })}
            disabled={!editable}
            currency={c}
          />
        )}
        {tab === "implementation" && (
          <div className="space-y-4">
            <p className="max-w-3xl text-sm text-muted">
              One-off charges, kept separate from the subscription. Each item can be charged, included,
              optional or quoted on scope; training can be priced per participant, session, day or as a fixed
              amount.
            </p>
            <ItemsEditor
              items={book.items}
              section="one_off"
              onChange={(items) => setBook({ ...book, items })}
              disabled={!editable}
              currency={c}
            />
          </div>
        )}

        {tab === "plans" && (
          <div className="space-y-4">
            <p className="max-w-3xl text-sm text-muted">
              Packages of modules (for example Core HR + Payroll). Commercial models are under Billing, tax &
              terms.
            </p>
            {book.plans.map((plan, pi) => (
              <Card key={plan.id}>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div>
                    <label htmlFor={`${uid}-plan-${pi}`} className="block text-xs font-medium text-muted">
                      Plan name
                    </label>
                    <input
                      id={`${uid}-plan-${pi}`}
                      value={plan.name}
                      disabled={!editable}
                      onChange={(e) =>
                        setBook({
                          ...book,
                          plans: book.plans.map((p, j) => (j === pi ? { ...p, name: e.target.value } : p)),
                        })
                      }
                      className={cn(field, "mt-1")}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => setBook({ ...book, plans: book.plans.filter((_, j) => j !== pi) })}
                    className="inline-flex min-h-11 items-center gap-1.5 self-end rounded-lg px-3 text-sm text-muted hover:text-danger"
                  >
                    <Trash2 aria-hidden className="size-4" />
                    Remove
                  </button>
                </div>
                <fieldset className="mt-4">
                  <legend className="text-xs font-medium text-muted">Modules in the plan</legend>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {book.items
                      .filter((i) => i.billing !== "one_off")
                      .map((item) => (
                        <label key={item.id} className="inline-flex min-h-9 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            disabled={!editable}
                            checked={plan.item_ids.includes(item.id)}
                            onChange={(e) =>
                              setBook({
                                ...book,
                                plans: book.plans.map((p, j) =>
                                  j === pi
                                    ? {
                                        ...p,
                                        item_ids: e.target.checked
                                          ? [...p.item_ids, item.id]
                                          : p.item_ids.filter((x) => x !== item.id),
                                      }
                                    : p,
                                ),
                              })
                            }
                            className="size-4 accent-[var(--accent)]"
                          />
                          {item.name}
                        </label>
                      ))}
                  </div>
                </fieldset>
                <label className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={!editable}
                    checked={plan.public}
                    onChange={(e) =>
                      setBook({
                        ...book,
                        plans: book.plans.map((p, j) => (j === pi ? { ...p, public: e.target.checked } : p)),
                      })
                    }
                    className="size-4 accent-[var(--accent)]"
                  />
                  Show publicly (only when all its modules are public and priced)
                </label>
              </Card>
            ))}
            <button
              type="button"
              disabled={!editable}
              onClick={() =>
                setBook({
                  ...book,
                  plans: [
                    ...book.plans,
                    {
                      id: `plan_${book.plans.length + 1}`,
                      name: "New plan",
                      description: "",
                      item_ids: [],
                      public: false,
                      active: true,
                    },
                  ],
                })
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 text-sm font-medium text-text hover:border-accent disabled:opacity-50"
            >
              <Plus aria-hidden className="size-4" />
              Add plan
            </button>
          </div>
        )}

        {tab === "billing" && (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Billing cycles and discounts">
              <p className="mt-1 text-sm text-muted">
                Discounts apply only when set here (none by default), and only to discountable items. A fixed
                amount comes off each period once. An item&apos;s own cycle rate replaces the discount for
                that item.
              </p>
              <div className="mt-4 space-y-3">
                {book.cycles.map((cy, ci) => {
                  const update = (patch: Partial<typeof cy>) =>
                    setBook({
                      ...book,
                      cycles: book.cycles.map((x, j) => (j === ci ? { ...x, ...patch } : x)),
                    });
                  return (
                    <div
                      key={cy.key}
                      className="grid items-end gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1fr_9rem_9rem]"
                    >
                      <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-text">
                        <input
                          type="checkbox"
                          disabled={!editable}
                          checked={cy.enabled}
                          onChange={(e) => update({ enabled: e.target.checked })}
                          className="size-4 accent-[var(--accent)]"
                        />
                        {`${CYCLE_LABELS[cy.key as CycleKey].label} · ${CYCLE_LABELS[cy.key as CycleKey].months} month${CYCLE_LABELS[cy.key as CycleKey].months > 1 ? "s" : ""}`}
                      </label>
                      <div>
                        <label htmlFor={`${uid}-dk-${cy.key}`} className="block text-xs text-muted">
                          Discount
                        </label>
                        <select
                          id={`${uid}-dk-${cy.key}`}
                          value={cy.discount.kind}
                          disabled={!editable}
                          onChange={(e) =>
                            update({
                              discount: { ...cy.discount, kind: e.target.value as typeof cy.discount.kind },
                            })
                          }
                          className={cn(field, "mt-1")}
                        >
                          <option value="none">None</option>
                          <option value="percent">Percentage</option>
                          <option value="fixed">{`Fixed (${c})`}</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${uid}-dv-${cy.key}`} className="block text-xs text-muted">
                          {cy.discount.kind === "percent" ? "Percent" : "Amount per period"}
                        </label>
                        <input
                          id={`${uid}-dv-${cy.key}`}
                          inputMode="decimal"
                          disabled={!editable || cy.discount.kind === "none"}
                          value={cy.discount.kind === "none" ? "" : cy.discount.value}
                          onChange={(e) =>
                            update({ discount: { ...cy.discount, value: e.target.value.trim() } })
                          }
                          className={cn(field, "mt-1 text-end font-mono")}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 max-w-xs">
                <label htmlFor={`${uid}-min`} className="block text-xs font-medium text-muted">
                  {`Minimum subscription per month (${c})`}
                </label>
                <input
                  id={`${uid}-min`}
                  inputMode="decimal"
                  placeholder="None"
                  disabled={!editable}
                  value={book.minimum_monthly_subscription ?? ""}
                  onChange={(e) =>
                    setBook({ ...book, minimum_monthly_subscription: e.target.value.trim() || null })
                  }
                  className={cn(field, "mt-1 text-end font-mono")}
                />
              </div>
            </Card>

            <Card title="Currency and tax">
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${uid}-cur`} className="block text-xs font-medium text-muted">
                    Base currency
                  </label>
                  <input
                    id={`${uid}-cur`}
                    maxLength={3}
                    disabled={!editable}
                    value={book.currency}
                    onChange={(e) => setBook({ ...book, currency: e.target.value.toUpperCase() })}
                    className={cn(field, "mt-1 font-mono uppercase")}
                  />
                </div>
                <div>
                  <label htmlFor={`${uid}-dec`} className="block text-xs font-medium text-muted">
                    Round to decimals
                  </label>
                  <input
                    id={`${uid}-dec`}
                    type="number"
                    min={0}
                    max={4}
                    disabled={!editable}
                    value={book.decimals}
                    onChange={(e) => setBook({ ...book, decimals: Number(e.target.value) })}
                    className={cn(field, "mt-1")}
                  />
                </div>
                <div>
                  <label htmlFor={`${uid}-taxn`} className="block text-xs font-medium text-muted">
                    Tax name
                  </label>
                  <input
                    id={`${uid}-taxn`}
                    disabled={!editable}
                    value={book.tax.name}
                    onChange={(e) => setBook({ ...book, tax: { ...book.tax, name: e.target.value } })}
                    className={cn(field, "mt-1")}
                  />
                </div>
                <div>
                  <label htmlFor={`${uid}-taxr`} className="block text-xs font-medium text-muted">
                    Tax rate %
                  </label>
                  <input
                    id={`${uid}-taxr`}
                    inputMode="decimal"
                    placeholder="Not configured"
                    disabled={!editable}
                    value={book.tax.rate ?? ""}
                    onChange={(e) =>
                      setBook({ ...book, tax: { ...book.tax, rate: e.target.value.trim() || null } })
                    }
                    className={cn(field, "mt-1 text-end font-mono")}
                  />
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-muted">Prices are shown</p>
                  <div className="mt-1 flex gap-4 text-sm">
                    {(["exclusive", "inclusive"] as const).map((p) => (
                      <label key={p} className="inline-flex min-h-10 items-center gap-2">
                        <input
                          type="radio"
                          name={`${uid}-taxp`}
                          disabled={!editable}
                          checked={book.tax.presentation === p}
                          onChange={() => setBook({ ...book, tax: { ...book.tax, presentation: p } })}
                        />
                        {p === "exclusive" ? "Before tax (tax added)" : "Including tax"}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <fieldset className="mt-5">
                <legend className="text-sm font-medium text-text">Other currencies (manual rates)</legend>
                <p className="mt-0.5 text-xs text-subtle">
                  Prices stay in the base currency; another currency is converted at the rate you enter (base
                  units per 1 unit). Nothing is converted automatically.
                </p>
                {book.fx_rates.map((fx, fi) => (
                  <div key={fi} className="mt-2 grid grid-cols-[6rem_1fr_auto] items-end gap-2">
                    <input
                      aria-label={`Currency ${fi + 1}`}
                      maxLength={3}
                      disabled={!editable}
                      value={fx.currency}
                      onChange={(e) => {
                        const cur = e.target.value.toUpperCase();
                        const fx_rates = book.fx_rates.map((x, j) =>
                          j === fi ? { ...x, currency: cur } : x,
                        );
                        setBook({
                          ...book,
                          fx_rates,
                          supported_currencies: [
                            book.currency,
                            ...fx_rates.map((x) => x.currency).filter(Boolean),
                          ],
                        });
                      }}
                      className={cn(field, "font-mono uppercase")}
                    />
                    <input
                      aria-label={`${fx.currency || "Currency"}: ${book.currency} per unit`}
                      inputMode="decimal"
                      disabled={!editable}
                      value={fx.rate}
                      onChange={(e) =>
                        setBook({
                          ...book,
                          fx_rates: book.fx_rates.map((x, j) =>
                            j === fi ? { ...x, rate: e.target.value.trim() } : x,
                          ),
                        })
                      }
                      className={cn(field, "text-end font-mono")}
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${fx.currency || "currency"}`}
                      disabled={!editable}
                      onClick={() => {
                        const fx_rates = book.fx_rates.filter((_, j) => j !== fi);
                        setBook({
                          ...book,
                          fx_rates,
                          supported_currencies: [book.currency, ...fx_rates.map((x) => x.currency)],
                        });
                      }}
                      className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-danger"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() =>
                    setBook({ ...book, fx_rates: [...book.fx_rates, { currency: "", rate: "" }] })
                  }
                  className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-accent hover:bg-accent-soft"
                >
                  <Plus aria-hidden className="size-4" />
                  Add currency
                </button>
                <label htmlFor={`${uid}-fxs`} className="mt-3 block text-xs font-medium text-muted">
                  Exchange-rate source
                </label>
                <input
                  id={`${uid}-fxs`}
                  disabled={!editable}
                  value={book.fx_source}
                  onChange={(e) => setBook({ ...book, fx_source: e.target.value })}
                  className={cn(field, "mt-1")}
                />
              </fieldset>
            </Card>

            <Card title="Commercial models">
              <p className="mt-1 text-sm text-muted">
                Presets for the calculator: which items they start with and their default billing cycle.
                Change them freely; nothing is hard-coded.
              </p>
              <div className="mt-4 space-y-3">
                {book.models.map((m, mi) => (
                  <div key={m.id} className="rounded-xl border border-line p-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                      <div>
                        <label htmlFor={`${uid}-mn-${mi}`} className="block text-xs text-muted">
                          Name
                        </label>
                        <input
                          id={`${uid}-mn-${mi}`}
                          disabled={!editable}
                          value={m.name}
                          onChange={(e) =>
                            setBook({
                              ...book,
                              models: book.models.map((x, j) =>
                                j === mi ? { ...x, name: e.target.value } : x,
                              ),
                            })
                          }
                          className={cn(field, "mt-1")}
                        />
                      </div>
                      <div>
                        <label htmlFor={`${uid}-mc-${mi}`} className="block text-xs text-muted">
                          Default cycle
                        </label>
                        <select
                          id={`${uid}-mc-${mi}`}
                          disabled={!editable}
                          value={m.default_cycle}
                          onChange={(e) =>
                            setBook({
                              ...book,
                              models: book.models.map((x, j) =>
                                j === mi ? { ...x, default_cycle: e.target.value as CycleKey } : x,
                              ),
                            })
                          }
                          className={cn(field, "mt-1")}
                        >
                          {(Object.keys(CYCLE_LABELS) as CycleKey[]).map((k) => (
                            <option key={k} value={k}>
                              {CYCLE_LABELS[k].label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-subtle">{m.description}</p>
                    <label className="mt-2 inline-flex min-h-9 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        disabled={!editable}
                        checked={m.enabled}
                        onChange={(e) =>
                          setBook({
                            ...book,
                            models: book.models.map((x, j) =>
                              j === mi ? { ...x, enabled: e.target.checked } : x,
                            ),
                          })
                        }
                        className="size-4 accent-[var(--accent)]"
                      />
                      Offered in the calculator
                    </label>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-sm text-accent">{`Starts with ${m.item_ids.length} item${m.item_ids.length === 1 ? "" : "s"}`}</summary>
                      <div className="mt-2 grid gap-1 sm:grid-cols-2">
                        {book.items.map((item) => (
                          <label key={item.id} className="inline-flex min-h-8 items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              disabled={!editable}
                              checked={m.item_ids.includes(item.id)}
                              onChange={(e) =>
                                setBook({
                                  ...book,
                                  models: book.models.map((x, j) =>
                                    j === mi
                                      ? {
                                          ...x,
                                          item_ids: e.target.checked
                                            ? [...x.item_ids, item.id]
                                            : x.item_ids.filter((y) => y !== item.id),
                                        }
                                      : x,
                                  ),
                                })
                              }
                              className="size-4 accent-[var(--accent)]"
                            />
                            {item.name}
                          </label>
                        ))}
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Quotation terms">
              <div className="mt-4 max-w-xs">
                <label htmlFor={`${uid}-valid`} className="block text-xs font-medium text-muted">
                  Quotations valid for (days)
                </label>
                <input
                  id={`${uid}-valid`}
                  type="number"
                  min={1}
                  max={365}
                  disabled={!editable}
                  value={book.quote_validity_days}
                  onChange={(e) => setBook({ ...book, quote_validity_days: Number(e.target.value) })}
                  className={cn(field, "mt-1")}
                />
              </div>
              <label htmlFor={`${uid}-terms`} className="mt-4 block text-xs font-medium text-muted">
                Default commercial terms (shown on quotations)
              </label>
              <textarea
                id={`${uid}-terms`}
                rows={6}
                maxLength={4000}
                disabled={!editable}
                value={book.terms}
                onChange={(e) => setBook({ ...book, terms: e.target.value })}
                placeholder="Payment terms, what's included, validity, and anything legal has approved."
                className={cn(field, "mt-1 py-2")}
              />
            </Card>
          </div>
        )}

        {tab === "calculator" && (
          <div className="space-y-4">
            <p className="max-w-3xl text-sm text-muted">
              {data.published
                ? dirty || data.status === "changes_pending"
                  ? "Trying the draft prices. Quotations use the published version; open the calculator in a new tab to quote."
                  : "Using the current prices. Quotations are calculated from the published version."
                : "Trying the draft prices. Publish this pricing to issue quotations."}
            </p>
            <PricingCalculator
              slug={data.site.slug}
              book={book}
              source={dirty || data.status !== "published" ? "draft" : "published"}
              canQuote={!dirty && data.status === "published" && data.can_edit}
            />
            {dirty && (
              <p className="text-xs text-subtle">Unsaved edits are not used until the draft is saved.</p>
            )}
          </div>
        )}

        {tab === "quotes" && (
          <div className="space-y-4">
            {quotes.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
                No quotations yet. Create one from the calculator once prices are published.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-line">
                <table className="w-full min-w-[44rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2 text-xs text-subtle">
                      <th scope="col" className="px-4 py-2.5 text-start font-medium">
                        Reference
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-medium">
                        Customer
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-medium">
                        Status
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-end font-medium">
                        First invoice
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-end font-medium">
                        Renewal
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-end font-medium">
                        Valid until
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr key={q.id} className="border-b border-line last:border-b-0 hover:bg-surface-2/50">
                        <td className="px-4 py-3 font-mono">
                          <Link
                            href={`/admin/pricing/quotes/${q.id}`}
                            className="text-accent hover:underline"
                          >
                            {q.reference}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-text">{q.customer_name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-xs",
                              QUOTE_STATUS[q.status].tone,
                            )}
                          >
                            {QUOTE_STATUS[q.status].label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-end font-mono tabular-nums">
                          {formatMoney(q.due_first_period, q.currency)}
                        </td>
                        <td className="px-4 py-3 text-end font-mono tabular-nums">
                          {formatMoney(q.renewal_amount, q.currency)}
                        </td>
                        <td className="px-4 py-3 text-end text-muted">{q.expiry_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "publishing" && (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="1. Publish pricing configuration">
              <p className="mt-1 text-sm text-muted">
                Makes the approved version available to the Studio&apos;s calculators and quotations. It does
                not show prices on the website.
              </p>
              <div className="mt-4">
                <h4 className="text-sm font-medium text-text">Changes since the last publication</h4>
                {data.changes.first ? (
                  <p className="mt-1 text-sm text-muted">First publication.</p>
                ) : data.changes.items.length === 0 && !data.changes.settings_changed ? (
                  <p className="mt-1 text-sm text-muted">No changes.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {data.changes.items.map((ch) => (
                      <li key={ch.item_id} className="flex flex-wrap justify-between gap-2">
                        <span className="text-text">
                          {ch.name}{" "}
                          <span className="text-xs text-subtle">
                            {ch.change === "added"
                              ? "added"
                              : ch.change === "removed"
                                ? "removed"
                                : "changed"}
                          </span>
                        </span>
                        {ch.change === "changed" && ch.before !== ch.after && (
                          <span className="font-mono text-xs text-muted">
                            {`${ch.before ? formatMoney(ch.before, c) : "not set"} → ${ch.after ? formatMoney(ch.after, c) : "not set"}`}
                          </span>
                        )}
                      </li>
                    ))}
                    {data.changes.settings_changed && (
                      <li className="text-muted">Billing, tax, models or terms changed.</li>
                    )}
                  </ul>
                )}
              </div>
              {review && (
                <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-muted">
                  {`Approval requested by ${review.own ? "you" : (review.requested_by ?? "someone")}${review.note ? `: “${review.note}”` : "."}`}
                </p>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${uid}-note`} className="block text-xs font-medium text-muted">
                    Note
                  </label>
                  <input
                    id={`${uid}-note`}
                    maxLength={300}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className={cn(field, "mt-1")}
                  />
                </div>
                {!review && (
                  <div>
                    <label htmlFor={`${uid}-eff`} className="block text-xs font-medium text-muted">
                      Effective from
                    </label>
                    <input
                      id={`${uid}-eff`}
                      type="date"
                      value={effective}
                      onChange={(e) => setEffective(e.target.value)}
                      className={cn(field, "mt-1")}
                    />
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {!review && data.can_edit && (
                  <ActionButton
                    ready={!dirty && data.draft_version > 0 && data.status !== "published"}
                    busy={busy === "submit"}
                    hint={
                      dirty
                        ? "Save the draft first."
                        : data.status === "published"
                          ? "Nothing changed since publication."
                          : undefined
                    }
                    onClick={action(
                      "submit",
                      { note, effective_from: effective || null },
                      "Approval requested. A different reviewer approves it.",
                    )}
                  >
                    Ask for approval
                  </ActionButton>
                )}
                {review && data.can_review && (
                  <>
                    <ActionButton
                      ready={Boolean(canDecide)}
                      busy={busy === "publish"}
                      hint={
                        review.own && !isOwner ? "Another reviewer approves your own request." : undefined
                      }
                      onClick={action(
                        "publish",
                        { note },
                        "Published. Calculators and new quotations use this version; existing quotations keep theirs.",
                      )}
                    >
                      Approve and publish
                    </ActionButton>
                    <ActionButton
                      variant="secondary"
                      ready={Boolean(canDecide)}
                      busy={busy === "reject"}
                      onClick={action("reject", { note }, "Request declined; the draft is kept.")}
                    >
                      Decline
                    </ActionButton>
                  </>
                )}
              </div>
            </Card>

            <Card title="2. Show pricing on the website">
              <p className="mt-1 text-sm text-muted">
                Off by default. When off, the website shows no prices (visitors can request a quote), while
                calculators and approved quotations keep working. When on, only published items marked public,
                available and priced are shown.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line p-4">
                <p id={`${uid}-vis`} className="font-medium text-text">
                  {data.public_visible
                    ? "Prices are shown on the website"
                    : "Prices are hidden from the website"}
                </p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={data.public_visible}
                  aria-labelledby={`${uid}-vis`}
                  disabled={!data.can_review || !data.published || busy === "visibility"}
                  onClick={action(
                    "visibility",
                    { visible: !data.public_visible },
                    data.public_visible
                      ? "Prices are hidden from the website."
                      : "Prices now show on the website (public items only).",
                    data.public_visible ? undefined : "Show the published public prices on the website now?",
                  )}
                  className={cn(
                    "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
                    data.public_visible ? "border-accent bg-accent" : "border-line-strong bg-surface-3",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-5 rounded-full bg-white shadow-sm transition-transform",
                      data.public_visible
                        ? "translate-x-6 rtl:-translate-x-6"
                        : "translate-x-1 rtl:-translate-x-1",
                    )}
                  />
                </button>
              </div>
              {!data.published && (
                <p className="mt-2 text-xs text-subtle">Publish a pricing version first.</p>
              )}
              {!data.can_review && (
                <p className="mt-2 text-xs text-subtle">Reviewers and owners change this switch.</p>
              )}
              <p className="mt-3 text-sm text-muted">
                {`Public items in the published version: ${data.published?.items.filter((i) => i.public && i.active && i.availability === "available" && (i.rate || i.tiers.length)).length ?? 0}.`}
              </p>
            </Card>
          </div>
        )}

        {tab === "history" && (
          <Card title="Published versions">
            {data.versions.length === 0 ? (
              <p className="mt-2 text-sm text-subtle">Nothing published yet.</p>
            ) : (
              <ol className="mt-3 divide-y divide-line">
                {data.versions.map((v) => (
                  <li key={v.number} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium text-text">
                        {`Version ${v.number}`}
                        {v.number === data.published_number && (
                          <span className="ms-2 text-xs text-accent-strong">Current</span>
                        )}
                      </p>
                      <p className="text-sm text-muted">{v.note}</p>
                      <p className="text-xs text-subtle">
                        {`Approved by ${v.published_by ?? "someone"} · ${new Date(v.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}${v.effective_from ? ` · effective ${v.effective_from}` : ""}`}
                      </p>
                    </div>
                    {data.can_edit && v.number !== data.published_number && (
                      <ActionButton
                        variant="secondary"
                        ready={!dirty}
                        hint={dirty ? "Save or discard your changes first." : undefined}
                        busy={busy === "rollback"}
                        onClick={action(
                          "rollback",
                          { version: v.number },
                          `Version ${v.number} copied into the draft. Ask for approval to publish it again.`,
                          `Replace the draft with version ${v.number}?`,
                        )}
                      >
                        Restore into draft
                      </ActionButton>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-4 text-xs text-subtle">
              Every save, approval, publication and visibility change is in the activity log. Restoring never
              changes existing quotations.
            </p>
          </Card>
        )}
      </div>

      {editable && ["items", "plans", "billing", "implementation"].includes(tab) && (
        <div className="sticky bottom-0 z-10 -mx-5 mt-8 flex flex-wrap items-center gap-3 border-t border-line bg-bg/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8">
          <p className="text-sm text-muted">
            {fields.length
              ? fields.map((f) => f.message).join(" ")
              : dirty
                ? "Unsaved changes to the draft."
                : "The draft is saved."}
          </p>
          <div className="ms-auto flex gap-2">
            {dirty && (
              <ActionButton variant="ghost" ready onClick={() => setBook(data.draft)}>
                Discard
              </ActionButton>
            )}
            <ActionButton
              ready={dirty && amountsValid}
              busy={busy === "save"}
              hint={!amountsValid ? "Fix the highlighted amounts." : undefined}
              onClick={save}
            >
              Save draft
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  );
}
