"use client";

import { CountrySelect, type CountryCode, countries } from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";

export interface SeoSettings {
  title_template: string | null;
  default_description: string | null;
  google_verification: string | null;
  bing_verification: string | null;
  same_as: string[];
  markets: string[];
  languages: string[];
  focus_keywords: string[];
  indexing: boolean;
}

export interface SeoIssue {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
}

export interface SeoSummary {
  pages: number;
  indexable: number;
  errors: number;
  warnings: number;
  infos: number;
}

export interface SeoIntegrations {
  search_console: { verification_tag: boolean; data: string };
  bing: { verification_tag: boolean; data: string };
  analytics: string[];
  core_web_vitals: string;
}

export interface SeoReport {
  site: { slug: string; name: string; primary_domain: string | null };
  settings: SeoSettings;
  version: number;
  can_edit: boolean;
  summary: SeoSummary;
  site_issues: SeoIssue[];
  pages: {
    id: string;
    title: string;
    path: string;
    search_title: string;
    indexable: boolean;
    issues: SeoIssue[];
  }[];
  integrations: SeoIntegrations;
}

const LANGUAGES: Record<string, string> = {
  en: "English",
  sw: "Kiswahili",
  fr: "Français",
  ar: "العربية",
  zh: "中文",
};

const SEVERITY = {
  error: { icon: CircleAlert, tone: "text-danger", label: "Fix" },
  warning: { icon: TriangleAlert, tone: "text-warning", label: "Improve" },
  info: { icon: Info, tone: "text-muted", label: "Note" },
} as const;

const inputClass =
  "mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text disabled:opacity-60";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-text">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-subtle">{hint}</span>}
    </label>
  );
}

function Issues({ issues }: { issues: SeoIssue[] }) {
  if (!issues.length)
    return (
      <p className="flex items-center gap-1.5 text-sm text-success">
        <CircleCheck aria-hidden className="size-4" /> No issues found
      </p>
    );
  return (
    <ul className="space-y-1.5">
      {issues.map((issue, i) => {
        const s = SEVERITY[issue.severity];
        return (
          <li key={i} className="flex items-start gap-2 text-sm text-text">
            <s.icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", s.tone)} />
            <span>
              <span className="sr-only">{s.label}: </span>
              {issue.message}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Websites → a website → SEO & search visibility (P9-S1). */
export function SeoWorkspace({ report, locale = "en" }: { report: SeoReport; locale?: string }) {
  const router = useRouter();
  const uid = useId();
  const [settings, setSettings] = useState<SeoSettings>(report.settings);
  const { dirty, markSaved } = useSavedBaseline(settings, report.settings);
  const [version, setVersion] = useState(report.version);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [market, setMarket] = useState<CountryCode | "">("");
  useUnsavedChangesWarning(dirty);
  const editable = report.can_edit;
  const set = (patch: Partial<SeoSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const names = Object.fromEntries(countries(locale).map((c) => [c.code, `${c.flag} ${c.name}`]));
  const example = report.pages[0]?.title ?? "Payroll software";
  const preview = settings.title_template?.includes("%s")
    ? settings.title_template.replace("%s", example)
    : example;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await adminFetch<{ settings: SeoSettings; version: number }>(
        `sites/${report.site.slug}/seo`,
        {
          settings,
          version,
        },
      );
      setSettings(saved.settings);
      markSaved(saved.settings);
      setVersion(saved.version);
      setMessage({ tone: "ok", text: "SEO settings saved. Websites pick them up within minutes." });
      router.refresh();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  }

  const s = report.summary;
  const i = report.integrations;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section
          aria-labelledby={`${uid}-health`}
          className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6"
        >
          <h2 id={`${uid}-health`} className="font-semibold text-text">
            Health check
          </h2>
          <p className="mt-1 text-sm text-muted">
            Checked from the published pages now: metadata, headings, internal links and indexing rules.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Live pages", s.pages],
                ["In search", s.indexable],
                ["To fix", s.errors],
                ["To improve", s.warnings],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line p-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold text-text tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {report.site_issues.length > 0 && (
            <div className="mt-4">
              <Issues issues={report.site_issues} />
            </div>
          )}
        </section>

        <section
          aria-labelledby={`${uid}-pages`}
          className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6"
        >
          <h2 id={`${uid}-pages`} className="font-semibold text-text">
            Pages
          </h2>
          {report.pages.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No published pages yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line" aria-label="Page checks">
              {report.pages.map((page) => (
                <li key={page.id} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/admin/sites/${report.site.slug}/pages/${page.id}`}
                      className="font-medium text-text hover:text-accent"
                    >
                      {page.title}
                    </Link>
                    <span className="font-mono text-xs text-subtle">{page.path}</span>
                  </div>
                  <p className="mt-1 text-sm text-[#8ab4f8] [[data-theme=light]_&]:text-[#1a0dab]">
                    {page.search_title}
                  </p>
                  <div className="mt-2">
                    <Issues issues={page.issues} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="space-y-6">
        <section
          aria-labelledby={`${uid}-identity`}
          className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6"
        >
          <h2 id={`${uid}-identity`} className="font-semibold text-text">
            Search identity
          </h2>
          <p className="mt-1 text-sm text-muted">
            Applies to {report.site.name} only
            {report.site.primary_domain ? ` (${report.site.primary_domain})` : ""}.
            {editable ? "" : " Reviewers and owners can change it."}
          </p>
          <div className="mt-4 space-y-4">
            <label className="flex min-h-11 items-start gap-3 text-sm text-text">
              <input
                type="checkbox"
                checked={settings.indexing}
                disabled={!editable}
                onChange={(e) => set({ indexing: e.target.checked })}
                className="mt-0.5 size-5 accent-[var(--color-accent)]"
              />
              <span>
                Allow search engines to index this website
                <span className="mt-0.5 block text-subtle">
                  Switch off while a website is being prepared: every page asks not to be indexed and the
                  sitemap is empty.
                </span>
              </span>
            </label>
            <Field label="Search title template" hint={`Use %s for the page title. Preview: “${preview}”`}>
              <input
                value={settings.title_template ?? ""}
                maxLength={70}
                disabled={!editable}
                placeholder={`%s · ${report.site.name}`}
                onChange={(e) => set({ title_template: e.target.value || null })}
                className={inputClass}
              />
            </Field>
            <Field
              label="Default search description"
              hint={`${(settings.default_description ?? "").length}/170 · used by pages without their own`}
            >
              <textarea
                value={settings.default_description ?? ""}
                maxLength={170}
                rows={2}
                disabled={!editable}
                onChange={(e) => set({ default_description: e.target.value || null })}
                className={cn(inputClass, "py-2")}
              />
            </Field>
            <fieldset>
              <legend className="text-sm font-medium text-text">Languages</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(LANGUAGES).map(([code, name]) => {
                  const on = settings.languages.includes(code);
                  return (
                    <label
                      key={code}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm",
                        on ? "border-accent bg-accent-soft/60 text-text" : "border-line text-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!editable}
                        onChange={(e) =>
                          set({
                            languages: e.target.checked
                              ? [...settings.languages, code]
                              : settings.languages.filter((l) => l !== code),
                          })
                        }
                        className="size-4 accent-[var(--color-accent)]"
                      />
                      {name}
                    </label>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-subtle">
                Languages still awaiting review stay out of search engines.
              </p>
            </fieldset>
            <div>
              <p className="text-sm font-medium text-text">Target markets</p>
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Target markets">
                {settings.markets.map((code) => (
                  <li
                    key={code}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm text-text"
                  >
                    <span className="fb-flag">{names[code]?.split(" ")[0]}</span>
                    {names[code]?.split(" ").slice(1).join(" ") ?? code}
                    {editable && (
                      <button
                        type="button"
                        onClick={() => set({ markets: settings.markets.filter((m) => m !== code) })}
                        className="inline-flex size-6 items-center justify-center rounded-full hover:bg-surface-2"
                      >
                        <X aria-hidden className="size-3.5" />
                        <span className="sr-only">Remove {code}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {editable && (
                <div className="mt-2 max-w-sm">
                  <CountrySelect
                    id={`${uid}-market`}
                    value={market}
                    locale={locale}
                    labels={{
                      placeholder: "Add a market",
                      search: "Search countries",
                      none: "No countries match",
                      suggested: "Suggested",
                      all: "All countries",
                    }}
                    onChange={(code) => {
                      setMarket("");
                      if (!settings.markets.includes(code)) set({ markets: [...settings.markets, code] });
                    }}
                  />
                </div>
              )}
            </div>
            <Field
              label="Focus search phrases (internal)"
              hint="One per line. Guidance for editors; never published as meta keywords."
            >
              <textarea
                value={settings.focus_keywords.join("\n")}
                rows={3}
                disabled={!editable}
                onChange={(e) => set({ focus_keywords: e.target.value.split("\n") })}
                className={cn(inputClass, "py-2")}
              />
            </Field>
            <Field
              label="Official profiles"
              hint="Verified https:// addresses, one per line (LinkedIn, X…), used in structured data."
            >
              <textarea
                value={settings.same_as.join("\n")}
                rows={2}
                disabled={!editable}
                onChange={(e) => set({ same_as: e.target.value.split("\n") })}
                className={cn(inputClass, "py-2 font-mono")}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Google Search Console token"
                hint="Only the content value of the HTML-tag verification."
              >
                <input
                  value={settings.google_verification ?? ""}
                  disabled={!editable}
                  onChange={(e) => set({ google_verification: e.target.value || null })}
                  className={cn(inputClass, "font-mono")}
                />
              </Field>
              <Field label="Bing Webmaster token">
                <input
                  value={settings.bing_verification ?? ""}
                  disabled={!editable}
                  onChange={(e) => set({ bing_verification: e.target.value || null })}
                  className={cn(inputClass, "font-mono")}
                />
              </Field>
            </div>
            {editable && (
              <ActionButton ready={dirty} busy={busy} hint="No changes to save" onClick={save}>
                Save SEO settings
              </ActionButton>
            )}
            {message && (
              <p
                role={message.tone === "error" ? "alert" : "status"}
                className={cn("text-sm", message.tone === "error" ? "text-danger" : "text-success")}
              >
                {message.text}
              </p>
            )}
          </div>
        </section>

        <section
          aria-labelledby={`${uid}-data`}
          className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6"
        >
          <h2 id={`${uid}-data`} className="font-semibold text-text">
            Search data
          </h2>
          <dl className="mt-3 divide-y divide-line text-sm">
            {(
              [
                [
                  "Google Search Console",
                  i.search_console.verification_tag ? "Verification tag published" : "No verification tag",
                  "Indexing, queries, impressions and clicks: not connected (needs Google API access, Q21).",
                ],
                [
                  "Bing Webmaster Tools",
                  i.bing.verification_tag ? "Verification tag published" : "No verification tag",
                  "Data: not connected.",
                ],
                [
                  "Analytics",
                  i.analytics.length
                    ? i.analytics
                        .map((a) => (a === "google_analytics" ? "Google Analytics 4" : "Plausible"))
                        .join(", ")
                    : "None enabled",
                  "Loads only with visitors' consent (Settings → Privacy & Cookies).",
                ],
                [
                  "Core Web Vitals",
                  "Lighthouse in CI",
                  "Every push is measured on a mobile profile; field data needs Search Console.",
                ],
              ] as const
            ).map(([name, status, note]) => (
              <div key={name} className="py-3">
                <dt className="font-medium text-text">{name}</dt>
                <dd className="mt-0.5 text-muted">
                  {status}
                  <span className="block text-xs text-subtle">{note}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-subtle">
            Nothing here is estimated: data appears only from connected, verified services.
          </p>
        </section>
      </div>
    </div>
  );
}
