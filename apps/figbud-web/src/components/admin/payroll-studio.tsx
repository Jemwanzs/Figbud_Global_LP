"use client";

import {
  PayrollCalculator,
  PayrollError,
  type PayrollInput,
  type PayrollResult,
} from "@figbud/site-kit/payroll-calculator";
import { cn } from "@figbud/ui";
import { CheckCircle2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { sameValue, useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { LocalTime } from "./local-time";

export interface RuleSet {
  label: string;
  effective_from: string;
  nssf: { rate: string; lower_limit: string; upper_limit: string };
  shif: { rate: string; minimum: string };
  housing_levy: { employee_rate: string; employer_rate: string };
  paye: {
    bands: { up_to: string | null; rate: string }[];
    personal_relief: string;
    insurance_relief_rate: string;
    insurance_relief_cap: string;
  };
  limits: { retirement: string; mortgage_interest: string };
  employer_levies: { name: string; amount: string }[];
  sources: { label: string; url: string }[];
  verified_on: string | null;
  notes: string | null;
}

export interface CalculatorConfig {
  rule_sets: RuleSet[];
  intro: string;
  disclaimer: string;
  example_gross: string;
  example_net: string;
}

export interface PayrollAdmin {
  site: { slug: string; name: string };
  draft: CalculatorConfig;
  draft_version: number;
  published: CalculatorConfig | null;
  published_number: number;
  published_at: string | null;
  public_visible: boolean;
  review: { requested_at: string; note: string | null; mine: boolean } | null;
  versions: { number: number; note: string | null; created_at: string; published_by: string | null }[];
  can_edit: boolean;
  can_review: boolean;
  is_owner: boolean;
}

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text disabled:opacity-60";

function Number2({
  label,
  value,
  onChange,
  disabled,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  suffix?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-muted">
        {label}
        {suffix && <span className="text-subtle"> ({suffix})</span>}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\s/g, ""))}
        className={cn(inputClass, "tabular-nums")}
      />
    </div>
  );
}

function RuleSetEditor({
  set,
  onChange,
  onRemove,
  disabled,
  canRemove,
}: {
  set: RuleSet;
  onChange: (next: RuleSet) => void;
  onRemove: () => void;
  disabled: boolean;
  canRemove: boolean;
}) {
  const uid = useId();
  const put = (patch: Partial<RuleSet>) => onChange({ ...set, ...patch });
  return (
    <details className="group rounded-2xl border border-line" data-rule-set={set.effective_from}>
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-3 rounded-2xl px-4 py-2">
        <span className="font-medium text-text">{set.label || "Untitled rules"}</span>
        <span className="text-sm text-subtle">{`from ${set.effective_from}`}</span>
        <span className="ms-auto">
          {set.verified_on ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
              <CheckCircle2 aria-hidden className="size-3.5" />
              {`Checked ${set.verified_on}`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">
              <ShieldAlert aria-hidden className="size-3.5" />
              Not checked yet
            </span>
          )}
        </span>
      </summary>
      <div className="space-y-5 border-t border-line p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${uid}-label`} className="block text-xs font-medium text-muted">
              Name
            </label>
            <input
              id={`${uid}-label`}
              value={set.label}
              maxLength={80}
              disabled={disabled}
              onChange={(e) => put({ label: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-from`} className="block text-xs font-medium text-muted">
              Applies from
            </label>
            <input
              id={`${uid}-from`}
              type="date"
              value={set.effective_from}
              disabled={disabled}
              onChange={(e) => put({ effective_from: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-verified`} className="block text-xs font-medium text-muted">
              Checked against official sources on
            </label>
            <input
              id={`${uid}-verified`}
              type="date"
              value={set.verified_on ?? ""}
              disabled={disabled}
              onChange={(e) => put({ verified_on: e.target.value || null })}
              className={inputClass}
            />
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-text">NSSF</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Number2
              label="Rate"
              suffix="%"
              value={set.nssf.rate}
              disabled={disabled}
              onChange={(rate) => put({ nssf: { ...set.nssf, rate } })}
            />
            <Number2
              label="Lower earnings limit"
              suffix="KES"
              value={set.nssf.lower_limit}
              disabled={disabled}
              onChange={(lower_limit) => put({ nssf: { ...set.nssf, lower_limit } })}
            />
            <Number2
              label="Upper earnings limit"
              suffix="KES"
              value={set.nssf.upper_limit}
              disabled={disabled}
              onChange={(upper_limit) => put({ nssf: { ...set.nssf, upper_limit } })}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-text">SHIF and Affordable Housing Levy</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-4">
            <Number2
              label="SHIF rate"
              suffix="%"
              value={set.shif.rate}
              disabled={disabled}
              onChange={(rate) => put({ shif: { ...set.shif, rate } })}
            />
            <Number2
              label="SHIF minimum"
              suffix="KES"
              value={set.shif.minimum}
              disabled={disabled}
              onChange={(minimum) => put({ shif: { ...set.shif, minimum } })}
            />
            <Number2
              label="Levy, employee"
              suffix="%"
              value={set.housing_levy.employee_rate}
              disabled={disabled}
              onChange={(employee_rate) => put({ housing_levy: { ...set.housing_levy, employee_rate } })}
            />
            <Number2
              label="Levy, employer"
              suffix="%"
              value={set.housing_levy.employer_rate}
              disabled={disabled}
              onChange={(employer_rate) => put({ housing_levy: { ...set.housing_levy, employer_rate } })}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-text">PAYE bands (monthly taxable pay)</legend>
          <ol className="mt-2 space-y-2">
            {set.paye.bands.map((band, i) => {
              const last = i === set.paye.bands.length - 1;
              const setBand = (patch: Partial<RuleSet["paye"]["bands"][number]>) =>
                put({
                  paye: {
                    ...set.paye,
                    bands: set.paye.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)),
                  },
                });
              return (
                <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  {last ? (
                    <p className="flex min-h-11 items-center self-end text-sm text-muted">Everything above</p>
                  ) : (
                    <Number2
                      label={`Band ${i + 1} up to`}
                      suffix="KES"
                      value={band.up_to ?? ""}
                      disabled={disabled}
                      onChange={(up_to) => setBand({ up_to })}
                    />
                  )}
                  <Number2
                    label={`Band ${i + 1} rate`}
                    suffix="%"
                    value={band.rate}
                    disabled={disabled}
                    onChange={(rate) => setBand({ rate })}
                  />
                  <button
                    type="button"
                    aria-label={`Remove band ${i + 1}`}
                    disabled={disabled || last || set.paye.bands.length < 2}
                    onClick={() =>
                      put({ paye: { ...set.paye, bands: set.paye.bands.filter((_, j) => j !== i) } })
                    }
                    className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const bands = [...set.paye.bands];
              bands.splice(Math.max(bands.length - 1, 0), 0, { up_to: "", rate: "" });
              put({ paye: { ...set.paye, bands } });
            }}
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-accent hover:bg-accent-soft/60 disabled:opacity-50"
          >
            <Plus aria-hidden className="size-4" />
            Add a band
          </button>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-text">Reliefs and limits</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Number2
              label="Personal relief"
              suffix="KES a month"
              value={set.paye.personal_relief}
              disabled={disabled}
              onChange={(personal_relief) => put({ paye: { ...set.paye, personal_relief } })}
            />
            <Number2
              label="Insurance relief rate"
              suffix="%"
              value={set.paye.insurance_relief_rate}
              disabled={disabled}
              onChange={(insurance_relief_rate) => put({ paye: { ...set.paye, insurance_relief_rate } })}
            />
            <Number2
              label="Insurance relief limit"
              suffix="KES a month"
              value={set.paye.insurance_relief_cap}
              disabled={disabled}
              onChange={(insurance_relief_cap) => put({ paye: { ...set.paye, insurance_relief_cap } })}
            />
            <Number2
              label="Retirement limit, with NSSF"
              suffix="KES a month"
              value={set.limits.retirement}
              disabled={disabled}
              onChange={(retirement) => put({ limits: { ...set.limits, retirement } })}
            />
            <Number2
              label="Mortgage interest limit"
              suffix="KES a month"
              value={set.limits.mortgage_interest}
              disabled={disabled}
              onChange={(mortgage_interest) => put({ limits: { ...set.limits, mortgage_interest } })}
            />
            {set.employer_levies.map((levy, i) => (
              <Number2
                key={levy.name}
                label={levy.name}
                suffix="KES, employer"
                value={levy.amount}
                disabled={disabled}
                onChange={(amount) =>
                  put({
                    employer_levies: set.employer_levies.map((l, j) => (j === i ? { ...l, amount } : l)),
                  })
                }
              />
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={`${uid}-notes`} className="block text-sm font-semibold text-text">
            Notes for reviewers
          </label>
          <textarea
            id={`${uid}-notes`}
            rows={2}
            maxLength={600}
            value={set.notes ?? ""}
            disabled={disabled}
            onChange={(e) => put({ notes: e.target.value || null })}
            className={cn(inputClass, "py-2")}
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-text">Sources</p>
          <ul className="mt-1 space-y-1 text-sm">
            {set.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-strong underline"
                >
                  {source.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        {canRemove && (
          <ActionButton ready={!disabled} variant="ghost" onClick={onRemove}>
            Remove these rules
          </ActionButton>
        )}
      </div>
    </details>
  );
}

/** Websites → ZiraHR → Payroll Calculator (P14-C). */
export function PayrollStudio({ slug, data }: { slug: string; data: PayrollAdmin }) {
  const router = useRouter();
  const uid = useId();
  const [config, setConfig] = useState(data.draft);
  const [version, setVersion] = useState(data.draft_version);
  const [source, setSource] = useState<"draft" | "published">("draft");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [note, setNote] = useState("");
  const { dirty, markSaved } = useSavedBaseline(config);
  useUnsavedChangesWarning(data.can_edit && dirty);
  const disabled = !data.can_edit || busy !== null;
  const unverified = config.rule_sets.some((s) => !s.verified_on);
  const changed = !sameValue(config, data.published);
  const canApprove = data.review !== null && data.can_review && (!data.review.mine || data.is_owner);

  async function run(name: string, action: () => Promise<string | void>) {
    setBusy(name);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ tone: "ok", text });
      router.refresh();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", async () => {
      const saved = await adminFetch<{ draft_version: number }>(`sites/${slug}/payroll-calculator/draft`, {
        config,
        version,
      });
      setVersion(saved.draft_version);
      markSaved();
      return "Draft saved. Try it below; visitors still see the published version.";
    });
  const post = (action: string, body: object, done: string) =>
    run(action, async () => {
      await adminFetch(`sites/${slug}/payroll-calculator/${action}`, body);
      return done;
    });

  const calculate = useCallback(
    async (input: PayrollInput, signal: AbortSignal): Promise<PayrollResult> => {
      try {
        const answer = await adminFetch<{ result: PayrollResult }>(
          `sites/${slug}/payroll-calculator/calculate`,
          {
            source,
            input,
          },
        );
        if (signal.aborted) throw new PayrollError("Cancelled");
        return answer.result;
      } catch (err) {
        if (err instanceof AdminError) {
          const field = err.fields[0];
          throw new PayrollError(
            field?.message ?? err.message,
            field?.field === "amount" || field?.field === "pay_month" ? field.field : undefined,
          );
        }
        throw err;
      }
    },
    [slug, source],
  );

  const setRule = (i: number, next: RuleSet) =>
    setConfig((c) => ({ ...c, rule_sets: c.rule_sets.map((s, j) => (j === i ? next : s)) }));
  const addRules = () =>
    setConfig((c) => {
      const latest = [...c.rule_sets].sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]!;
      const year = Number(latest.effective_from.slice(0, 4)) + 1;
      return {
        ...c,
        // A copy of the latest, to change: it always needs its own check.
        rule_sets: [
          { ...latest, label: "New rules", effective_from: `${year}-01-01`, verified_on: null, notes: null },
          ...c.rule_sets,
        ],
      };
    });

  return (
    <div className="mt-8 max-w-5xl space-y-6">
      <section className="fb-panel flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-panel)] p-5 sm:p-6">
        <div className="max-w-2xl">
          <p id={`${uid}-public`} className="font-semibold text-text">
            Show on the website
          </p>
          <p className="mt-1 text-sm text-muted">
            {data.public_visible
              ? `On: visitors can use version ${data.published_number} at /payroll-calculator.`
              : data.published
                ? "Off: visitors can't reach the calculator. The published version is ready when you are."
                : "Off. Publish a version first, once the rules have been checked."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={data.public_visible}
          aria-labelledby={`${uid}-public`}
          disabled={!data.can_review || !data.published || busy !== null}
          onClick={() =>
            post(
              "visibility",
              { public: !data.public_visible },
              data.public_visible ? "The calculator is off." : "The calculator is on the website.",
            )
          }
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
            data.public_visible ? "border-accent bg-accent" : "border-line-strong bg-surface-3",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none",
              data.public_visible ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1",
            )}
          />
        </button>
      </section>

      <section className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-text">Statutory rules by period</h2>
          <ActionButton ready={data.can_edit} variant="secondary" onClick={addRules}>
            Add a new period
          </ActionButton>
        </div>
        <p className="mt-1 text-sm text-muted">
          Each pay month uses the latest rules that have started by then. Check every value against current
          KRA, NSSF, SHA and Housing Levy guidance, then record the date: nothing can be published until you
          do.
        </p>
        <div className="mt-4 space-y-3">
          {config.rule_sets.map((set, i) => (
            <RuleSetEditor
              key={i}
              set={set}
              disabled={disabled}
              canRemove={config.rule_sets.length > 1}
              onChange={(next) => setRule(i, next)}
              onRemove={() => setConfig((c) => ({ ...c, rule_sets: c.rule_sets.filter((_, j) => j !== i) }))}
            />
          ))}
        </div>
      </section>

      <section className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6">
        <h2 className="font-semibold text-text">Page text</h2>
        <div className="mt-3 grid gap-3">
          <div>
            <label htmlFor={`${uid}-intro`} className="block text-xs font-medium text-muted">
              Introduction
            </label>
            <textarea
              id={`${uid}-intro`}
              rows={2}
              maxLength={600}
              value={config.intro}
              disabled={disabled}
              onChange={(e) => setConfig((c) => ({ ...c, intro: e.target.value }))}
              className={cn(inputClass, "py-2")}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-disclaimer`} className="block text-xs font-medium text-muted">
              Estimate notice (always shown)
            </label>
            <textarea
              id={`${uid}-disclaimer`}
              rows={2}
              maxLength={600}
              value={config.disclaimer}
              disabled={disabled}
              onChange={(e) => setConfig((c) => ({ ...c, disclaimer: e.target.value }))}
              className={cn(inputClass, "py-2")}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Number2
              label="Opens with gross pay"
              suffix="KES"
              value={config.example_gross}
              disabled={disabled}
              onChange={(example_gross) => setConfig((c) => ({ ...c, example_gross }))}
            />
            <Number2
              label="Opens with net pay"
              suffix="KES"
              value={config.example_net}
              disabled={disabled}
              onChange={(example_net) => setConfig((c) => ({ ...c, example_net }))}
            />
          </div>
        </div>
      </section>

      <section className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6">
        <h2 className="font-semibold text-text">Publishing</h2>
        {data.review && (
          <p className="mt-2 rounded-xl bg-surface-2 p-3 text-sm text-text">
            {data.review.mine ? "You asked for approval" : "Approval requested"} on{" "}
            <LocalTime iso={data.review.requested_at} />
            {data.review.note && `: ${data.review.note}`}
          </p>
        )}
        {data.can_edit && (
          <div className="mt-3">
            <label htmlFor={`${uid}-note`} className="block text-xs font-medium text-muted">
              Note for the reviewer (optional)
            </label>
            <input
              id={`${uid}-note`}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
            />
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {data.can_edit && (
            <ActionButton
              ready={dirty}
              busy={busy === "save"}
              variant="secondary"
              hint="Nothing to save"
              onClick={save}
            >
              Save draft
            </ActionButton>
          )}
          {data.can_edit && (
            <ActionButton
              ready={!dirty && !unverified && changed && !data.review}
              busy={busy === "submit"}
              hint={
                dirty
                  ? "Save first"
                  : unverified
                    ? "Record when the rules were checked"
                    : data.review
                      ? "Waiting for approval"
                      : !changed
                        ? "Already published"
                        : undefined
              }
              onClick={() => post("submit", { note }, "Sent for approval.")}
            >
              Ask for approval
            </ActionButton>
          )}
          {data.can_review && data.review && (
            <>
              <ActionButton
                ready={canApprove}
                busy={busy === "publish"}
                hint={canApprove ? undefined : "Someone else needs to approve"}
                onClick={() => post("publish", { note }, "Published.")}
              >
                Approve and publish
              </ActionButton>
              <ActionButton
                ready
                busy={busy === "reject"}
                variant="ghost"
                onClick={() => post("reject", { note }, "Sent back.")}
              >
                Decline
              </ActionButton>
            </>
          )}
        </div>
        {message && (
          <p
            role={message.tone === "ok" ? "status" : "alert"}
            className={cn("mt-3 text-sm", message.tone === "ok" ? "text-success" : "text-danger")}
          >
            {message.text}
          </p>
        )}
        {data.versions.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-semibold text-text">Version history</h3>
            <ol className="mt-1 divide-y divide-line">
              {data.versions.map((v) => (
                <li key={v.number} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <p className="text-sm text-text">
                    {`Version ${v.number}`}
                    {v.number === data.published_number && (
                      <span className="ms-2 text-xs text-accent-strong">Published</span>
                    )}
                    <span className="mt-0.5 block text-xs text-subtle">
                      {`${v.note ?? ""} · ${v.published_by ?? "someone"} · `}
                      <LocalTime iso={v.created_at} />
                    </span>
                  </p>
                  {data.can_review && v.number !== data.published_number && (
                    <ActionButton
                      ready
                      variant="secondary"
                      busy={busy === "rollback"}
                      onClick={() => {
                        if (window.confirm(`Make version ${v.number} live again?`))
                          void post("rollback", { version: v.number }, `Rolled back to version ${v.number}.`);
                      }}
                    >
                      Roll back to this
                    </ActionButton>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section aria-labelledby={`${uid}-try`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${uid}-try`} className="font-semibold text-text">
            Try it
          </h2>
          <div
            role="radiogroup"
            aria-label="Rules to try"
            className="inline-flex gap-1 rounded-full border border-line bg-surface-2 p-1"
          >
            {(["draft", "published"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={source === value}
                disabled={value === "published" && !data.published}
                onClick={() => setSource(value)}
                className={cn(
                  "min-h-9 rounded-full px-3 text-sm capitalize disabled:opacity-50",
                  source === value ? "bg-surface font-medium text-text shadow-sm" : "text-muted",
                )}
              >
                {value === "draft" ? "Saved draft" : "Published"}
              </button>
            ))}
          </div>
        </div>
        {dirty && source === "draft" && (
          <p className="mt-2 text-sm text-warning">
            You have unsaved changes: this uses the last saved draft.
          </p>
        )}
        <div className="mt-4">
          <PayrollCalculator
            key={source}
            calculate={calculate}
            exampleGross={data.draft.example_gross}
            exampleNet={data.draft.example_net}
            disclaimer={config.disclaimer}
          />
        </div>
      </section>
    </div>
  );
}
