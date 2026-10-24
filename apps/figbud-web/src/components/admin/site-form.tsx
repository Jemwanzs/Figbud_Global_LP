"use client";

import { cn } from "@figbud/ui";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, type FieldError, adminFetch } from "@/lib/admin-client";
import { useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";

import { type AdminSite, CATEGORIES, LIFECYCLE, type SiteStatus, TEMPLATES } from "./site-labels";

interface Form {
  name: string;
  slug: string;
  category: string;
  template: string;
  tagline: string;
  description: string;
  primary_domain: string;
  launch_status: SiteStatus;
  show_on_map: boolean;
}

/** The fields edited as text (inputs, selects, text areas). */
type TextField = Exclude<keyof Form, "show_on_map">;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

const toForm = (site?: AdminSite): Form => ({
  name: site?.name ?? "",
  slug: site?.slug ?? "",
  category: site?.category ?? "hr_workforce",
  template: site?.template ?? "hr",
  tagline: site?.tagline ?? "",
  description: site?.description ?? "",
  primary_domain: site?.primary_domain ?? "",
  launch_status: "coming_soon",
  show_on_map: site?.show_on_map ?? true,
});

/**
 * Creates a website (guided: identity, category and template, launch status)
 * or edits an existing website's settings. New websites always start as
 * drafts; the chosen launch status becomes a request someone approves.
 */
export function SiteForm({ site, canEdit }: { site?: AdminSite; canEdit: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [form, setForm] = useState<Form>(() => toForm(site));
  const [slugTouched, setSlugTouched] = useState(Boolean(site));
  const [templateTouched, setTemplateTouched] = useState(Boolean(site));
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(canEdit && dirty);
  const corporate = site?.kind === "corporate";
  // Creating needs the required fields; saving needs an actual change.
  const creatable = form.name.trim() !== "" && /^[a-z0-9]+([_-][a-z0-9]+)*$/.test(form.slug);
  const category = CATEGORIES.find((c) => c.value === form.category);
  const errorFor = (field: string) => fields.find((f) => f.field === field)?.message;

  const set = (key: TextField) => (value: string) =>
    setForm((f) => {
      const next = { ...f, [key]: value } as Form;
      if (key === "name" && !slugTouched) next.slug = slugify(value);
      if (key === "category" && !templateTouched)
        next.template = CATEGORIES.find((c) => c.value === value)?.template ?? f.template;
      return next;
    });

  async function submit() {
    setBusy(true);
    setFields([]);
    setMessage(null);
    const body = {
      name: form.name,
      category: form.category,
      template: form.template,
      tagline: form.tagline || null,
      description: form.description || null,
      primary_domain: form.primary_domain || null,
      ...(site
        ? { version: site.version, show_on_map: form.show_on_map }
        : { slug: form.slug, launch_status: form.launch_status }),
    };
    try {
      const saved = await adminFetch<AdminSite>(site ? `sites/${site.slug}` : "sites", body);
      markSaved();
      if (site) {
        setMessage({ tone: "ok", text: "Settings saved." });
        router.refresh();
      } else {
        router.push(`/admin/sites/${saved.slug}`);
      }
    } catch (err) {
      if (err instanceof AdminError) {
        setFields(err.fields);
        setMessage({
          tone: "error",
          text:
            err.status === 409
              ? "Someone else changed this website. Reload to see their changes, then try again."
              : err.message,
        });
      } else {
        setMessage({ tone: "error", text: "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  const field = (name: TextField, label: string, input: React.ReactNode, hint?: string) => {
    const error = errorFor(name);
    return (
      <div>
        <label htmlFor={`${uid}-${name}`} className="block text-sm font-medium text-text">
          {label}
        </label>
        {input}
        {error ? (
          <p id={`${uid}-${name}-error`} className="mt-1.5 text-sm text-danger">
            {error}
          </p>
        ) : (
          hint && <p className="mt-1.5 text-sm text-subtle">{hint}</p>
        )}
      </div>
    );
  };

  const inputProps = (name: TextField) => ({
    id: `${uid}-${name}`,
    value: form[name],
    disabled: !canEdit || busy,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(name)(e.target.value),
    "aria-invalid": errorFor(name) ? true : undefined,
    "aria-describedby": errorFor(name) ? `${uid}-${name}-error` : undefined,
    className:
      "mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-text disabled:opacity-60",
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (canEdit) submit();
      }}
      className="space-y-8"
    >
      <fieldset className="space-y-6">
        <legend className="font-semibold text-text">{site ? "Identity" : "1 · Name the website"}</legend>
        {field("name", "Website name", <input {...inputProps("name")} maxLength={80} />)}
        {!site &&
          field(
            "slug",
            "Identifier",
            <input
              {...inputProps("slug")}
              maxLength={40}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug")(e.target.value);
              }}
              className={cn(inputProps("slug").className, "font-mono text-sm")}
            />,
            "Lower-case letters, numbers, - or _. It can't be changed later.",
          )}
        {field(
          "tagline",
          "Tagline",
          <input {...inputProps("tagline")} maxLength={160} />,
          `${form.tagline.length}/160`,
        )}
        {field(
          "description",
          "Short description",
          <textarea
            {...inputProps("description")}
            rows={3}
            maxLength={600}
            className={cn(inputProps("description").className, "py-3")}
          />,
          `${form.description.length}/600`,
        )}
        {field(
          "primary_domain",
          "Domain",
          <input
            {...inputProps("primary_domain")}
            placeholder="product.example.com"
            className={cn(inputProps("primary_domain").className, "font-mono text-sm")}
          />,
          "Optional. Just the host name, without https://. Connecting the domain itself is done in hosting.",
        )}
      </fieldset>

      {!corporate && (
        <fieldset className="space-y-6">
          <legend className="font-semibold text-text">
            {site ? "Category & template" : "2 · Category & template"}
          </legend>
          <div role="radiogroup" aria-label="Product category" className="grid gap-3 sm:grid-cols-2">
            {CATEGORIES.map((c) => {
              const selected = form.category === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!canEdit || busy}
                  onClick={() => set("category")(c.value)}
                  className={cn(
                    "flex min-h-11 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-start text-sm transition-colors disabled:opacity-60",
                    selected
                      ? "border-accent bg-accent-soft text-text"
                      : "border-line text-muted hover:border-line-strong",
                  )}
                >
                  {c.label}
                  {selected && <Check aria-hidden className="size-4 text-accent" />}
                </button>
              );
            })}
          </div>
          {field(
            "template",
            "Starting template",
            <select
              {...inputProps("template")}
              onChange={(e) => {
                setTemplateTouched(true);
                set("template")(e.target.value);
              }}
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>,
          )}
          {!site && category && (
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <p className="text-sm font-medium text-text">Suggested pages</p>
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Suggested pages">
                {category.pages.map((p) => (
                  <li key={p} className="rounded-full border border-line px-3 py-1 text-xs text-muted">
                    {p}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-subtle">
                Pages are built in the page builder once it ships; nothing is published from here.
              </p>
            </div>
          )}
        </fieldset>
      )}

      {site && !corporate && (
        <fieldset className="space-y-3">
          <legend className="font-semibold text-text">On the FigBud Global website</legend>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={form.show_on_map}
              disabled={!canEdit || busy}
              onChange={(e) => setForm((f) => ({ ...f, show_on_map: e.target.checked }))}
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
            />
            <span>
              Show on the Africa expansion map
              <span className="mt-0.5 block text-subtle">
                Only while the website is listed (coming soon, beta or active). Takes effect when saved.
              </span>
            </span>
          </label>
        </fieldset>
      )}

      {!site && (
        <fieldset className="space-y-3">
          <legend className="font-semibold text-text">3 · Launch status</legend>
          <p className="text-sm text-muted">
            Every website starts as a private draft. The status you pick is sent for approval; it only changes
            how the website is marketed, never whether the product itself is switched on.
          </p>
          <div role="radiogroup" aria-label="Launch status" className="grid gap-3 sm:grid-cols-3">
            {LIFECYCLE.filter((s) => ["coming_soon", "beta", "active"].includes(s.value)).map((s) => {
              const selected = form.launch_status === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  onClick={() => set("launch_status")(s.value)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-start transition-colors disabled:opacity-60",
                    selected ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="block text-sm font-medium text-text">{s.label}</span>
                  <span className="mt-0.5 block text-xs text-subtle">{s.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-4">
          <ActionButton
            type="submit"
            ready={site ? dirty : creatable}
            busy={busy}
            hint={site ? "Nothing to save" : "Enter a name and a valid identifier"}
          >
            {site ? "Save settings" : "Create draft website"}
          </ActionButton>
          {message && (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
