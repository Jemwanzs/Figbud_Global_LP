"use client";

import { cn } from "@figbud/ui";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, type FieldError, adminFetch } from "@/lib/admin-client";
import { useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { LocalTime } from "./local-time";

type Category = "necessary" | "analytics" | "preferences" | "marketing";
type Provider = "plausible" | "google_analytics" | "meta_pixel" | "linkedin_insight";

export interface PrivacyConfig {
  banner: { title: string; body: string };
  categories: Record<Category, { label: string; description: string }>;
  retention_days: number;
  record_months: number;
  privacy_url: string;
  cookie_url: string;
  integrations: { provider: Provider; tracking_id: string; enabled: boolean }[];
  policy_version: number;
}

export interface PrivacyAdmin {
  config: PrivacyConfig;
  version: number;
  updated_at: string | null;
  updated_by: string | null;
  can_edit: boolean;
  report: {
    days: number;
    choices: { total: number; accept_all: number; reject_optional: number; custom: number };
    visitors: number;
    allowed: Record<Exclude<Category, "necessary">, number>;
  };
}

const PROVIDERS: { value: Provider; label: string; category: "analytics" | "marketing"; hint: string }[] = [
  {
    value: "plausible",
    label: "Plausible Analytics",
    category: "analytics",
    hint: "The site's domain, e.g. figbudglobal.com",
  },
  {
    value: "google_analytics",
    label: "Google Analytics 4",
    category: "analytics",
    hint: "Measurement ID, e.g. G-XXXXXXXXXX",
  },
  { value: "meta_pixel", label: "Meta Pixel", category: "marketing", hint: "Pixel ID (digits)" },
  {
    value: "linkedin_insight",
    label: "LinkedIn Insight Tag",
    category: "marketing",
    hint: "Partner ID (digits)",
  },
];

const CATEGORY_NAMES: Record<Category, string> = {
  necessary: "Strictly necessary",
  analytics: "Analytics",
  preferences: "Preferences",
  marketing: "Marketing",
};

/** One row per supported provider; rows without an ID aren't saved. */
type Row = { tracking_id: string; enabled: boolean };
interface Form extends Omit<PrivacyConfig, "integrations" | "policy_version"> {
  integrations: Record<Provider, Row>;
  ask_again: boolean;
}

const toForm = (c: PrivacyConfig): Form => ({
  ...c,
  integrations: Object.fromEntries(
    PROVIDERS.map((p) => {
      const saved = c.integrations.find((i) => i.provider === p.value);
      return [p.value, { tracking_id: saved?.tracking_id ?? "", enabled: saved?.enabled ?? false }];
    }),
  ) as Record<Provider, Row>,
  ask_again: false,
});

const percent = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–");

/**
 * Admin Studio → Settings → Privacy & Cookies. Owners edit; everyone signed
 * in can read the settings and the anonymous consent report. Saving takes
 * effect on the websites within minutes; turning on a new provider asks every
 * visitor to choose again.
 */
export function PrivacySettings({ data }: { data: PrivacyAdmin }) {
  const router = useRouter();
  const uid = useId();
  const canEdit = data.can_edit;
  const [form, setForm] = useState<Form>(() => toForm(data.config));
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(canEdit && dirty);
  const errorFor = (field: string) => fields.find((f) => f.field === field)?.message;
  const newProvider = PROVIDERS.some(
    (p) =>
      form.integrations[p.value].enabled &&
      !data.config.integrations.some((i) => i.provider === p.value && i.enabled),
  );

  async function save() {
    setBusy(true);
    setFields([]);
    setMessage(null);
    const { ask_again, integrations, ...rest } = form;
    const config = {
      ...rest,
      policy_version: data.config.policy_version,
      integrations: PROVIDERS.filter((p) => integrations[p.value].tracking_id.trim()).map((p) => ({
        provider: p.value,
        tracking_id: integrations[p.value].tracking_id,
        enabled: integrations[p.value].enabled,
      })),
    };
    try {
      await adminFetch<PrivacyAdmin>("privacy", { config, version: data.version, ask_again });
      markSaved();
      setMessage({ tone: "ok", text: "Saved. The websites pick up the change within a few minutes." });
      router.refresh();
    } catch (err) {
      if (err instanceof AdminError) {
        setFields(err.fields);
        setMessage({
          tone: "error",
          text: err.status === 422 ? "Some settings need attention." : err.message,
        });
      } else {
        setMessage({ tone: "error", text: "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-text disabled:opacity-60";
  const control = (
    id: string,
    label: string,
    field: string,
    input: (props: {
      id: string;
      disabled: boolean;
      className: string;
      "aria-invalid"?: true;
      "aria-describedby"?: string;
    }) => React.ReactNode,
    hint?: string,
  ) => {
    const error = errorFor(field);
    return (
      <div>
        <label htmlFor={`${uid}-${id}`} className="block text-sm font-medium text-text">
          {label}
        </label>
        {input({
          id: `${uid}-${id}`,
          disabled: !canEdit || busy,
          className: inputClass,
          ...(error ? { "aria-invalid": true as const, "aria-describedby": `${uid}-${id}-error` } : {}),
        })}
        {error ? (
          <p id={`${uid}-${id}-error`} className="mt-1.5 text-sm text-danger">
            {error}
          </p>
        ) : (
          hint && <p className="mt-1.5 text-sm text-subtle">{hint}</p>
        )}
      </div>
    );
  };
  const { report } = data;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (canEdit && dirty) save();
        }}
        className="space-y-10"
      >
        {!canEdit && (
          <p className="rounded-xl border border-line bg-surface-2 p-4 text-sm text-muted">
            Only owners can change privacy and cookie settings, because they decide what tracking may run.
          </p>
        )}

        <fieldset className="space-y-6">
          <legend className="font-semibold text-text">Banner</legend>
          {control("title", "Heading", "banner.title", (p) => (
            <input
              {...p}
              maxLength={80}
              value={form.banner.title}
              onChange={(e) => setForm((f) => ({ ...f, banner: { ...f.banner, title: e.target.value } }))}
            />
          ))}
          {control(
            "body",
            "Message",
            "banner.body",
            (p) => (
              <textarea
                {...p}
                rows={3}
                maxLength={400}
                className={cn(p.className, "py-3")}
                value={form.banner.body}
                onChange={(e) => setForm((f) => ({ ...f, banner: { ...f.banner, body: e.target.value } }))}
              />
            ),
            `${form.banner.body.length}/400 · Plain text. English pages show this; other languages show their translation.`,
          )}
        </fieldset>

        <fieldset className="space-y-6">
          <legend className="font-semibold text-text">Cookie categories</legend>
          <p className="text-sm text-muted">
            Strictly necessary cookies are always on. The optional categories are off until a visitor allows
            them.
          </p>
          {(Object.keys(CATEGORY_NAMES) as Category[]).map((category) => (
            <div key={category} className="space-y-4 rounded-2xl border border-line p-5">
              <p className="text-sm font-medium text-subtle">{CATEGORY_NAMES[category]}</p>
              {control(`${category}-label`, "Name", `categories.${category}.label`, (p) => (
                <input
                  {...p}
                  maxLength={40}
                  value={form.categories[category].label}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      categories: {
                        ...f.categories,
                        [category]: { ...f.categories[category], label: e.target.value },
                      },
                    }))
                  }
                />
              ))}
              {control(
                `${category}-description`,
                "Description",
                `categories.${category}.description`,
                (p) => (
                  <textarea
                    {...p}
                    rows={2}
                    maxLength={300}
                    className={cn(p.className, "py-3")}
                    value={form.categories[category].description}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        categories: {
                          ...f.categories,
                          [category]: { ...f.categories[category], description: e.target.value },
                        },
                      }))
                    }
                  />
                ),
              )}
            </div>
          ))}
        </fieldset>

        <fieldset className="grid gap-6 sm:grid-cols-2">
          <legend className="mb-6 font-semibold text-text">Retention and policies</legend>
          {control(
            "retention",
            "Remember a visitor's choice for (days)",
            "retention_days",
            (p) => (
              <input
                {...p}
                type="number"
                min={30}
                max={395}
                value={form.retention_days}
                onChange={(e) => setForm((f) => ({ ...f, retention_days: Number(e.target.value) }))}
              />
            ),
            "30 to 395 days. Visitors are asked again afterwards.",
          )}
          {control(
            "records",
            "Keep consent records for (months)",
            "record_months",
            (p) => (
              <input
                {...p}
                type="number"
                min={6}
                max={60}
                value={form.record_months}
                onChange={(e) => setForm((f) => ({ ...f, record_months: Number(e.target.value) }))}
              />
            ),
            "6 to 60 months, then deleted automatically.",
          )}
          {control(
            "privacy-url",
            "Privacy Policy link",
            "privacy_url",
            (p) => (
              <input
                {...p}
                className={cn(p.className, "font-mono text-sm")}
                value={form.privacy_url}
                onChange={(e) => setForm((f) => ({ ...f, privacy_url: e.target.value }))}
              />
            ),
            "A path such as /legal/privacy, or an https:// address.",
          )}
          {control("cookie-url", "Cookie Policy link", "cookie_url", (p) => (
            <input
              {...p}
              className={cn(p.className, "font-mono text-sm")}
              value={form.cookie_url}
              onChange={(e) => setForm((f) => ({ ...f, cookie_url: e.target.value }))}
            />
          ))}
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="font-semibold text-text">Analytics and marketing integrations</legend>
          <p className="text-sm text-muted">
            Supported providers only, configured by ID; no scripts can be pasted. An enabled integration loads
            only for visitors who allow its category, and stops when they withdraw.
          </p>
          {errorFor("integrations.tracking_id") && (
            <p className="text-sm text-danger">{errorFor("integrations.tracking_id")}</p>
          )}
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {PROVIDERS.map((p) => {
              const row = form.integrations[p.value];
              const setRow = (next: Partial<Row>) =>
                setForm((f) => ({
                  ...f,
                  integrations: { ...f.integrations, [p.value]: { ...row, ...next } },
                }));
              const id = `${uid}-${p.value}`;
              return (
                <li key={p.value} className="grid gap-3 p-4 sm:grid-cols-[1fr_14rem_auto] sm:items-center">
                  <div>
                    <p id={`${id}-name`} className="font-medium text-text">
                      {p.label}
                    </p>
                    <p className="text-xs text-subtle">Needs consent to: {CATEGORY_NAMES[p.category]}</p>
                  </div>
                  <div>
                    <label htmlFor={`${id}-id`} className="sr-only">
                      {p.label} ID
                    </label>
                    <input
                      id={`${id}-id`}
                      value={row.tracking_id}
                      disabled={!canEdit || busy}
                      placeholder={p.hint}
                      onChange={(e) =>
                        setRow({ tracking_id: e.target.value, enabled: e.target.value ? row.enabled : false })
                      }
                      className={cn(inputClass, "mt-0 font-mono text-sm")}
                    />
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.enabled}
                    aria-labelledby={`${id}-name`}
                    disabled={!canEdit || busy || !row.tracking_id.trim()}
                    onClick={() => setRow({ enabled: !row.enabled })}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 justify-self-start rounded-full border px-3 text-sm transition-colors disabled:opacity-50",
                      row.enabled ? "border-accent bg-accent-soft text-text" : "border-line text-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("size-2 rounded-full", row.enabled ? "bg-accent" : "bg-surface-3")}
                    />
                    {row.enabled ? "Enabled" : "Disabled"}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold text-text">Visitors’ choices</legend>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={form.ask_again || newProvider}
              disabled={!canEdit || busy || newProvider}
              onChange={(e) => setForm((f) => ({ ...f, ask_again: e.target.checked }))}
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
            />
            <span>
              Ask every visitor to choose again when saved
              <span className="mt-0.5 block text-subtle">
                {newProvider
                  ? "Required: a newly enabled provider isn't covered by earlier choices."
                  : `Use this after changing what the optional categories cover. Policy version ${data.config.policy_version}.`}
              </span>
            </span>
          </label>
        </fieldset>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-4">
            <ActionButton type="submit" ready={dirty} busy={busy} hint="Nothing to save">
              Save settings
            </ActionButton>
            {message && (
              <p
                role="status"
                className={cn("text-sm", message.tone === "ok" ? "text-success" : "text-danger")}
              >
                {message.text}
              </p>
            )}
          </div>
        )}
      </form>

      <aside
        aria-labelledby={`${uid}-report`}
        className="h-fit space-y-5 rounded-2xl border border-line bg-surface p-6"
      >
        <div>
          <h2 id={`${uid}-report`} className="font-semibold text-text">
            Consent in the last {report.days} days
          </h2>
          <p className="mt-1 text-sm text-subtle">
            Anonymous: a random ID per browser, the choice and the policy version. No names, emails or IP
            addresses.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-subtle">Choices made</dt>
            <dd className="mt-1 text-2xl font-semibold text-text">{report.choices.total}</dd>
          </div>
          <div>
            <dt className="text-subtle">Browsers</dt>
            <dd className="mt-1 text-2xl font-semibold text-text">{report.visitors}</dd>
          </div>
          <div>
            <dt className="text-subtle">Accepted all</dt>
            <dd className="mt-1 text-text">{report.choices.accept_all}</dd>
          </div>
          <div>
            <dt className="text-subtle">Rejected optional</dt>
            <dd className="mt-1 text-text">{report.choices.reject_optional}</dd>
          </div>
          <div>
            <dt className="text-subtle">Customized</dt>
            <dd className="mt-1 text-text">{report.choices.custom}</dd>
          </div>
        </dl>
        <div>
          <p className="text-sm font-medium text-text">Allowed, by latest choice</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {(["analytics", "preferences", "marketing"] as const).map((c) => (
              <li key={c} className="flex justify-between gap-4">
                <span className="text-muted">{CATEGORY_NAMES[c]}</span>
                <span className="text-text tabular-nums">{percent(report.allowed[c], report.visitors)}</span>
              </li>
            ))}
          </ul>
        </div>
        {data.updated_at && (
          <p className="border-t border-line pt-4 text-xs text-subtle">
            Last changed <LocalTime iso={data.updated_at} />
            {data.updated_by ? ` by ${data.updated_by}` : ""}
          </p>
        )}
      </aside>
    </div>
  );
}
