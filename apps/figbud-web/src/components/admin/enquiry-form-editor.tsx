"use client";

import {
  type EnquiryFormConfig,
  type EnquiryKind,
  type EnquiryProduct,
  FORM_FIELDS,
  FORM_LABELLED,
  FORM_TEXTS,
  type FieldRule,
  type FormField,
  type FormLabelled,
  type FormText,
  enquiryFormCopy,
  enquiryKinds,
  enquiryStagesCopy,
  requiresMessage,
} from "@figbud/site-kit/enquiry";
import { EnquiryForm } from "@figbud/site-kit/enquiry-form";
import { cn, fieldClasses, useConfirm } from "@figbud/ui";
import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { sameValue, useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import type { WebsiteSettingsAdmin } from "./website-settings";

/*
 * Websites → a website → Enquiry form (UI-EF3, owner's brief, 14 Nov 2026):
 * the layout, categories, optional fields and wording of the website's form,
 * with a live preview of the real form (checked, never sent). Drafted and
 * published with the website's settings; the API checks them and enforces
 * the categories and required fields on every enquiry the form sends.
 */

const FIELD_NAMES: Record<FormField, string> = {
  job_title: "Job title",
  country: "Country",
  phone: "Phone",
  company_size: "Company size",
  message: "How can we help?",
};

const LABEL_DEFAULTS: Record<FormLabelled, string> = {
  name: enquiryFormCopy.name,
  email: enquiryFormCopy.email,
  company: enquiryFormCopy.company,
  job_title: enquiryFormCopy.jobTitle,
  country: enquiryFormCopy.country,
  phone: enquiryFormCopy.phone,
  company_size: enquiryFormCopy.companySize,
  message: enquiryFormCopy.message,
};

const TEXT_NAMES: Record<FormText, { label: string; placeholder: string }> = {
  intro: { label: "Introduction above the form", placeholder: "None" },
  one_title: { label: "First stage title", placeholder: enquiryStagesCopy.oneTitle },
  one_lead: { label: "First stage line", placeholder: enquiryStagesCopy.oneLead },
  two_title: { label: "Second stage title", placeholder: enquiryStagesCopy.twoTitle },
  two_lead: { label: "Second stage line", placeholder: enquiryStagesCopy.twoLead },
  continue: { label: "Continue button", placeholder: enquiryStagesCopy.continue },
  submit: { label: "Send button", placeholder: enquiryFormCopy.submit },
  success_title: { label: "Success title", placeholder: enquiryStagesCopy.successTitle },
  success_body: {
    label: "Success message (its reference is always shown)",
    placeholder: enquiryFormCopy.successBody,
  },
};

/** Only what differs from the form as built is kept. */
function tidy(config: EnquiryFormConfig): EnquiryFormConfig {
  const strip = <K extends string>(map?: Partial<Record<K, string>>) =>
    Object.fromEntries(Object.entries(map ?? {}).filter(([, v]) => String(v ?? "").trim())) as Partial<
      Record<K, string>
    >;
  const fields = Object.fromEntries(
    Object.entries(config.fields ?? {}).filter(([, rule]) => rule !== "optional"),
  ) as EnquiryFormConfig["fields"];
  const kinds = sameValue(config.kinds, [...enquiryKinds]) ? [] : (config.kinds ?? []);
  return {
    layout: config.layout ?? "stages",
    kinds,
    fields,
    labels: strip(config.labels),
    hints: strip(config.hints),
    texts: strip(config.texts),
  };
}

export function EnquiryFormEditor({
  slug,
  name,
  product,
  apiOrigin,
  data,
}: {
  slug: string;
  name: string;
  /** On a product's own website, its product (no product choice is shown). */
  product?: EnquiryProduct;
  apiOrigin: string;
  data: WebsiteSettingsAdmin;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const uid = useId();
  const settings = data.settings;
  const canEdit = data.can_edit;
  const start = (c?: EnquiryFormConfig | null): EnquiryFormConfig => {
    const t = tidy(c ?? {});
    return { ...t, kinds: t.kinds?.length ? t.kinds : [...enquiryKinds] };
  };
  const [form, setForm] = useState<EnquiryFormConfig>(() =>
    start(settings.enquiry_form_draft ?? settings.enquiry_form),
  );
  const [published, setPublished] = useState(() => tidy(settings.enquiry_form ?? {}));
  const [hasDraft, setHasDraft] = useState(Boolean(settings.enquiry_form_draft));
  const [version, setVersion] = useState(data.version);
  const [busy, setBusy] = useState<"draft" | "publish" | "discard" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(canEdit && dirty);
  const disabled = !canEdit || busy !== null;
  const stored = tidy(form);
  const unpublished = !sameValue(stored, published);
  const offered = form.kinds ?? [];
  const messageNeeded = offered.some((k) => requiresMessage(k));
  const problem = !offered.length
    ? "Offer at least one category."
    : messageNeeded && form.fields?.message === "hidden"
      ? "Sales, general and partnership enquiries need a message: keep it, or stop offering them."
      : null;

  const setRule = (field: FormField, rule: FieldRule) =>
    setForm((f) => ({ ...f, fields: { ...f.fields, [field]: rule } }));
  const setMap = (key: "labels" | "hints" | "texts", field: string, value: string) =>
    setForm((f) => ({ ...f, [key]: { ...f[key], [field]: value } }));
  const toggleKind = (kind: EnquiryKind) =>
    setForm((f) => {
      const kinds = f.kinds ?? [];
      return { ...f, kinds: kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind] };
    });
  const moveKind = (kind: EnquiryKind, by: number) =>
    setForm((f) => {
      const kinds = [...(f.kinds ?? [])];
      const i = kinds.indexOf(kind);
      const j = i + by;
      if (i < 0 || j < 0 || j >= kinds.length) return f;
      [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
      return { ...f, kinds };
    });

  async function save(kind: "draft" | "publish" | "discard") {
    if (
      kind === "publish" &&
      !(await confirm({
        title: `Publish this form for ${name}?`,
        body: "Visitors see it within a few minutes. Enquiries already received don't change.",
        confirmLabel: "Publish form",
      }))
    )
      return;
    setBusy(kind);
    setMessage(null);
    try {
      const saved = await adminFetch<WebsiteSettingsAdmin>(`sites/${slug}/settings`, {
        settings:
          kind === "publish"
            ? { ...settings, enquiry_form: stored, enquiry_form_draft: null }
            : kind === "draft"
              ? { ...settings, enquiry_form_draft: stored }
              : { ...settings, enquiry_form_draft: null },
        version,
      });
      setVersion(saved.version);
      setHasDraft(kind === "draft");
      if (kind === "publish") setPublished(stored);
      if (kind === "discard") {
        const back = start(saved.settings.enquiry_form);
        setForm(back);
        markSaved(back);
      } else markSaved();
      setMessage({
        tone: "ok",
        text:
          kind === "publish"
            ? `Published. ${name}'s form changes within a few minutes.`
            : kind === "draft"
              ? "Draft saved. Visitors still see the published form."
              : "Draft discarded. You're back to the published form.",
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

  const panel = "fb-panel grid gap-4 rounded-[var(--radius-panel)] p-6";
  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:items-start">
      <div className="grid gap-6">
        <p className="text-sm text-muted">
          Whether {name} takes enquiries at all is on{" "}
          <Link href={`/admin/sites/${slug}/website`} className="font-medium text-accent-strong underline">
            Navigation, footer &amp; forms
          </Link>
          . Name, work email, company (for demos, sales and partnerships) and consent always follow the
          enquiry rules; the API also enforces what you choose here.
        </p>

        <fieldset className={panel}>
          <legend className="sr-only">Layout</legend>
          <h2 className="font-semibold text-text">Layout</h2>
          <div role="radiogroup" aria-label="Layout" className="flex flex-wrap gap-2">
            {(
              [
                ["stages", "Two stages", "Who you are, then the details, in one card"],
                ["single", "One column", "Every field in one list"],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={(form.layout ?? "stages") === value}
                disabled={disabled}
                onClick={() => setForm((f) => ({ ...f, layout: value }))}
                className={cn(
                  "grid min-h-11 rounded-xl border px-4 py-2 text-start text-sm disabled:opacity-60",
                  (form.layout ?? "stages") === value
                    ? "border-action bg-surface-2 text-text"
                    : "border-line text-muted",
                )}
              >
                <span className="font-medium">{label}</span>
                <span className="text-xs text-subtle">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={panel}>
          <legend className="sr-only">Categories</legend>
          <h2 className="font-semibold text-text">Categories offered, in order</h2>
          <ul className="grid gap-1.5">
            {[...offered, ...enquiryKinds.filter((k) => !offered.includes(k))].map((kind) => {
              const on = offered.includes(kind);
              const label = enquiryFormCopy.kinds[kind];
              return (
                <li key={kind} data-kind={kind} className="flex items-center gap-2">
                  <label className="flex min-h-10 flex-1 items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={disabled}
                      onChange={() => toggleKind(kind)}
                      className="size-5 accent-[var(--accent)]"
                    />
                    {label}
                  </label>
                  {on && (
                    <>
                      <button
                        type="button"
                        aria-label={`Move ${label} up`}
                        disabled={disabled || offered.indexOf(kind) === 0}
                        onClick={() => moveKind(kind, -1)}
                        className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-40"
                      >
                        <ArrowUp aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${label} down`}
                        disabled={disabled || offered.indexOf(kind) === offered.length - 1}
                        onClick={() => moveKind(kind, 1)}
                        className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-40"
                      >
                        <ArrowDown aria-hidden className="size-4" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset className={panel}>
          <legend className="sr-only">Optional fields</legend>
          <h2 className="font-semibold text-text">Optional fields</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {FORM_FIELDS.map((field) => (
              <label key={field} className="grid gap-1.5 text-sm font-medium text-text">
                {FIELD_NAMES[field]}
                <select
                  value={form.fields?.[field] ?? "optional"}
                  disabled={disabled}
                  onChange={(e) => setRule(field, e.target.value as FieldRule)}
                  className={fieldClasses("min-h-11 px-3 text-sm")}
                >
                  <option value="optional">Optional</option>
                  <option value="required">Required</option>
                  <option value="hidden">Hidden</option>
                </select>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={panel}>
          <legend className="sr-only">Labels and hints</legend>
          <h2 className="font-semibold text-text">Labels and hints</h2>
          <p className="text-sm text-muted">Empty keeps the usual wording.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FORM_LABELLED.map((field) => (
              <div key={field} className="grid gap-1.5">
                <label htmlFor={`${uid}-label-${field}`} className="text-sm font-medium text-text">
                  {`${LABEL_DEFAULTS[field]}: label`}
                </label>
                <input
                  id={`${uid}-label-${field}`}
                  value={form.labels?.[field] ?? ""}
                  placeholder={LABEL_DEFAULTS[field]}
                  maxLength={40}
                  disabled={disabled}
                  onChange={(e) => setMap("labels", field, e.target.value)}
                  className={fieldClasses("min-h-11 px-3 text-sm")}
                />
                <input
                  aria-label={`${LABEL_DEFAULTS[field]}: hint`}
                  value={form.hints?.[field] ?? ""}
                  placeholder="Hint (optional)"
                  maxLength={100}
                  disabled={disabled}
                  onChange={(e) => setMap("hints", field, e.target.value)}
                  className={fieldClasses("min-h-10 px-3 text-xs")}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className={panel}>
          <legend className="sr-only">Wording</legend>
          <h2 className="font-semibold text-text">Wording</h2>
          <div className="grid gap-3">
            {(Object.keys(FORM_TEXTS) as FormText[]).map((key) => (
              <label key={key} className="grid gap-1.5 text-sm font-medium text-text">
                {TEXT_NAMES[key].label}
                <input
                  value={form.texts?.[key] ?? ""}
                  placeholder={TEXT_NAMES[key].placeholder}
                  maxLength={FORM_TEXTS[key]}
                  disabled={disabled}
                  onChange={(e) => setMap("texts", key, e.target.value)}
                  className={fieldClasses("min-h-11 px-3 text-sm")}
                />
              </label>
            ))}
          </div>
        </fieldset>

        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton
              ready={dirty && !problem}
              busy={busy === "draft"}
              variant="secondary"
              hint={busy ? undefined : problem ? "Fix the form first" : "Nothing to save"}
              onClick={() => save("draft")}
            >
              Save draft
            </ActionButton>
            <ActionButton
              ready={(unpublished || hasDraft) && !problem}
              busy={busy === "publish"}
              hint={busy ? undefined : problem ? "Fix the form first" : "Nothing to publish"}
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
                  const back = start(settings.enquiry_form);
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

      <section aria-label="Form preview" className="grid gap-3 xl:sticky xl:top-24">
        <h2 className="font-medium text-text">Preview</h2>
        <p className="text-xs text-subtle">
          The real form with your changes, in {name}&apos;s colours. Try it: it checks as usual and is never
          sent.
        </p>
        <div
          data-site-preview=""
          data-site={slug}
          className="rounded-2xl border border-line bg-bg p-3 sm:p-5"
        >
          <Suspense fallback={<div className="h-[40rem]" aria-hidden />}>
            <EnquiryForm
              // A changed layout or category list starts the preview afresh.
              key={`${form.layout}-${offered.join(",")}`}
              locale="en"
              copy={enquiryFormCopy}
              stages={enquiryStagesCopy}
              privacyHref="/en/legal/privacy"
              apiOrigin={apiOrigin}
              product={product}
              config={{ ...stored, kinds: offered }}
              preview
            />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
