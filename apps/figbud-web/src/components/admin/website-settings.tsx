"use client";

import type { SiteLink, WebsiteSettings } from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, type FieldError, adminFetch } from "@/lib/admin-client";
import { useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";

export interface WebsiteSettingsAdmin {
  settings: WebsiteSettings;
  version: number;
  corporate: boolean;
  can_edit: boolean;
  /** Published pages, offered as link destinations. */
  pages: { path: string; title: string; show_in_nav: boolean }[];
}

const MAX_LINKS = 8;

/** Normalises what the API sends (missing parts mean the defaults). */
const toForm = (s: Partial<WebsiteSettings>): WebsiteSettings => ({
  navigation: { mode: s.navigation?.mode ?? "pages", items: s.navigation?.items ?? [] },
  footer: { note: s.footer?.note ?? "", links: s.footer?.links ?? [] },
  enquiries: { open: s.enquiries?.open ?? true, closed_message: s.enquiries?.closed_message ?? "" },
});

/**
 * A website's navigation, footer and enquiry form (P7-E2). Reviewers change
 * them directly; changes are audited and reach the website within minutes.
 * Closing enquiries is enforced by the API too, and keeps every enquiry
 * already received.
 */
export function WebsiteSettingsForm({
  slug,
  name,
  data,
}: {
  slug: string;
  name: string;
  data: WebsiteSettingsAdmin;
}) {
  const router = useRouter();
  const uid = useId();
  const canEdit = data.can_edit;
  const [form, setForm] = useState<WebsiteSettings>(() => toForm(data.settings));
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(canEdit && dirty);
  const errorFor = (field: string) => fields.filter((f) => f.field === field).map((f) => f.message)[0];
  const disabled = !canEdit || busy;
  const closing = data.settings.enquiries?.open !== false && !form.enquiries.open;

  async function save() {
    if (
      closing &&
      !window.confirm(`Stop taking enquiries for ${name}? The form and its buttons close at once.`)
    )
      return;
    setBusy(true);
    setFields([]);
    setMessage(null);
    try {
      await adminFetch(`sites/${slug}/settings`, { settings: form, version: data.version });
      markSaved();
      setMessage({ tone: "ok", text: "Saved. The website picks up the change within a few minutes." });
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
    "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-text disabled:opacity-60";

  /** An editable, reorderable list of links. */
  const links = (key: "navigation" | "footer", list: SiteLink[], legend: string, field: string) => {
    const update = (next: SiteLink[]) =>
      setForm((f) =>
        key === "navigation"
          ? { ...f, navigation: { ...f.navigation, items: next } }
          : { ...f, footer: { ...f.footer, links: next } },
      );
    const listId = `${uid}-${key}-pages`;
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-text">{legend}</p>
        {list.length === 0 && <p className="text-sm text-subtle">No links yet.</p>}
        <ol className="space-y-3">
          {list.map((link, i) => (
            <li
              key={i}
              className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-center"
            >
              <input
                aria-label={`${legend}: link ${i + 1} label`}
                placeholder="Label"
                maxLength={40}
                value={link.label}
                disabled={disabled}
                onChange={(e) => update(list.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
                className={inputClass}
              />
              <input
                aria-label={`${legend}: link ${i + 1} address`}
                placeholder="/platform or https://…"
                list={listId}
                value={link.href}
                disabled={disabled}
                onChange={(e) => update(list.map((l, j) => (j === i ? { ...l, href: e.target.value } : l)))}
                className={cn(inputClass, "font-mono text-sm")}
              />
              <div className="flex gap-1">
                {[
                  { label: "Move up", Icon: ArrowUp, to: i - 1 },
                  { label: "Move down", Icon: ArrowDown, to: i + 1 },
                ].map(({ label, Icon, to }) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={`${label}: ${link.label || `link ${i + 1}`}`}
                    disabled={disabled || to < 0 || to >= list.length}
                    onClick={() => {
                      const next = [...list];
                      [next[i], next[to]] = [next[to]!, next[i]!];
                      update(next);
                    }}
                    className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
                  >
                    <Icon aria-hidden className="size-4" />
                  </button>
                ))}
                <button
                  type="button"
                  aria-label={`Remove ${link.label || `link ${i + 1}`}`}
                  disabled={disabled}
                  onClick={() => update(list.filter((_, j) => j !== i))}
                  className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-40"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <datalist id={listId}>
          {data.pages.map((p) => (
            <option key={p.path} value={p.path}>
              {p.title}
            </option>
          ))}
        </datalist>
        {errorFor(field) && <p className="text-sm text-danger">{errorFor(field)}</p>}
        {canEdit && list.length < MAX_LINKS && (
          <button
            type="button"
            disabled={busy}
            onClick={() => update([...list, { label: "", href: "" }])}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm text-text hover:border-line-strong"
          >
            <Plus aria-hidden className="size-4" /> Add link
            <span className="sr-only"> to {legend.toLowerCase()}</span>
          </button>
        )}
      </div>
    );
  };

  const navPages = data.pages.filter((p) => p.path !== "/" && p.show_in_nav);

  return (
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
          Reviewers and owners change these settings. You can see what the website shows.
        </p>
      )}

      <fieldset className="space-y-5">
        <legend className="font-semibold text-text">Enquiries</legend>
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line p-5">
          <div className="max-w-xl">
            <p id={`${uid}-enq`} className="font-medium text-text">
              {form.enquiries.open ? "Taking enquiries" : "Not taking enquiries"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {data.corporate
                ? "The corporate website always takes enquiries."
                : "When closed, the website's enquiry button disappears and the contact form refuses this product. Enquiries already received are kept."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.enquiries.open}
            aria-labelledby={`${uid}-enq`}
            disabled={disabled || data.corporate}
            onClick={() => setForm((f) => ({ ...f, enquiries: { ...f.enquiries, open: !f.enquiries.open } }))}
            className={cn(
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
              form.enquiries.open ? "border-accent bg-accent" : "border-line-strong bg-surface-3",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none",
                form.enquiries.open ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1",
              )}
            />
          </button>
        </div>
        {!data.corporate && (
          <div>
            <label htmlFor={`${uid}-closed`} className="block text-sm font-medium text-text">
              Message while closed
            </label>
            <textarea
              id={`${uid}-closed`}
              rows={2}
              maxLength={300}
              value={form.enquiries.closed_message ?? ""}
              disabled={disabled}
              placeholder="Please check back soon, or ask us about another FigBud product."
              onChange={(e) =>
                setForm((f) => ({ ...f, enquiries: { ...f.enquiries, closed_message: e.target.value } }))
              }
              className={cn(inputClass, "mt-2 py-3")}
            />
            <p className="mt-1.5 text-sm text-subtle">
              Optional. Shown on the contact form instead of this product.
            </p>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-semibold text-text">Navigation</legend>
        <div role="radiogroup" aria-label="Menu" className="grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                value: "pages",
                label: "The website's pages",
                hint: "Published pages marked “Show in navigation”, in page order.",
              },
              {
                value: "custom",
                label: "Links I choose",
                hint: "Up to 8 links, to pages or other https:// addresses.",
              },
            ] as const
          ).map((o) => {
            const selected = form.navigation.mode === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => setForm((f) => ({ ...f, navigation: { ...f.navigation, mode: o.value } }))}
                className={cn(
                  "rounded-xl border px-4 py-3 text-start transition-colors disabled:opacity-60",
                  selected ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong",
                )}
              >
                <span className="block text-sm font-medium text-text">{o.label}</span>
                <span className="mt-0.5 block text-xs text-subtle">{o.hint}</span>
              </button>
            );
          })}
        </div>
        {form.navigation.mode === "pages" ? (
          <p className="text-sm text-muted">
            {navPages.length
              ? `Shown now: ${navPages.map((p) => p.title).join(" · ")}`
              : "No published pages are marked for navigation yet."}
          </p>
        ) : (
          links("navigation", form.navigation.items, "Menu links", "navigation.items")
        )}
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-semibold text-text">Footer</legend>
        <div>
          <label htmlFor={`${uid}-note`} className="block text-sm font-medium text-text">
            Footer note
          </label>
          <input
            id={`${uid}-note`}
            maxLength={200}
            value={form.footer.note ?? ""}
            disabled={disabled}
            placeholder="Defaults to the website's tagline"
            onChange={(e) => setForm((f) => ({ ...f, footer: { ...f.footer, note: e.target.value } }))}
            className={cn(inputClass, "mt-2")}
          />
          {errorFor("footer.note") && <p className="mt-1.5 text-sm text-danger">{errorFor("footer.note")}</p>}
        </div>
        {links("footer", form.footer.links, "Footer links", "footer.links")}
        <p className="text-sm text-subtle">
          Without footer links, the footer repeats the menu. FigBud Global&apos;s About, Privacy, Terms and
          Cookie links are always shown.
        </p>
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
  );
}
