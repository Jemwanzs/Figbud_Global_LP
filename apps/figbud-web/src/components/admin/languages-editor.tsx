"use client";

import { type Locale, localeInfo } from "@figbud/i18n";
import { cn, fieldClasses } from "@figbud/ui";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, type FieldError, adminFetch } from "@/lib/admin-client";

import { ActionButton } from "./action-button";

type Code = Exclude<Locale, "en">;

export interface LocaleReview {
  code: Code;
  status: "draft" | "published";
  reviewer: string;
  reviewed_on: string | null;
  evidence: string;
  note: string;
  version: number;
  updated_at: string;
}

export interface LanguagesAdmin {
  locales: LocaleReview[];
  can_edit: boolean;
}

type Coverage = Record<Code, { translated: number; total: number; missing: string[] }>;

/** A language's acknowledgement emails, one per kind of enquiry (services/api/src/locales.rs). */
export type LanguageEmails = { kind: string; product: string; subject: string; text: string }[];

/**
 * Settings & Security → Languages (P7-G2): each translation's coverage, its
 * review record, and the owner's publish switch (services/api/src/locales.rs).
 */
export function LanguagesEditor({
  data,
  coverage,
  emails,
  usage = {},
}: {
  data: LanguagesAdmin;
  coverage: Coverage;
  emails: Partial<Record<string, LanguageEmails>>;
  /** The websites that have switched each language on (Websites → a website → Languages, P7-L1). */
  usage?: Partial<Record<string, string[]>>;
}) {
  return (
    <ul className="mt-8 grid gap-5">
      {data.locales.map((l) => (
        <LanguageRow
          key={l.code}
          review={l}
          coverage={coverage[l.code]}
          emails={emails[l.code] ?? []}
          usedOn={usage[l.code] ?? []}
          canEdit={data.can_edit}
        />
      ))}
    </ul>
  );
}

function LanguageRow({
  review,
  coverage,
  emails,
  usedOn,
  canEdit,
}: {
  review: LocaleReview;
  coverage: Coverage[Code];
  emails: LanguageEmails;
  usedOn: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const info = localeInfo[review.code];
  const [form, setForm] = useState({
    reviewer: review.reviewer,
    reviewed_on: review.reviewed_on ?? "",
    evidence: review.evidence,
    note: review.note,
  });
  const [version, setVersion] = useState(review.version);
  const [status, setStatus] = useState(review.status);
  const [busy, setBusy] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const percent = Math.round((coverage.translated / Math.max(1, coverage.total)) * 100);
  const published = status === "published";
  const recorded = form.reviewer.trim() && form.reviewed_on && form.evidence.trim();
  const errorFor = (f: string) => fields.find((x) => x.field === f)?.message;

  async function save(next: "draft" | "published", kind: string) {
    setBusy(kind);
    setMessage(null);
    setFields([]);
    try {
      const saved = await adminFetch<LanguagesAdmin>(`locales/${review.code}`, {
        status: next,
        reviewer: form.reviewer,
        reviewed_on: form.reviewed_on || null,
        evidence: form.evidence,
        note: form.note,
        version,
      });
      const row = saved.locales.find((x) => x.code === review.code);
      if (row) {
        setVersion(row.version);
        setStatus(row.status);
      }
      setMessage({
        tone: "ok",
        text:
          kind === "publish"
            ? `${info.label} is published: search engines can index it within a few minutes.`
            : kind === "draft"
              ? `${info.label} is a draft again: it's taken out of indexing and the sitemap.`
              : "Review saved.",
      });
      router.refresh();
    } catch (err) {
      if (err instanceof AdminError) setFields(err.fields);
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  }

  const input = (
    key: keyof typeof form,
    label: string,
    opts: { type?: string; hint?: string; max?: number } = {},
  ) => (
    <label className="grid gap-1.5 text-sm font-medium text-text">
      {label}
      <input
        type={opts.type ?? "text"}
        value={form[key]}
        maxLength={opts.max ?? 300}
        disabled={!canEdit || busy !== null}
        aria-invalid={Boolean(errorFor(key))}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className={fieldClasses("min-h-11 px-3 text-sm")}
      />
      {(errorFor(key) || opts.hint) && (
        <span className={cn("text-xs font-normal", errorFor(key) ? "text-danger" : "text-subtle")}>
          {errorFor(key) ?? opts.hint}
        </span>
      )}
    </label>
  );

  return (
    <li data-locale={review.code} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2
          id={`${uid}-name`}
          lang={info.tag}
          dir={info.dir}
          className="font-display text-xl font-semibold text-text"
        >
          {info.label}
        </h2>
        <span className="text-sm text-subtle">{review.code.toUpperCase()}</span>
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs",
            published ? "border-accent/40 text-accent-strong" : "border-line-strong text-muted",
          )}
        >
          {published ? "Published · indexed" : "Draft · not indexed"}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted" data-used-on="">
        {usedOn.length
          ? `Switched on for: ${usedOn.join(", ")}.`
          : "No website has switched it on (Websites → a website → Languages)."}
      </p>
      <div className="mt-4">
        <p className="text-sm text-muted">{`${coverage.translated} of ${coverage.total} texts translated (${percent}%)`}</p>
        <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-2">
          <span className="block h-full rounded-full bg-action" style={{ width: `${percent}%` }} />
        </span>
        {coverage.missing.length > 0 && (
          <p className="mt-2 text-xs text-subtle">
            Still in English, for example:{" "}
            {coverage.missing.map((m) => (
              <code key={m} className="me-2">
                {m}
              </code>
            ))}
          </p>
        )}
      </div>
      {emails.length > 0 && (
        <details className="mt-4 rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium text-text">
            {`Acknowledgement emails to review (${emails.length})`}
          </summary>
          <p className="mt-2 text-xs text-subtle">
            Sent to visitors who write in this language once it&apos;s published; English until then.
          </p>
          <ul className="mt-3 grid gap-3">
            {emails.map((e) => (
              <li key={`${e.kind}${e.product}`} className="rounded-lg bg-surface-2 p-3">
                <p className="text-xs text-subtle">{`${e.kind} · ${e.product}`}</p>
                <div lang={info.tag} dir={info.dir}>
                  <p className="mt-1 text-sm font-medium text-text">{e.subject}</p>
                  <p className="mt-1 text-sm whitespace-pre-line text-muted">{e.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <fieldset className="mt-5 grid gap-4 sm:grid-cols-2" aria-labelledby={`${uid}-name`}>
        {input("reviewer", "Reviewed by", { hint: "The native-speaker reviewer", max: 120 })}
        {input("reviewed_on", "Review date", { type: "date" })}
        {input("evidence", "Where the review is kept", { hint: "e.g. signed review sheet, 10 Nov 2026" })}
        {input("note", "Note (optional)")}
      </fieldset>
      {canEdit ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ActionButton ready busy={busy === "save"} variant="secondary" onClick={() => save(status, "save")}>
            Save review
          </ActionButton>
          {published ? (
            <ActionButton
              ready
              busy={busy === "draft"}
              variant="secondary"
              onClick={() =>
                window.confirm(`Take ${info.label} out of search results and the sitemap?`) &&
                save("draft", "draft")
              }
            >
              Back to draft
            </ActionButton>
          ) : (
            <ActionButton
              ready={Boolean(recorded)}
              busy={busy === "publish"}
              hint={recorded ? undefined : "Record the review first"}
              onClick={() => save("published", "publish")}
            >
              Publish
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
      ) : (
        <p className="mt-5 text-sm text-subtle">An owner records reviews and publishes languages.</p>
      )}
    </li>
  );
}
