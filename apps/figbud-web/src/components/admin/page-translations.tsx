"use client";

import { type Locale, localeInfo } from "@figbud/i18n";
import { cn, fieldClasses, useConfirm } from "@figbud/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";

/*
 * Pages → a page → Translations (P7-L2, owner's brief, 14 Nov 2026): the
 * published English page's texts beside each language's translation, with
 * how complete it is and its review. Draft → Needs review (complete only) →
 * Complete (a recorded reviewer) → Published. Texts whose English changed
 * since they were translated are flagged and show in English until updated
 * (services/api/src/pages/translations.rs).
 */

export type TranslationLocale = "sw" | "fr" | "ar" | "zh";

export interface Coverage {
  translated: number;
  total: number;
  outdated: number;
}

export interface TranslationSummary {
  locale: TranslationLocale;
  status: "draft" | "needs_review" | "complete";
  started: boolean;
  published: boolean;
  coverage: Coverage;
}

export interface TranslationDetail {
  locale: TranslationLocale;
  sources: { key: string; english: string }[];
  fields: Record<string, { text: string; source: string }>;
  status: "draft" | "needs_review" | "complete";
  reviewer: string;
  reviewed_at: string | null;
  published: boolean;
  published_at: string | null;
  changes_pending: boolean;
  coverage: Coverage;
  version: number;
  can_edit: boolean;
  can_review: boolean;
}

/** Language names in English, for sentences (the tabs show each language's own name). */
const ENGLISH_NAME: Record<TranslationLocale, string> = {
  sw: "Kiswahili",
  fr: "French",
  ar: "Arabic",
  zh: "Chinese",
};

const STATUS: Record<TranslationDetail["status"], string> = {
  draft: "Draft",
  needs_review: "Needs review",
  complete: "Complete",
};

/** A readable name for a text's place on the page. */
function where(key: string): string {
  if (key === "@title") return "Page title";
  if (key === "@seo_title") return "Search title";
  if (key === "@seo_description") return "Search description";
  const [, ...path] = key.split("/");
  return path.map((p) => (/^\d+$/.test(p) ? `#${Number(p) + 1}` : p.replace(/_/g, " "))).join(" › ");
}

const percent = (c: Coverage) => (c.total ? Math.round((c.translated / c.total) * 100) : 0);

export function PageTranslations({
  pageId,
  slug,
  summaries,
  detail,
}: {
  pageId: string;
  slug: string;
  summaries: TranslationSummary[];
  detail: TranslationDetail;
}) {
  const router = useRouter();
  const uid = useId();
  const confirm = useConfirm();
  const info = localeInfo[detail.locale as Locale];
  const named = ENGLISH_NAME[detail.locale];
  const start = () =>
    Object.fromEntries(detail.sources.map((s) => [s.key, detail.fields[s.key]?.text ?? ""]));
  const [texts, setTexts] = useState<Record<string, string>>(start);
  const [version, setVersion] = useState(detail.version);
  const [reviewer, setReviewer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { dirty, markSaved } = useSavedBaseline(texts);
  useUnsavedChangesWarning(detail.can_edit && dirty);
  const complete = detail.coverage.total > 0 && detail.coverage.translated === detail.coverage.total;
  const disabled = busy !== null;

  async function run(action: string, body: Record<string, unknown>, done: string) {
    setBusy(action);
    setMessage(null);
    try {
      const path = `pages/${pageId}/translations/${detail.locale}${action === "save" ? "" : `/${action}`}`;
      const result = await adminFetch<{ version: number }>(path, body);
      setVersion(result.version);
      if (action === "save") markSaved();
      setMessage({ tone: "ok", text: done });
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
    <div className="mt-6 grid gap-6">
      <nav aria-label="Languages" className="flex flex-wrap gap-2">
        {summaries.map((s) => {
          const l = localeInfo[s.locale as Locale];
          const current = s.locale === detail.locale;
          return (
            <Link
              key={s.locale}
              href={`/admin/sites/${slug}/pages/${pageId}/translations?locale=${s.locale}`}
              aria-current={current ? "page" : undefined}
              className={cn(
                "grid min-h-11 rounded-xl border px-4 py-2 text-sm",
                current ? "border-action bg-surface-2 text-text" : "border-line text-muted hover:text-text",
              )}
            >
              <span lang={l.tag} dir={l.dir} className="font-medium">
                {l.label}
              </span>
              <span className="text-xs text-subtle">
                {s.published ? "Published" : s.started ? STATUS[s.status] : "Not started"} ·{" "}
                {percent(s.coverage)}%
              </span>
            </Link>
          );
        })}
      </nav>

      <section
        aria-labelledby={`${uid}-state`}
        className="fb-panel grid gap-3 rounded-[var(--radius-panel)] p-5"
      >
        <h2 id={`${uid}-state`} className="font-semibold text-text">
          <span lang={info.tag} dir={info.dir}>
            {info.label}
          </span>{" "}
          · {STATUS[detail.status]}
          {detail.published && " · Published"}
        </h2>
        <p className="text-sm text-muted" data-coverage="">
          {`${detail.coverage.translated} of ${detail.coverage.total} texts translated (${percent(detail.coverage)}%)`}
          {detail.coverage.outdated > 0 &&
            ` · ${detail.coverage.outdated} need updating: their English changed, so visitors see the English there`}
        </p>
        <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
          <span
            className="block h-full rounded-full bg-action"
            style={{ width: `${percent(detail.coverage)}%` }}
          />
        </span>
        {detail.status === "complete" && (
          <p className="text-sm text-muted">
            Reviewed by {detail.reviewer}
            {detail.reviewed_at && ` on ${new Date(detail.reviewed_at).toLocaleDateString("en-GB")}`}.
          </p>
        )}
        {detail.changes_pending && (
          <p className="text-sm text-muted">
            The published translation differs from this one until it&apos;s published.
          </p>
        )}
        <p className="text-xs text-subtle">
          Visitors see a published translation once {named} is reviewed and published for the website
          (Settings &amp; Security → Languages, and the website&apos;s Languages page). Translations need a
          review by a native speaker before they&apos;re published.
        </p>
      </section>

      <ol className="grid gap-3">
        {detail.sources.map((s) => {
          const field = detail.fields[s.key];
          const outdated = field && field.source !== s.english;
          const id = `${uid}-${s.key}`;
          const long = s.english.length > 80;
          return (
            <li
              key={s.key}
              data-text={s.key}
              className="grid gap-3 rounded-2xl border border-line p-4 lg:grid-cols-2"
            >
              <div>
                <p className="text-xs font-medium tracking-wide text-subtle uppercase">{where(s.key)}</p>
                <p lang="en" className="mt-1 text-sm whitespace-pre-line text-text">
                  {s.english}
                </p>
                {outdated && (
                  <p className="mt-2 rounded-lg bg-warning/10 p-2 text-xs text-text">
                    The English changed since this was translated (from &ldquo;{field.source}&rdquo;). Update
                    the translation; until then visitors see the English.
                  </p>
                )}
              </div>
              <label htmlFor={id} className="grid gap-1.5">
                <span className="sr-only">{`${where(s.key)} in ${named}`}</span>
                {long ? (
                  <textarea
                    id={id}
                    lang={info.tag}
                    dir={info.dir}
                    rows={4}
                    maxLength={5000}
                    value={texts[s.key] ?? ""}
                    disabled={!detail.can_edit || disabled}
                    onChange={(e) => setTexts((t) => ({ ...t, [s.key]: e.target.value }))}
                    className={fieldClasses("min-h-24 px-3 py-2 text-sm")}
                  />
                ) : (
                  <input
                    id={id}
                    lang={info.tag}
                    dir={info.dir}
                    maxLength={5000}
                    value={texts[s.key] ?? ""}
                    disabled={!detail.can_edit || disabled}
                    onChange={(e) => setTexts((t) => ({ ...t, [s.key]: e.target.value }))}
                    className={fieldClasses("min-h-11 px-3 text-sm")}
                  />
                )}
              </label>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-end gap-3">
        {detail.can_edit && (
          <>
            <ActionButton
              ready={dirty}
              busy={busy === "save"}
              variant="secondary"
              hint={busy ? undefined : "Nothing to save"}
              onClick={() => run("save", { texts, version }, "Translation saved as a draft.")}
            >
              Save draft
            </ActionButton>
            {detail.status === "draft" && (
              <ActionButton
                ready={complete && !dirty}
                busy={busy === "submit"}
                hint={busy ? undefined : dirty ? "Save first" : "Translate every text first"}
                onClick={() => run("submit", { version }, "Sent for review.")}
              >
                Ask for review
              </ActionButton>
            )}
          </>
        )}
        {detail.can_review && detail.status === "needs_review" && (
          <>
            <label className="grid gap-1.5 text-sm font-medium text-text">
              Reviewed by (a native speaker)
              <input
                value={reviewer}
                maxLength={120}
                onChange={(e) => setReviewer(e.target.value)}
                className={fieldClasses("min-h-11 px-3 text-sm")}
              />
            </label>
            <ActionButton
              ready={complete && Boolean(reviewer.trim())}
              busy={busy === "approve"}
              hint={busy ? undefined : "Name the reviewer"}
              onClick={() =>
                run("approve", { version, reviewer }, "Review recorded: the translation is complete.")
              }
            >
              Record review
            </ActionButton>
          </>
        )}
        {detail.can_review && detail.status === "complete" && (
          <ActionButton
            ready={complete && (!detail.published || detail.changes_pending)}
            busy={busy === "publish"}
            hint={busy ? undefined : "Nothing to publish"}
            onClick={async () => {
              const ok = await confirm({
                title: `Publish the ${named} translation?`,
                body: "Visitors choosing this language see it on the website within a few minutes.",
                confirmLabel: "Publish",
              });
              if (ok) void run("publish", { version }, "Published.");
            }}
          >
            Publish
          </ActionButton>
        )}
        {detail.can_review && detail.status !== "draft" && (
          <ActionButton
            ready
            busy={busy === "back_to_draft"}
            variant="secondary"
            onClick={() => run("back_to_draft", { version }, "Back to draft.")}
          >
            Back to draft
          </ActionButton>
        )}
        {detail.can_review && detail.published && (
          <ActionButton
            ready
            busy={busy === "unpublish"}
            variant="secondary"
            onClick={async () => {
              const ok = await confirm({
                title: `Take the ${named} translation off the website?`,
                body: "Visitors see the English page instead. The translation is kept here.",
                confirmLabel: "Unpublish",
                tone: "warning",
              });
              if (ok) void run("unpublish", { version }, "Unpublished: visitors see the English page.");
            }}
          >
            Unpublish
          </ActionButton>
        )}
        {message && (
          <p
            role={message.tone === "ok" ? "status" : "alert"}
            className={cn("text-sm", message.tone === "ok" ? "text-success" : "text-danger")}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
