"use client";

import { cn } from "@figbud/ui";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useId, useState } from "react";

import { AdminError, type FieldError, adminFetch } from "@/lib/admin-client";
import { useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { MediaPicker } from "./media-picker";
import type { MediaItem } from "./page-types";
import { type FieldIssue, KIND_LABELS, type ProofDetail, RELATIONSHIPS, STATUS_LABELS } from "./proof-types";

type Doc = Record<string, unknown>;
type Site = { slug: string; name: string; corporate: boolean };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const bool = (v: unknown) => v === true;

/**
 * One Trusted By organisation, testimonial or metric (P10-T1..T3). Saving
 * keeps a draft (websites still show the published version); a reviewer
 * other than the requester publishes it, and only once the API's checks pass
 * (recorded permission, or a metric's source, period and verification).
 */
export function ProofEditor({
  initial,
  sites,
  media,
  organizations,
  isOwner,
}: {
  initial: ProofDetail;
  sites: Site[];
  /** The corporate media library (logos and photos). */
  media: MediaItem[];
  /** Trusted By organisations a testimonial can name. */
  organizations: { id: string; title: string }[];
  /** Owners may approve their own requests (the API's maker-checker rule). */
  isOwner: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [data, setData] = useState(initial);
  const [form, setForm] = useState<{ doc: Doc; sites: string[] }>({
    doc: initial.draft,
    sites: initial.sites,
  });
  const [savedIssues, setSavedIssues] = useState<FieldIssue[]>(initial.publish_errors);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(data.can_edit && dirty);
  const archivedNow = data.status === "archived";
  // The checklist follows unsaved edits (owner's brief, 12 Nov 2026): the API
  // checks them with its publishing rules, without saving, a moment after
  // typing stops. Each result belongs to the edits it checked.
  const formKey = JSON.stringify(form);
  const [checked, setChecked] = useState<{ key: string; errors: FieldError[]; issues: FieldIssue[] } | null>(
    null,
  );
  const wantCheck = dirty && data.can_edit && !archivedNow;
  useEffect(() => {
    if (!wantCheck) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const doc = JSON.parse(formKey) as { doc: Doc; sites: string[] };
        const result = await adminFetch<{ errors: FieldError[]; publish_errors: FieldIssue[] }>(
          `proof/${data.id}/check`,
          { document: doc.doc, sites: doc.sites },
        );
        if (live) setChecked({ key: formKey, errors: result.errors, issues: result.publish_errors });
      } catch {
        // The list stays as last checked; saving checks again.
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [formKey, wantCheck, data.id]);
  const current = wantCheck && checked?.key === formKey ? checked : null;
  const checking = wantCheck && !current;
  const checkFields = current?.errors ?? [];
  // Saved: its own list. Editing: the latest check (the previous one while checking).
  const issues = !wantCheck ? savedIssues : (current?.issues ?? checked?.issues ?? savedIssues);

  const kind = data.kind;
  const doc = form.doc;
  const archived = archivedNow;
  const editable = data.can_edit && !archived;
  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, doc: { ...f.doc, [key]: value } }));
  const setPermission = (key: string, value: unknown) =>
    set("permission", { ...(doc.permission as Doc | undefined), [key]: value });
  const permission = (doc.permission as Doc | undefined) ?? {};
  const errorFor = (field: string) =>
    (fields.find((f) => f.field === field) ?? checkFields.find((f) => f.field === field))?.message;
  const inputClass =
    "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-text disabled:opacity-60";

  async function reload() {
    const fresh = await adminFetch<ProofDetail>(`proof/${data.id}`);
    setData(fresh);
    setSavedIssues(fresh.publish_errors);
    router.refresh();
    return fresh;
  }

  async function run(name: string, task: () => Promise<string>) {
    setBusy(name);
    setFields([]);
    setMessage(null);
    try {
      const text = await task();
      setMessage({ tone: "ok", text });
    } catch (err) {
      if (err instanceof AdminError) {
        setFields(err.fields);
        setMessage({
          tone: "error",
          text: err.status === 422 ? "Some details need attention." : err.message,
        });
      } else {
        setMessage({ tone: "error", text: "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    const saved = await adminFetch<{ version: number; publish_errors: FieldIssue[] }>(
      `proof/${data.id}/draft`,
      {
        document: form.doc,
        sites: form.sites,
        version: data.draft_version,
      },
    );
    markSaved();
    setSavedIssues(saved.publish_errors);
    return saved;
  }

  const save = () =>
    run("save", async () => {
      await saveDraft();
      await reload();
      return "Draft saved. Websites keep showing the published version until a reviewer approves the change.";
    });

  // Ask for approval saves unsaved edits first, so one click is enough.
  const submit = () =>
    run("submit", async () => {
      if (dirty) await saveDraft();
      await adminFetch(`proof/${data.id}/submit`, { note });
      setNote("");
      await reload();
      return isOwner
        ? "Approval requested. As an owner you can approve it below, or a reviewer will."
        : "Approval requested. A reviewer other than you approves it before anything is shown.";
    });

  const act = (action: string, body: Record<string, unknown>, done: string, confirm?: string) => () => {
    if (confirm && !window.confirm(confirm)) return;
    return run(action, async () => {
      await adminFetch(`proof/${data.id}/${action}`, body);
      setNote("");
      await reload();
      return done;
    });
  };

  const text = (key: string, label: string, opts: { hint?: string; max?: number; area?: boolean } = {}) => {
    const id = `${uid}-${key}`;
    const error = errorFor(key);
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-text">
          {label}
        </label>
        {opts.area ? (
          <textarea
            id={id}
            rows={4}
            maxLength={opts.max}
            value={str(doc[key])}
            disabled={!editable}
            aria-invalid={Boolean(error)}
            onChange={(e) => set(key, e.target.value)}
            className={cn(inputClass, "mt-2 py-3")}
          />
        ) : (
          <input
            id={id}
            maxLength={opts.max}
            value={str(doc[key])}
            disabled={!editable}
            aria-invalid={Boolean(error)}
            onChange={(e) => set(key, e.target.value)}
            className={cn(inputClass, "mt-2")}
          />
        )}
        {(error || opts.hint) && (
          <p className={cn("mt-1.5 text-sm", error ? "text-danger" : "text-subtle")}>{error ?? opts.hint}</p>
        )}
      </div>
    );
  };

  const check = (checked: boolean, onChange: (v: boolean) => void, label: ReactNode) => (
    <label className="flex items-start gap-3 text-sm text-text">
      <input
        type="checkbox"
        checked={checked}
        disabled={!editable}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-[var(--accent)]"
      />
      <span>{label}</span>
    </label>
  );

  const image = (key: string, label: string, hint: string) => (
    <MediaPicker
      label={label}
      hint={hint}
      value={str(doc[key]) || null}
      media={media}
      disabled={!editable}
      error={errorFor(key)}
      onChange={(id) => set(key, id)}
    />
  );

  const status = STATUS_LABELS[data.status];
  const review = data.review;
  const canDecide = review && data.can_review && (!review.own || isOwner);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (editable && dirty) save();
        }}
        className="space-y-8"
      >
        {!data.can_edit && (
          <p className="rounded-xl border border-line bg-surface-2 p-4 text-sm text-muted">
            Editors with access to FigBud Global and every website this record targets can change it.
          </p>
        )}

        {kind === "organization" && (
          <fieldset className="space-y-5">
            <legend className="font-semibold text-text">Organisation</legend>
            {text("name", "Organisation name", { max: 120 })}
            <div>
              <label htmlFor={`${uid}-rel`} className="block text-sm font-medium text-text">
                Relationship
              </label>
              <select
                id={`${uid}-rel`}
                value={str(doc.relationship) || "customer"}
                disabled={!editable}
                onChange={(e) => set("relationship", e.target.value)}
                className={cn(inputClass, "mt-2")}
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            {text("website", "Website", { hint: "Their https:// address (optional)." })}
            {text("description", "Short description", {
              max: 300,
              area: true,
              hint: "Optional, up to 300 characters.",
            })}
            {/* One approved logo is enough: it's used for every Trusted By display. */}
            {image(
              "logo_id",
              "Approved logo",
              "Pick the logo you'd love us to showcase: their approved file, unaltered, used wherever they're shown.",
            )}
          </fieldset>
        )}

        {kind === "testimonial" && (
          <fieldset className="space-y-5">
            <legend className="font-semibold text-text">Testimonial</legend>
            {text("quote", "Quotation", {
              max: 600,
              area: true,
              hint: "Their approved words, exactly. Never paraphrase or invent.",
            })}
            <div>
              <label htmlFor={`${uid}-org`} className="block text-sm font-medium text-text">
                Organisation from Trusted By
              </label>
              <select
                id={`${uid}-org`}
                value={str(doc.organization_id)}
                disabled={!editable}
                onChange={(e) => set("organization_id", e.target.value || null)}
                className={cn(inputClass, "mt-2")}
              >
                <option value="">None</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title || "Untitled organisation"}
                  </option>
                ))}
              </select>
            </div>
            {!doc.organization_id && text("organization_name", "Or organisation name", { max: 120 })}
            <div className="grid gap-5 sm:grid-cols-2">
              {text("person_name", "Person's name", { max: 80, hint: "Shown only with their approval." })}
              {text("person_title", "Designation", { max: 80 })}
            </div>
            {image("photo_id", "Photograph", "Optional; shown only with their approval.")}
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <label htmlFor={`${uid}-product`} className="block text-sm font-medium text-text">
                  Product
                </label>
                <select
                  id={`${uid}-product`}
                  value={str(doc.product)}
                  disabled={!editable}
                  onChange={(e) => set("product", e.target.value || null)}
                  className={cn(inputClass, "mt-2")}
                >
                  <option value="">None</option>
                  {sites
                    .filter((s) => !s.corporate)
                    .map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>
              {text("industry", "Industry", { max: 60 })}
              {text("country", "Country (ISO code)", { max: 2, hint: "e.g. KE" })}
            </div>
          </fieldset>
        )}

        {kind === "metric" && (
          <fieldset className="space-y-5">
            <legend className="font-semibold text-text">Metric</legend>
            {text("label", "What it measures", { max: 60, hint: "e.g. Payroll processed" })}
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <label htmlFor={`${uid}-value`} className="block text-sm font-medium text-text">
                  Figure
                </label>
                <input
                  id={`${uid}-value`}
                  type="number"
                  min={0}
                  step="any"
                  value={typeof doc.value === "number" ? doc.value : 0}
                  disabled={!editable}
                  onChange={(e) => set("value", Number(e.target.value))}
                  className={cn(inputClass, "mt-2")}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-format`} className="block text-sm font-medium text-text">
                  Shown as
                </label>
                <select
                  id={`${uid}-format`}
                  value={str(doc.format) || "number"}
                  disabled={!editable}
                  onChange={(e) => set("format", e.target.value)}
                  className={cn(inputClass, "mt-2")}
                >
                  <option value="number">Number</option>
                  <option value="currency">Currency</option>
                  <option value="percent">Percentage</option>
                </select>
              </div>
              {doc.format === "currency" && text("currency", "Currency code", { max: 3, hint: "e.g. KES" })}
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              {text("prefix", "Before the number", { max: 4, hint: "e.g. >" })}
              {text("suffix", "After the number", { max: 8, hint: "e.g. +" })}
              <div>
                <label htmlFor={`${uid}-decimals`} className="block text-sm font-medium text-text">
                  Decimals
                </label>
                <input
                  id={`${uid}-decimals`}
                  type="number"
                  min={0}
                  max={2}
                  value={typeof doc.decimals === "number" ? doc.decimals : 0}
                  disabled={!editable}
                  onChange={(e) => set("decimals", Number(e.target.value))}
                  className={cn(inputClass, "mt-2")}
                />
              </div>
            </div>
            {check(
              bool(doc.compact),
              (v) => set("compact", v),
              "Compact notation (1.2M instead of 1,200,000)",
            )}
            {text("source", "Source", { max: 200, hint: "Where the figure comes from; shown with it." })}
            {text("period", "Measurement period", { max: 80, hint: "e.g. Jan–Sep 2026; shown with it." })}
          </fieldset>
        )}

        <fieldset className="space-y-4">
          <legend className="font-semibold text-text">
            {kind === "metric" ? "Verification" : "Permission to publish"}
          </legend>
          {kind === "organization" && (
            <>
              {check(
                bool(permission.relationship_confirmed),
                (v) => setPermission("relationship_confirmed", v),
                "The relationship is confirmed with the organisation",
              )}
              {check(
                bool(permission.display_approved),
                (v) => setPermission("display_approved", v),
                "They approved showing their name and logo publicly",
              )}
            </>
          )}
          {kind === "testimonial" && (
            <>
              {check(
                bool(permission.quote_approved),
                (v) => setPermission("quote_approved", v),
                "They approved this quotation for publication",
              )}
              {check(
                bool(permission.name_approved),
                (v) => setPermission("name_approved", v),
                "They approved showing the person's name and designation",
              )}
              {check(
                bool(permission.photo_approved),
                (v) => setPermission("photo_approved", v),
                "They approved showing the photograph",
              )}
            </>
          )}
          {kind === "metric" &&
            check(
              bool(doc.verified),
              (v) => set("verified", v),
              "I checked this figure against its source for the period stated",
            )}
          {kind !== "metric" && (
            <div>
              <label htmlFor={`${uid}-evidence`} className="block text-sm font-medium text-text">
                Where the approval is recorded
              </label>
              <input
                id={`${uid}-evidence`}
                maxLength={300}
                value={str(permission.evidence)}
                disabled={!editable}
                onChange={(e) => setPermission("evidence", e.target.value)}
                className={cn(inputClass, "mt-2")}
              />
              <p className="mt-1.5 text-sm text-subtle">
                e.g. &ldquo;Signed consent form, 12 Oct 2026&rdquo;. Kept in the Studio, never shown on
                websites.
              </p>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold text-text">Websites</legend>
          <p className="text-sm text-muted">One record, shown on every website you choose, without copies.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {sites.map((site) =>
              check(
                form.sites.includes(site.slug),
                (v) =>
                  setForm((f) => ({
                    ...f,
                    sites: v ? [...f.sites, site.slug].sort() : f.sites.filter((s) => s !== site.slug),
                  })),
                `Show on ${site.name}`,
              ),
            )}
          </div>
          {errorFor("sites") && <p className="text-sm text-danger">{errorFor("sites")}</p>}
        </fieldset>

        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={cn("text-sm", message.tone === "error" ? "text-danger" : "text-accent-strong")}
          >
            {message.text}
          </p>
        )}
        {editable && (
          <ActionButton
            type="submit"
            ready={dirty}
            busy={busy === "save"}
            hint="No changes to save."
            onClick={save}
          >
            Save draft
          </ActionButton>
        )}
      </form>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-line p-5">
          <h2 className="text-sm font-semibold text-text">Status</h2>
          <p className={cn("mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-xs", status.tone)}>
            {status.label}
          </p>
          <p className="mt-2 text-sm text-muted">
            {data.published_sites.length
              ? `Published version ${data.published_number}, shown on ${data.published_sites.join(", ")}${data.active ? "" : " (hidden)"}.`
              : "Not shown on any website."}
          </p>

          <ol aria-label="Publishing progress" className="mt-4 grid gap-1.5 text-sm">
            {[
              { label: "Draft", done: true },
              { label: "Requirements complete", done: issues.length === 0 && form.sites.length > 0 },
              { label: "Approval requested", done: Boolean(review) || data.status === "published" },
              { label: "Published", done: data.status === "published" },
            ].map((step, i, all) => {
              const current = step.done && !all[i + 1]?.done;
              return (
                <li
                  key={step.label}
                  aria-current={current ? "step" : undefined}
                  className={cn("flex items-center gap-2", step.done ? "text-text" : "text-subtle")}
                >
                  {step.done ? (
                    <CircleCheck aria-hidden className="size-4 text-accent-strong" />
                  ) : (
                    <span aria-hidden className="size-4 rounded-full border border-line-strong" />
                  )}
                  <span className={cn(current && "font-medium")}>{step.label}</span>
                  <span className="sr-only">{step.done ? "(done)" : "(to do)"}</span>
                </li>
              );
            })}
          </ol>

          <h3 className="mt-5 text-sm font-medium text-text">Before it can be published</h3>
          {issues.length === 0 && form.sites.length > 0 ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-accent-strong">
              <CircleCheck aria-hidden className="size-4" /> Ready for approval
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.code}`} className="flex gap-2 text-sm text-muted">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                  {issue.message}
                </li>
              ))}
              {form.sites.length === 0 && (
                <li className="flex gap-2 text-sm text-muted">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                  Choose at least one website to show it on.
                </li>
              )}
            </ul>
          )}
          <p aria-live="polite" className="mt-2 text-xs text-subtle">
            {checking
              ? "Checking your changes…"
              : dirty
                ? "Checked as you edit; save to keep your changes."
                : ""}
          </p>

          {review && (
            <p className="mt-5 rounded-xl bg-surface-2 p-3 text-sm text-muted">
              Approval requested by {review.own ? "you" : (review.requested_by ?? "someone")}
              {review.note ? `: “${review.note}”` : "."}
            </p>
          )}

          {!archived && (data.can_edit || data.can_review) && (
            <div className="mt-5 space-y-3">
              <label htmlFor={`${uid}-note`} className="block text-sm font-medium text-text">
                Note
              </label>
              <input
                id={`${uid}-note`}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={inputClass}
              />
              <div className="flex flex-wrap gap-2">
                {data.can_edit && !review && (
                  <ActionButton
                    ready={
                      !checking &&
                      checkFields.length === 0 &&
                      issues.length === 0 &&
                      form.sites.length > 0 &&
                      (dirty || data.status !== "published")
                    }
                    busy={busy === "submit"}
                    hint={
                      checking
                        ? undefined
                        : issues.length || form.sites.length === 0 || checkFields.length
                          ? "Complete the list above first."
                          : !dirty && data.status === "published"
                            ? "Nothing changed since publication."
                            : undefined
                    }
                    title={dirty ? "Saves your changes, then asks for approval." : undefined}
                    onClick={submit}
                  >
                    {dirty ? "Save and ask for approval" : "Ask for approval"}
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
                      onClick={act(
                        "publish",
                        { note },
                        "Published. The chosen websites show it within a minute.",
                      )}
                    >
                      Approve and publish
                    </ActionButton>
                    <ActionButton
                      variant="secondary"
                      ready={Boolean(canDecide)}
                      busy={busy === "reject"}
                      onClick={act("reject", { note }, "Request declined; the draft is kept.")}
                    >
                      Decline
                    </ActionButton>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {data.can_review && (
          <section className="space-y-4 rounded-2xl border border-line p-5">
            <h2 className="text-sm font-semibold text-text">Visibility and order</h2>
            {!archived &&
              check(
                data.active,
                (v) =>
                  void act(
                    "settings",
                    { active: v },
                    v ? "Shown again." : "Hidden from the websites; still published.",
                  )(),
                "Show on websites (switch off to hide without unpublishing)",
              )}
            {!archived && (
              <div>
                <label htmlFor={`${uid}-order`} className="block text-sm font-medium text-text">
                  Display order
                </label>
                <input
                  id={`${uid}-order`}
                  type="number"
                  min={0}
                  max={9999}
                  defaultValue={data.sort_order}
                  onBlur={(e) => {
                    const order = Number(e.target.value);
                    if (order !== data.sort_order)
                      void act("settings", { sort_order: order }, "Order saved.")();
                  }}
                  className={cn(inputClass, "mt-2")}
                />
                <p className="mt-1.5 text-xs text-subtle">Lower numbers come first.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {data.published && (
                <ActionButton
                  variant="secondary"
                  ready
                  busy={busy === "unpublish"}
                  onClick={act("unpublish", {}, "Unpublished.", "Remove it from every website now?")}
                >
                  Unpublish
                </ActionButton>
              )}
              {!data.published && !archived && (
                <ActionButton
                  variant="ghost"
                  ready
                  busy={busy === "archive"}
                  onClick={act("archive", {}, "Archived.")}
                >
                  Archive
                </ActionButton>
              )}
              {archived && (
                <ActionButton
                  variant="secondary"
                  ready
                  busy={busy === "restore"}
                  onClick={act("restore", {}, "Restored as a draft.")}
                >
                  Restore
                </ActionButton>
              )}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-line p-5">
          <h2 className="text-sm font-semibold text-text">Versions</h2>
          {data.versions.length === 0 ? (
            <p className="mt-2 text-sm text-subtle">Not published yet.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {data.versions.map((v) => (
                <li key={v.number} className="text-sm">
                  <span className="font-medium text-text">Version {v.number}</span>
                  <span className="block text-muted">{v.note}</span>
                  <span className="block text-xs text-subtle">
                    {`Approved by ${v.published_by ?? "someone"} · ${new Date(v.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · ${v.sites.join(", ")}`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <p className="text-xs text-subtle">{`Every change is recorded in the activity log. ${KIND_LABELS[kind].lead}`}</p>
      </aside>
    </div>
  );
}
