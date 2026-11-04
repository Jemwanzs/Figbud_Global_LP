"use client";

import { cn } from "@figbud/ui";
import { Check, ChevronDown, Copy, ExternalLink, Info, LoaderCircle } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

/*
 * The payroll estimate (P14-C), shared by the website and the Studio. All
 * arithmetic happens in the API (services/api/src/payroll/engine.rs): this only
 * collects inputs, asks, and lays out the answer. It's a different thing from
 * the subscription pricing calculator.
 */

export type PayrollMode = "gross_to_net" | "net_to_gross";

export interface PayrollInput {
  mode: PayrollMode;
  amount: string;
  pay_month?: string;
  taxable_benefits?: string;
  pension?: string;
  mortgage_interest?: string;
  insurance_premium?: string;
  other_deductions?: string;
}

export interface PayrollBreakdown {
  gross: string;
  taxable_benefits: string;
  nssf_tier1: string;
  nssf_tier2: string;
  nssf: string;
  shif: string;
  housing_levy: string;
  pension: string;
  retirement_allowed: string;
  mortgage_allowed: string;
  allowable_deductions: string;
  taxable_pay: string;
  bands: { from: string; to: string | null; rate: string; taxed: string; tax: string }[];
  tax_before_relief: string;
  personal_relief: string;
  insurance_relief: string;
  paye: string;
  other_deductions: string;
  total_deductions: string;
  net: string;
  employer: {
    nssf_tier1: string;
    nssf_tier2: string;
    housing_levy: string;
    levies: { name: string; amount: string }[];
    total_cost: string;
  };
}

export interface PayrollResult {
  mode: PayrollMode;
  breakdown: PayrollBreakdown;
  target_net: string | null;
  difference: string | null;
  tolerance: string;
  rules: { label: string; effective_from: string };
  warnings: string[];
}

/** What a website shows about its published calculator. */
export interface PublicPayrollCalculator {
  intro: string;
  disclaimer: string;
  example_gross: string;
  example_net: string;
  version: number;
  rule_sets: {
    label: string;
    effective_from: string;
    sources: { label: string; url: string }[];
    verified_on: string | null;
  }[];
}

/** An error the calculator can show: which field, and what to do. */
export class PayrollError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

const money = (value: string | number) =>
  Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isZero = (value: string) => Number(value) === 0;
const AMOUNT = /^\d{1,10}(\.\d{0,2})?$/;

function Row({
  label,
  value,
  hint,
  strong,
  minus,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  minus?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2", strong && "font-semibold")}>
      <dt className={cn("min-w-0", strong ? "text-text" : "text-muted")}>
        <span>{label}</span>
        {hint && <span className="mt-0.5 block text-xs font-normal text-subtle">{hint}</span>}
      </dt>
      <dd className="shrink-0 text-text tabular-nums">
        {minus && !isZero(value) ? "−" : ""}
        {money(value)}
      </dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium tracking-[0.12em] text-product-text uppercase">{title}</h3>
      <dl className="mt-1 divide-y divide-line text-sm">{children}</dl>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[\s,]/g, ""))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="mt-1.5 min-h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-base text-text tabular-nums"
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const OPTIONAL = [
  ["taxable_benefits", "Non-cash benefits", "Taxed, but not paid out."],
  ["pension", "Registered pension contribution", "Taken from pay; reduces tax up to the limit."],
  ["mortgage_interest", "Mortgage interest", "Paid by you; reduces tax up to the limit."],
  ["insurance_premium", "Insurance premiums", "Paid by you; may earn insurance relief."],
  ["other_deductions", "Other deductions", "Taken from pay after tax, such as a loan repayment."],
] as const;
type OptionalKey = (typeof OPTIONAL)[number][0];

/**
 * Both directions, one layout. Every change asks the API again; an older
 * answer arriving late is ignored, and an error clears the figures, so what's
 * on screen always matches the inputs.
 */
export function PayrollCalculator({
  calculate,
  exampleGross,
  exampleNet,
  disclaimer,
}: {
  calculate: (input: PayrollInput, signal: AbortSignal) => Promise<PayrollResult>;
  exampleGross: string;
  exampleNet: string;
  disclaimer: string;
}) {
  const uid = useId();
  const [mode, setMode] = useState<PayrollMode>("gross_to_net");
  const [amounts, setAmounts] = useState({ gross_to_net: exampleGross, net_to_gross: exampleNet });
  const [extras, setExtras] = useState<Record<OptionalKey, string>>({
    taxable_benefits: "",
    pension: "",
    mortgage_interest: "",
    insurance_premium: "",
    other_deductions: "",
  });
  const [payMonth, setPayMonth] = useState("");
  const [result, setResult] = useState<PayrollResult | null>(null);
  const [error, setError] = useState<PayrollError | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const request = useRef<AbortController | null>(null);
  const amount = amounts[mode];

  // Problems the browser can see at once, without asking.
  const local: PayrollError | null = !amount
    ? new PayrollError("Enter an amount.", "amount")
    : !AMOUNT.test(amount)
      ? new PayrollError("Use digits only, with up to two decimals.", "amount")
      : (OPTIONAL.map(([key]) =>
          extras[key] && !AMOUNT.test(extras[key])
            ? new PayrollError("Use digits only, with up to two decimals.", key)
            : null,
        ).find(Boolean) ?? null);

  useEffect(() => {
    request.current?.abort();
    if (local) return;
    const controller = new AbortController();
    request.current = controller;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const input: PayrollInput = { mode, amount };
        if (payMonth) input.pay_month = `${payMonth}-01`;
        for (const [key] of OPTIONAL) if (extras[key]) input[key] = extras[key];
        const answer = await calculate(input, controller.signal);
        if (controller.signal.aborted) return;
        setResult(answer);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setResult(null);
        setError(
          err instanceof PayrollError ? err : new PayrollError("Something went wrong. Please try again."),
        );
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `calculate` is stable for a given source; the inputs are what change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, amount, payMonth, extras, Boolean(local), calculate]);

  const shown = local ? null : result?.mode === mode ? result : null;
  const problem = local ?? error;
  const b = shown?.breakdown;
  const fieldError = (name: string) => (problem?.field === name ? problem.message : undefined);

  const summary = () => {
    if (!b || !shown) return "";
    const lines: [string, string][] = [
      ["Gross pay", b.gross],
      ["NSSF Tier I", b.nssf_tier1],
      ["NSSF Tier II", b.nssf_tier2],
      ["SHIF", b.shif],
      ["Affordable Housing Levy", b.housing_levy],
      ["Taxable pay", b.taxable_pay],
      ["Tax before relief", b.tax_before_relief],
      ["Personal relief", b.personal_relief],
      ["PAYE", b.paye],
      ["Net pay", b.net],
    ];
    return [
      `Payroll estimate (KES), rules from ${shown.rules.effective_from}`,
      ...lines.map(([label, value]) => `${label}: ${money(value)}`),
      disclaimer,
    ].join("\n");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8" data-testid="payroll-calculator">
      <div className="lg:sticky lg:top-24 lg:col-span-5 lg:self-start">
        <div className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-7">
          <div
            role="radiogroup"
            aria-label="Calculate"
            className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface-2 p-1"
          >
            {(
              [
                ["gross_to_net", "Gross to net"],
                ["net_to_gross", "Net to gross"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  "min-h-11 rounded-full px-3 text-sm transition-colors",
                  mode === value
                    ? "bg-surface font-medium text-text shadow-sm"
                    : "text-muted hover:text-text",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-5">
            <Field
              id={`${uid}-amount`}
              label={mode === "gross_to_net" ? "Gross monthly pay (KES)" : "Net monthly pay you want (KES)"}
              hint={
                mode === "gross_to_net"
                  ? "Cash earnings before any deductions."
                  : "What you want to take home each month."
              }
              value={amount}
              onChange={(value) => setAmounts((a) => ({ ...a, [mode]: value }))}
              error={fieldError("amount")}
            />
          </div>
          <details className="group mt-4 rounded-2xl border border-line">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 text-sm font-medium text-text">
              More options
              <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-4 border-t border-line p-4">
              <div>
                <label htmlFor={`${uid}-month`} className="block text-sm font-medium text-text">
                  Pay month
                </label>
                <input
                  id={`${uid}-month`}
                  type="month"
                  value={payMonth}
                  onChange={(e) => setPayMonth(e.target.value)}
                  aria-invalid={fieldError("pay_month") ? true : undefined}
                  className="mt-1.5 min-h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-base text-text"
                />
                <p className={cn("mt-1 text-xs", fieldError("pay_month") ? "text-danger" : "text-subtle")}>
                  {fieldError("pay_month") ?? "Rules change over time. Leave empty for this month."}
                </p>
              </div>
              {OPTIONAL.map(([key, label, hint]) => (
                <Field
                  key={key}
                  id={`${uid}-${key}`}
                  label={label}
                  hint={hint}
                  value={extras[key]}
                  onChange={(value) => setExtras((x) => ({ ...x, [key]: value }))}
                  error={fieldError(key)}
                />
              ))}
            </div>
          </details>
        </div>
        <p className="mt-4 flex gap-2 text-sm text-muted" data-testid="payroll-disclaimer">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle" />
          {disclaimer}
        </p>
      </div>

      <div className="lg:col-span-7" aria-busy={busy}>
        <div className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-7">
          <div aria-live="polite">
            {problem && !problem.field && (
              <p role="alert" className="text-sm text-danger">
                {problem.message}
              </p>
            )}
            {problem?.field && (
              <p className="text-sm text-muted">Fix the highlighted field to see the estimate.</p>
            )}
            {!problem && !b && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
                Working it out…
              </p>
            )}
            {b && shown && (
              <div
                className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-product-soft p-4 sm:p-5"
                data-testid="payroll-answer"
              >
                <div>
                  <p className="text-sm text-muted">
                    {mode === "gross_to_net" ? "Estimated net pay" : "Gross pay needed"}
                  </p>
                  <p className="mt-0.5 font-display text-3xl font-semibold tracking-tight text-text tabular-nums">
                    <span className="text-lg font-medium text-muted">KES </span>
                    {money(mode === "gross_to_net" ? b.net : b.gross)}
                  </p>
                </div>
                {busy && <LoaderCircle aria-hidden className="size-4 animate-spin text-muted" />}
              </div>
            )}
          </div>

          {b && shown && (
            <div className={cn("mt-6 space-y-6 transition-opacity", busy && "opacity-60")}>
              {shown.warnings.map((warning) => (
                <p key={warning} className="rounded-xl bg-surface-2 p-3 text-sm text-text">
                  {warning}
                </p>
              ))}
              {mode === "net_to_gross" && shown.target_net && (
                <p className="flex items-start gap-2 text-sm text-muted" data-testid="payroll-proof">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>
                    Checked forward: a gross of {money(b.gross)} gives a net of {money(b.net)}
                    {Number(shown.difference) === 0
                      ? ", exactly what you asked for."
                      : `, within ${money(shown.tolerance)} of your target because each amount rounds to the cent.`}
                  </span>
                </p>
              )}

              <Group title="Before tax">
                <Row label="Gross pay" value={b.gross} />
                {!isZero(b.taxable_benefits) && (
                  <Row label="Non-cash benefits (taxed only)" value={b.taxable_benefits} />
                )}
                <Row label="NSSF Tier I" value={b.nssf_tier1} minus hint="Up to the lower earnings limit" />
                <Row
                  label="NSSF Tier II"
                  value={b.nssf_tier2}
                  minus
                  hint="Between the lower and upper earnings limits"
                />
                <Row label="SHIF" value={b.shif} minus hint="Social Health Insurance Fund, on gross pay" />
                <Row
                  label="Affordable Housing Levy"
                  value={b.housing_levy}
                  minus
                  hint="Employee share, on gross pay"
                />
                {!isZero(b.retirement_allowed) && (
                  <Row label="Pension allowed against tax" value={b.retirement_allowed} minus />
                )}
                {!isZero(b.mortgage_allowed) && (
                  <Row label="Mortgage interest allowed" value={b.mortgage_allowed} minus />
                )}
                <Row label="Taxable pay" value={b.taxable_pay} strong />
              </Group>

              <Group title="PAYE">
                <div className="py-2">
                  <dt className="sr-only">Income tax by band</dt>
                  <dd>
                    <details className="group" open>
                      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 text-muted">
                        Tax band by band
                        <ChevronDown
                          aria-hidden
                          className="size-4 transition-transform group-open:rotate-180"
                        />
                      </summary>
                      <table className="mt-1 w-full text-xs">
                        <thead className="text-subtle">
                          <tr>
                            <th scope="col" className="py-1 text-start font-normal">
                              Band
                            </th>
                            <th scope="col" className="py-1 text-end font-normal">
                              Rate
                            </th>
                            <th scope="col" className="py-1 text-end font-normal">
                              Taxed
                            </th>
                            <th scope="col" className="py-1 text-end font-normal">
                              Tax
                            </th>
                          </tr>
                        </thead>
                        <tbody className="text-text tabular-nums">
                          {b.bands.map((band) => (
                            <tr key={band.from} className={cn(isZero(band.taxed) && "text-subtle")}>
                              <td className="py-1 text-start">
                                {band.to
                                  ? `${money(band.from)} to ${money(band.to)}`
                                  : `Above ${money(band.from)}`}
                              </td>
                              <td className="py-1 text-end">{Number(band.rate)}%</td>
                              <td className="py-1 text-end">{money(band.taxed)}</td>
                              <td className="py-1 text-end">{money(band.tax)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  </dd>
                </div>
                <Row label="Tax before relief" value={b.tax_before_relief} />
                <Row label="Personal relief" value={b.personal_relief} minus />
                {!isZero(b.insurance_relief) && (
                  <Row label="Insurance relief" value={b.insurance_relief} minus />
                )}
                <Row label="PAYE" value={b.paye} strong />
              </Group>

              <Group title="Take-home">
                <Row label="Gross pay" value={b.gross} />
                <Row
                  label="NSSF, SHIF and Housing Levy"
                  value={String(Number(b.nssf) + Number(b.shif) + Number(b.housing_levy))}
                  minus
                />
                {!isZero(b.pension) && <Row label="Pension" value={b.pension} minus />}
                <Row label="PAYE" value={b.paye} minus />
                {!isZero(b.other_deductions) && (
                  <Row label="Other deductions" value={b.other_deductions} minus />
                )}
                <Row label="Net pay" value={b.net} strong />
              </Group>

              <details className="group rounded-2xl border border-line">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 text-sm font-medium text-text">
                  What the employer pays
                  <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <dl
                  className="divide-y divide-line border-t border-line px-4 text-sm"
                  data-testid="payroll-employer"
                >
                  <Row label="Gross pay" value={b.gross} />
                  <Row label="NSSF Tier I (employer)" value={b.employer.nssf_tier1} />
                  <Row label="NSSF Tier II (employer)" value={b.employer.nssf_tier2} />
                  <Row label="Housing Levy (employer)" value={b.employer.housing_levy} />
                  {b.employer.levies.map((levy) => (
                    <Row key={levy.name} label={levy.name} value={levy.amount} />
                  ))}
                  <Row label="Total cost to employer" value={b.employer.total_cost} strong />
                </dl>
                <p className="border-t border-line px-4 py-3 text-xs text-subtle">
                  Employer shares never come out of take-home pay.
                </p>
              </details>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-xs text-subtle" data-testid="payroll-rules">
                  {`Rules: ${shown.rules.label}, from ${shown.rules.effective_from}`}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(summary());
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-text"
                >
                  {copied ? (
                    <Check aria-hidden className="size-4" />
                  ) : (
                    <Copy aria-hidden className="size-4" />
                  )}
                  {copied ? "Copied" : "Copy summary"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Where a website's calculator gets its rules from, shown under the calculator. */
export function PayrollSources({ calculator }: { calculator: PublicPayrollCalculator }) {
  const sets = [...calculator.rule_sets].sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  const current = sets[0];
  if (!current) return null;
  return (
    <details className="group rounded-2xl border border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 text-sm font-medium text-text">
        Sources and assumptions
        <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-line p-4 text-sm text-muted">
        <p>
          Assumes a resident employee with one employer, paid monthly. NSSF, SHIF and the Housing Levy are
          taken before PAYE, and amounts round to the cent. Other situations can differ.
        </p>
        {current.verified_on && <p>{`Latest rules checked on ${current.verified_on}.`}</p>}
        <ul className="space-y-1.5">
          {current.sources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1.5 text-text underline underline-offset-2"
              >
                {source.label}
                <ExternalLink aria-hidden className="mt-1 size-3 shrink-0" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
