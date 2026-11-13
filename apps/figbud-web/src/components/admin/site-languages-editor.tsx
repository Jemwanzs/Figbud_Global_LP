"use client";

import {
  type Locale,
  type SiteKind,
  type SiteLanguages,
  builtInLanguages,
  liveLanguages,
  localeInfo,
  locales,
} from "@figbud/i18n";
import { cn, fieldClasses } from "@figbud/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { sameValue, useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import type { WebsiteSettingsAdmin } from "./website-settings";

/*
 * Websites → a website → Languages (P7-L1, owner's brief, 14 Nov 2026): which
 * languages this website offers, which it opens in and which fills in text
 * not translated yet. One language model for every website: the languages
 * themselves (and their reviews) are shared in Settings & Security →
 * Languages; each website chooses from them. Drafted, then published; the
 * API refuses to open a website in an unreviewed language.
 */

const ENGLISH_NAMES: Record<Locale, string> = {
  en: "English",
  sw: "Swahili",
  fr: "French",
  ar: "Arabic",
  zh: "Chinese (Simplified)",
};

const names = (list: readonly Locale[]) => list.map((l) => ENGLISH_NAMES[l]).join(", ");

export function SiteLanguagesEditor({
  slug,
  name,
  kind,
  reviewed,
  data,
}: {
  slug: string;
  name: string;
  kind: SiteKind;
  /** Languages published with a recorded review (English included). */
  reviewed: string[];
  data: WebsiteSettingsAdmin;
}) {
  const router = useRouter();
  const uid = useId();
  const settings = data.settings;
  const canEdit = data.can_edit;
  const start = (l?: SiteLanguages | null): SiteLanguages => ({ ...(l ?? builtInLanguages(kind)) });
  const [form, setForm] = useState<SiteLanguages>(() =>
    start(settings.languages_draft ?? settings.languages),
  );
  const [published, setPublished] = useState<SiteLanguages>(() => start(settings.languages));
  const [hasDraft, setHasDraft] = useState(Boolean(settings.languages_draft));
  const [version, setVersion] = useState(data.version);
  const [busy, setBusy] = useState<"draft" | "publish" | "discard" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(canEdit && dirty);
  const disabled = !canEdit || busy !== null;
  const isReviewed = (l: Locale) => l === "en" || reviewed.includes(l);
  // Product websites are in English until their pages can be translated (the renderer's RENDERED_LANGUAGES).
  const visible = (l: SiteLanguages): SiteLanguages =>
    kind === "product"
      ? { enabled: ["en"], default: "en", fallback: "en" }
      : liveLanguages(l, kind, reviewed);
  const liveNow = visible(published);
  const liveNext = visible(form);
  const unpublished = !sameValue(form, published);
  const defaultReady = isReviewed(form.default);

  const toggle = (code: Locale) =>
    setForm((f) => {
      const on = f.enabled.includes(code);
      const enabled = locales.filter((l) => l === "en" || (l === code ? !on : f.enabled.includes(l)));
      return {
        enabled,
        default: enabled.includes(f.default) ? f.default : "en",
        fallback: enabled.includes(f.fallback) ? f.fallback : "en",
      };
    });

  async function save(kindOfSave: "draft" | "publish" | "discard") {
    if (
      kindOfSave === "publish" &&
      !window.confirm(`Publish these languages for ${name}? Visitors see the change within a few minutes.`)
    )
      return;
    setBusy(kindOfSave);
    setMessage(null);
    try {
      const saved = await adminFetch<WebsiteSettingsAdmin>(`sites/${slug}/settings`, {
        settings:
          kindOfSave === "publish"
            ? { ...settings, languages: form, languages_draft: null }
            : kindOfSave === "draft"
              ? { ...settings, languages_draft: form }
              : { ...settings, languages_draft: null },
        version,
      });
      setVersion(saved.version);
      setHasDraft(kindOfSave === "draft");
      if (kindOfSave === "publish") setPublished(form);
      if (kindOfSave === "discard") {
        const back = start(saved.settings.languages);
        setForm(back);
        markSaved(back);
      } else markSaved();
      setMessage({
        tone: "ok",
        text:
          kindOfSave === "publish"
            ? `Published. ${name} offers these languages within a few minutes.`
            : kindOfSave === "draft"
              ? "Draft saved. Visitors still see the published languages."
              : "Draft discarded. You're back to the published languages.",
      });
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

  return (
    <div className="mt-8 grid max-w-4xl gap-6">
      <section
        aria-labelledby={`${uid}-offered`}
        className="fb-panel grid gap-4 rounded-[var(--radius-panel)] p-6"
      >
        <h2 id={`${uid}-offered`} className="font-semibold text-text">
          Languages offered
        </h2>
        <p className="text-sm text-muted">
          English is always on: every page is written in it.{" "}
          {kind === "product"
            ? `A language you switch on appears on ${name} once its translation is reviewed and published, and its pages are translated (page translations are the next step; until then ${name} is in English). Reviews are recorded in `
            : `Unreviewed languages are listed as "In review" and kept out of search engines until reviewed in `}
          <Link href="/admin/settings/languages" className="font-medium text-accent-strong underline">
            Settings &amp; Security → Languages
          </Link>
          .
        </p>
        <ul className="grid gap-2">
          {locales.map((code) => {
            const info = localeInfo[code];
            const on = form.enabled.includes(code);
            const id = `${uid}-lang-${code}`;
            return (
              <li
                key={code}
                data-language={code}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={on}
                  disabled={disabled || code === "en"}
                  onChange={() => toggle(code)}
                  className="size-5 accent-[var(--accent)]"
                />
                <label htmlFor={id} className="flex-1 text-sm text-text">
                  <span lang={info.tag} dir={info.dir}>
                    {info.label}
                  </span>
                  <span className="text-muted"> · {ENGLISH_NAMES[code]}</span>
                </label>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    isReviewed(code) ? "border-success/40 text-success" : "border-line text-muted",
                  )}
                >
                  {isReviewed(code) ? "Reviewed and published" : "Awaiting review"}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-text">
            Opens in (default)
            <select
              value={form.default}
              disabled={disabled}
              onChange={(e) => setForm((f) => ({ ...f, default: e.target.value as Locale }))}
              className={fieldClasses("min-h-11 px-3 text-sm")}
            >
              {form.enabled.map((code) => (
                <option key={code} value={code} disabled={!isReviewed(code)}>
                  {ENGLISH_NAMES[code]}
                  {isReviewed(code) ? "" : " (needs a review first)"}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-subtle">
              For visitors without a saved choice or a matching browser language.
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-text">
            When a text isn&apos;t translated
            <select
              value={form.fallback}
              disabled={disabled}
              onChange={(e) => setForm((f) => ({ ...f, fallback: e.target.value as Locale }))}
              className={fieldClasses("min-h-11 px-3 text-sm")}
            >
              {form.enabled.map((code) => (
                <option key={code} value={code}>
                  Show it in {ENGLISH_NAMES[code]}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-subtle">
              Then English, so nothing is ever blank or shows a raw key.
            </span>
          </label>
        </div>
      </section>

      <section
        aria-labelledby={`${uid}-visitors`}
        className="grid gap-2 rounded-2xl border border-line p-5 text-sm"
      >
        <h2 id={`${uid}-visitors`} className="font-medium text-text">
          What visitors see
        </h2>
        <p className="text-muted" data-languages-live="">
          Now: {names(liveNow.enabled)}; opens in {ENGLISH_NAMES[liveNow.default]}.
        </p>
        {kind === "product" && (
          <p className="text-subtle">
            Product websites show English until their pages can be translated, whatever is switched on here.
          </p>
        )}
        {unpublished && (
          <p className="text-muted" data-languages-next="">
            After publishing: {names(liveNext.enabled)}; opens in {ENGLISH_NAMES[liveNext.default]}.
          </p>
        )}
      </section>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <ActionButton
            ready={dirty}
            busy={busy === "draft"}
            variant="secondary"
            hint={busy ? undefined : "Nothing to save"}
            onClick={() => save("draft")}
          >
            Save draft
          </ActionButton>
          <ActionButton
            ready={(unpublished || hasDraft) && defaultReady}
            busy={busy === "publish"}
            hint={busy ? undefined : defaultReady ? "Nothing to publish" : "Choose a reviewed default"}
            onClick={() => save("publish")}
          >
            Publish
          </ActionButton>
          <ActionButton
            ready={hasDraft || dirty}
            busy={busy === "discard"}
            variant="secondary"
            onClick={() => {
              if (!hasDraft) {
                const back = start(settings.languages);
                setForm(back);
                markSaved(back);
                setMessage({ tone: "ok", text: "Changes discarded." });
              } else void save("discard");
            }}
          >
            Discard draft
          </ActionButton>
          {message && (
            <p
              role={message.tone === "ok" ? "status" : "alert"}
              className={cn("text-sm", message.tone === "ok" ? "text-success" : "text-danger")}
            >
              {message.text}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-subtle">You can view this; a reviewer or owner can change it.</p>
      )}
    </div>
  );
}
