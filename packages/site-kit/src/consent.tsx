"use client";

import { buttonClasses, cn } from "@figbud/ui";
import { Cookie, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import {
  CONSENT_CATEGORIES,
  type ConsentCategory,
  type IntegrationProvider,
  type PrivacySettings,
} from "./privacy";

/**
 * Cookie consent (P7-PC1). Until a visitor chooses, only strictly necessary
 * storage is used and no integration loads. The choice lives in a
 * first-party cookie for the configured number of days; a newer policy
 * version, or a choice older than the retention period, asks again.
 */

export const CONSENT_COOKIE = "fb_consent";
/** Fired by "Cookie settings" links to reopen the preferences. */
export const OPEN_CONSENT_EVENT = "fb:cookie-settings";

export type Choices = Record<ConsentCategory, boolean>;
export interface Consent {
  version: number;
  id: string;
  choices: Choices;
  /** When it was saved (seconds since the epoch). */
  savedAt: number;
}

export interface ConsentLabels {
  region: string;
  acceptAll: string;
  rejectOptional: string;
  customize: string;
  save: string;
  preferencesTitle: string;
  preferencesIntro: string;
  alwaysOn: string;
  privacyPolicy: string;
  cookiePolicy: string;
  close: string;
}

export const ENGLISH_CONSENT_LABELS: ConsentLabels = {
  region: "Cookie consent",
  acceptAll: "Accept all",
  rejectOptional: "Reject optional",
  customize: "Customize",
  save: "Save choices",
  preferencesTitle: "Cookie preferences",
  preferencesIntro:
    "Choose which optional cookies we may use. You can change your mind at any time from “Cookie settings” at the bottom of every page.",
  alwaysOn: "Always on",
  privacyPolicy: "Privacy Policy",
  cookiePolicy: "Cookie Policy",
  close: "Close",
};

const NONE: Choices = { analytics: false, preferences: false, marketing: false };
const ALL: Choices = { analytics: true, preferences: true, marketing: true };

/** `version|id|apm|savedAt`, e.g. `2|<uuid>|100|1767225600`. */
export function parseConsent(raw: string | undefined): Consent | null {
  const parts = raw ? decodeURIComponent(raw).split("|") : [];
  if (parts.length !== 4) return null;
  const [version, id, flags, savedAt] = parts as [string, string, string, string];
  if (
    !/^\d{1,6}$/.test(version) ||
    !/^[0-9a-f-]{36}$/.test(id) ||
    !/^[01]{3}$/.test(flags) ||
    !/^\d{1,12}$/.test(savedAt)
  )
    return null;
  return {
    version: Number(version),
    id,
    choices: { analytics: flags[0] === "1", preferences: flags[1] === "1", marketing: flags[2] === "1" },
    savedAt: Number(savedAt),
  };
}

export function serialiseConsent(c: Consent): string {
  const flag = (b: boolean) => (b ? "1" : "0");
  return [
    c.version,
    c.id,
    flag(c.choices.analytics) + flag(c.choices.preferences) + flag(c.choices.marketing),
    c.savedAt,
  ].join("|");
}

/** Whether a stored choice still holds for these settings. */
export function consentCurrent(
  c: Consent | null,
  settings: PrivacySettings,
  now = Date.now() / 1000,
): c is Consent {
  return !!c && c.version === settings.policy_version && now - c.savedAt < settings.retention_days * 86_400;
}

// ---------------------------------------------------------------- store

const listeners = new Set<() => void>();
let snapshot: { raw: string | undefined } | null = null;

function readCookie(): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
}

function getSnapshot() {
  const raw = readCookie();
  if (!snapshot || snapshot.raw !== raw) snapshot = { raw };
  return snapshot;
}

/** Nothing is chosen on the server; a stable object, as React requires. */
const SERVER_SNAPSHOT = { raw: undefined };
const getServerSnapshot = () => SERVER_SNAPSHOT;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function writeConsent(consent: Consent, retentionDays: number) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(serialiseConsent(consent))}; Max-Age=${retentionDays * 86_400}; Path=/; SameSite=Lax${secure}`;
  for (const listener of listeners) listener();
}

/** The visitor's current choice for these settings, or `null` (not chosen yet, renewal due, or on the server). */
export function useConsent(settings: PrivacySettings): Consent | null {
  const { raw } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const consent = parseConsent(raw);
  // Only a stored choice needs the clock (never read while prerendering).
  return consent && consentCurrent(consent, settings) ? consent : null;
}

// ---------------------------------------------------------------- integrations

type Win = Window & Record<string, unknown>;

function addScript(id: string, src: string, attrs: Record<string, string> = {}) {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.src = src;
  script.async = true;
  for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v);
  document.head.append(script);
}

/** Loads one supported provider by its ID. Only called after consent. */
function loadIntegration(provider: IntegrationProvider, id: string) {
  const w = window as unknown as Win;
  switch (provider) {
    case "plausible":
      addScript("fb-int-plausible", "https://plausible.io/js/script.js", { "data-domain": id, defer: "" });
      break;
    case "google_analytics": {
      const layer = ((w.dataLayer as unknown[]) ??= []);
      w.gtag ??= function gtag() {
        // gtag reads the arguments object itself.
        // eslint-disable-next-line prefer-rest-params
        layer.push(arguments);
      };
      const gtag = w.gtag as (...args: unknown[]) => void;
      gtag("js", new Date());
      gtag("config", id, { anonymize_ip: true });
      addScript("fb-int-ga", `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
      break;
    }
    case "meta_pixel": {
      if (!w.fbq) {
        const queue: unknown[] = [];
        const fbq = (...args: unknown[]) => queue.push(args);
        Object.assign(fbq, { queue, loaded: true, version: "2.0", push: fbq });
        w.fbq = w._fbq = fbq;
      }
      const fbq = w.fbq as (...args: unknown[]) => void;
      fbq("init", id);
      fbq("track", "PageView");
      addScript("fb-int-meta", "https://connect.facebook.net/en_US/fbevents.js");
      break;
    }
    case "linkedin_insight":
      w._linkedin_partner_id = id;
      w._linkedin_data_partner_ids = [id];
      addScript("fb-int-linkedin", "https://snap.licdn.com/li.lms-analytics/insight.min.js");
      break;
  }
}

/** First-party cookies the providers set, removed when consent is withdrawn. */
const PROVIDER_COOKIES: Record<ConsentCategory, RegExp> = {
  analytics: /^(_ga|_ga_.*|_gid|_gat.*)$/,
  preferences: /^$/,
  marketing: /^(_fbp|_fbc|li_fat_id|lidc|li_sugr|_gcl_au)$/,
};

function clearCookies(category: ConsentCategory) {
  const host = location.hostname;
  const domains = ["", host, `.${host.split(".").slice(-2).join(".")}`];
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0] ?? "";
    if (!PROVIDER_COOKIES[category].test(name)) continue;
    for (const domain of domains)
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ""}`;
  }
}

// ---------------------------------------------------------------- UI

/** Reopens the cookie preferences (for footers). */
export function CookieSettingsButton({ label, className }: { label: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
    >
      {label}
    </button>
  );
}

function resolveLink(url: string, base: string) {
  return url.startsWith("/") ? `${base.replace(/\/$/, "")}${url}` : url;
}

/**
 * The consent banner, the preferences dialog and the integrations the
 * visitor allowed. `linkBase` is prefixed to policy paths (e.g. "/en", or the
 * corporate site's address on product websites).
 */
export function CookieConsent({
  settings,
  labels,
  site,
  apiOrigin,
  linkBase,
}: {
  settings: PrivacySettings;
  labels: ConsentLabels;
  /** The website's slug, recorded with the choice. */
  site: string;
  apiOrigin: string;
  linkBase: string;
}) {
  const consent = useConsent(settings);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Choices>(NONE);
  const loaded = useRef(new Set<ConsentCategory>());
  const titleId = useId();

  // Integrations load only for granted categories.
  useEffect(() => {
    if (!consent) return;
    for (const integration of settings.integrations) {
      if (!consent.choices[integration.category]) continue;
      loadIntegration(integration.provider, integration.tracking_id);
      loaded.current.add(integration.category);
    }
  }, [consent, settings.integrations]);

  const openPreferences = useCallback(() => {
    setDraft(consent?.choices ?? NONE);
    dialogRef.current?.showModal();
  }, [consent]);

  useEffect(() => {
    window.addEventListener(OPEN_CONSENT_EVENT, openPreferences);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, openPreferences);
  }, [openPreferences]);

  const save = (choices: Choices, action: "accept_all" | "reject_optional" | "custom") => {
    const next: Consent = {
      version: settings.policy_version,
      id: consent?.id ?? crypto.randomUUID(),
      choices,
      savedAt: Math.floor(Date.now() / 1000),
    };
    writeConsent(next, settings.retention_days);
    dialogRef.current?.close();
    // Proof of consent without personal data; the choice applies either way.
    void fetch(`${apiOrigin.replace(/\/$/, "")}/v1/privacy/consent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ consent_id: next.id, site, action, ...choices, policy_version: next.version }),
    }).catch(() => {});
    // A script that already ran can't be unloaded: remove its cookies and
    // reload so nothing keeps running without consent.
    const withdrawn = CONSENT_CATEGORIES.filter((c) => !choices[c]);
    for (const category of withdrawn) clearCookies(category);
    if (withdrawn.some((c) => loaded.current.has(c))) location.reload();
  };

  const links = (
    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <a
        className="text-muted underline underline-offset-4 hover:text-text"
        href={resolveLink(settings.privacy_url, linkBase)}
      >
        {labels.privacyPolicy}
      </a>
      <a
        className="text-muted underline underline-offset-4 hover:text-text"
        href={resolveLink(settings.cookie_url, linkBase)}
      >
        {labels.cookiePolicy}
      </a>
    </p>
  );
  const secondary = buttonClasses("secondary", "md", "min-h-10 flex-1 px-4 text-sm");

  return (
    <>
      {hydrated && !consent && (
        <section
          aria-label={labels.region}
          aria-describedby={`${titleId}-banner`}
          data-consent-banner=""
          className={cn(
            "fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-line bg-bg-elevated/95 p-5 shadow-[var(--shadow-elevated)] backdrop-blur-xl",
            "animate-[fb-consent-in_400ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none",
            "sm:inset-x-auto sm:start-5 sm:bottom-5 sm:w-[26rem] sm:p-6",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
            >
              <Cookie className="size-4.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-text">{settings.banner.title}</h2>
              <p id={`${titleId}-banner`} className="mt-1.5 text-sm leading-relaxed text-muted">
                {settings.banner.body}
              </p>
              {links}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={secondary} onClick={() => save(NONE, "reject_optional")}>
              {labels.rejectOptional}
            </button>
            <button type="button" className={secondary} onClick={() => save(ALL, "accept_all")}>
              {labels.acceptAll}
            </button>
            <button
              type="button"
              className={buttonClasses(
                "ghost",
                "md",
                "min-h-10 w-full px-4 text-sm underline-offset-4 hover:underline",
              )}
              onClick={openPreferences}
            >
              {labels.customize}
            </button>
          </div>
        </section>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className={cn(
          "m-auto w-[min(34rem,calc(100vw-1.5rem))] rounded-3xl border border-line bg-bg-elevated p-0 text-text shadow-[var(--shadow-elevated)]",
          "backdrop:bg-black/50 backdrop:backdrop-blur-sm",
        )}
      >
        <div className="max-h-[min(44rem,calc(100dvh-2rem))] overflow-y-auto p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-xl font-semibold">
              {labels.preferencesTitle}
            </h2>
            <button
              type="button"
              aria-label={labels.close}
              onClick={() => dialogRef.current?.close()}
              className="-me-2 -mt-1 grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">{labels.preferencesIntro}</p>

          <ul className="mt-6 divide-y divide-line rounded-2xl border border-line">
            <li className="flex items-start justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{settings.categories.necessary.label}</p>
                <p className="mt-1 text-sm text-muted">{settings.categories.necessary.description}</p>
              </div>
              <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
                {labels.alwaysOn}
              </span>
            </li>
            {CONSENT_CATEGORIES.map((category) => {
              const text = settings.categories[category];
              const id = `${titleId}-${category}`;
              const on = draft[category];
              return (
                <li key={category} className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <p id={`${id}-label`} className="font-medium">
                      {text.label}
                    </p>
                    <p id={`${id}-description`} className="mt-1 text-sm text-muted">
                      {text.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-labelledby={`${id}-label`}
                    aria-describedby={`${id}-description`}
                    onClick={() => setDraft((d) => ({ ...d, [category]: !d[category] }))}
                    className={cn(
                      "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200",
                      "focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated focus-visible:outline-none",
                      on ? "border-accent bg-accent" : "border-line-strong bg-surface-3",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-5 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none",
                        on ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1",
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          {links}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" className={secondary} onClick={() => save(NONE, "reject_optional")}>
              {labels.rejectOptional}
            </button>
            <button type="button" className={secondary} onClick={() => save(ALL, "accept_all")}>
              {labels.acceptAll}
            </button>
            <button
              type="button"
              className={buttonClasses("primary", "md", "min-h-10 flex-1 px-4 text-sm")}
              onClick={() => save(draft, "custom")}
            >
              {labels.save}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
