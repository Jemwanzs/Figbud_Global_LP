"use client";

import {
  type FooterSocialNetwork,
  SOCIAL_NAMES,
  type SiteFooterSettings,
  type SiteLink,
} from "@figbud/site-kit";
import { cn, fieldClasses } from "@figbud/ui";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, type FieldError, adminFetch } from "@/lib/admin-client";
import { sameValue, useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { Switch } from "./nav-previews-editor";
import type { WebsiteSettingsAdmin } from "./website-settings";

const MAX_GROUPS = 3;
const MAX_LINKS = 8;
const MAX_SOCIAL = 8;
const NETWORKS = Object.keys(SOCIAL_NAMES) as FooterSocialNetwork[];

/** What the fields hold: empty text rather than nothing. */
interface Form {
  hidden: boolean;
  tagline: string;
  note: string;
  cta: { show: boolean; heading: string; body: string; label: string; href: string };
  groups: { title: string; links: SiteLink[] }[];
  email: string;
  phone: string;
  social: { network: FooterSocialNetwork; href: string }[];
  hideSocial: boolean;
  /** The older single list, kept as it was until groups replace it. */
  links: SiteLink[];
}

function toForm(f: SiteFooterSettings | null | undefined): Form {
  return {
    hidden: f?.hidden ?? false,
    tagline: f?.tagline ?? "",
    note: f?.note ?? "",
    cta: {
      show: f?.cta?.show ?? true,
      heading: f?.cta?.heading ?? "",
      body: f?.cta?.body ?? "",
      label: f?.cta?.label ?? "",
      href: f?.cta?.href ?? "",
    },
    groups: (f?.groups ?? []).map((g) => ({ title: g.title, links: g.links.map((l) => ({ ...l })) })),
    email: f?.contact?.email ?? "",
    phone: f?.contact?.phone ?? "",
    social: (f?.social ?? []).map((s) => ({ ...s })),
    hideSocial: f?.hide_social_icons ?? false,
    links: f?.links ?? [],
  };
}

const text = (v: string) => v.trim() || null;

function toSettings(form: Form): SiteFooterSettings {
  return {
    hidden: form.hidden,
    tagline: text(form.tagline),
    note: text(form.note),
    cta: {
      show: form.cta.show,
      heading: text(form.cta.heading),
      body: text(form.cta.body),
      label: text(form.cta.label),
      href: text(form.cta.href),
    },
    groups: form.groups,
    contact: { email: text(form.email), phone: text(form.phone) },
    social: form.social,
    hide_social_icons: form.hideSocial,
    // Groups replace the older list, so it isn't shown twice.
    links: form.groups.length ? [] : form.links,
  };
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * Websites → a website → Footer (owner's brief, 7 Nov 2026). Like Hover
 * Previews, the draft and the published footer are both kept in the
 * website's settings (same audit and version check); only the published
 * footer ever reaches the website.
 */
export function FooterEditor({
  slug,
  name,
  data,
  defaults,
}: {
  slug: string;
  name: string;
  data: WebsiteSettingsAdmin;
  /** The website's built-in wording, shown where a field is empty. */
  defaults: { tagline: string; note: string; ctaHeading: string; ctaBody: string; ctaLabel: string };
}) {
  const router = useRouter();
  const uid = useId();
  const canEdit = data.can_edit;
  const corporate = data.corporate;
  const [form, setForm] = useState<Form>(() => toForm(data.settings.footer_draft ?? data.settings.footer));
  const [version, setVersion] = useState(data.version);
  const [published, setPublished] = useState<SiteFooterSettings>(() =>
    toSettings(toForm(data.settings.footer)),
  );
  const [hasDraft, setHasDraft] = useState(Boolean(data.settings.footer_draft));
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(canEdit && dirty);
  const disabled = !canEdit || busy !== null;
  const current = toSettings(form);
  const unpublished = !sameValue(current, published);
  const errorFor = (prefix: string) => fields.find((f) => f.field.startsWith(prefix))?.message;

  async function save(kind: "draft" | "publish") {
    setBusy(kind);
    setMessage(null);
    setFields([]);
    try {
      const saved = await adminFetch<WebsiteSettingsAdmin>(`sites/${slug}/settings`, {
        // The rest of the document is sent back unchanged.
        settings:
          kind === "publish"
            ? { ...data.settings, footer: current, footer_draft: null }
            : { ...data.settings, footer_draft: current },
        version,
      });
      setVersion(saved.version);
      setHasDraft(kind === "draft");
      if (kind === "publish") setPublished(current);
      markSaved();
      setMessage({
        tone: "ok",
        text:
          kind === "publish"
            ? corporate
              ? "Published. The footer shows this now."
              : "Published. The website shows this within a few minutes."
            : "Draft saved. Visitors still see the published footer.",
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

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setCta = (patch: Partial<Form["cta"]>) => setForm((f) => ({ ...f, cta: { ...f.cta, ...patch } }));
  const setGroup = (i: number, patch: Partial<Form["groups"][number]>) =>
    setForm((f) => ({ ...f, groups: f.groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  const input = fieldClasses("mt-1.5 min-h-11 px-3.5");
  const small = fieldClasses("min-h-11 px-3");
  const pageOptions = (
    <datalist id={`${uid}-pages`}>
      {data.pages.map((p) => (
        <option key={p.path} value={p.path}>
          {p.title}
        </option>
      ))}
    </datalist>
  );
  const iconButton =
    "grid size-11 shrink-0 place-items-center rounded-xl border border-line text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40";

  function field(
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: { max: number; placeholder?: string; hint?: string; error?: string; list?: boolean; type?: string },
  ) {
    return (
      <div>
        <label htmlFor={`${uid}-${id}`} className="block text-sm font-medium text-text">
          {label}
        </label>
        <input
          id={`${uid}-${id}`}
          type={opts.type ?? "text"}
          value={value}
          maxLength={opts.max}
          disabled={disabled}
          placeholder={opts.placeholder}
          list={opts.list ? `${uid}-pages` : undefined}
          aria-invalid={opts.error ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={input}
        />
        {opts.hint && <p className="mt-1 text-xs text-subtle">{opts.hint}</p>}
        {opts.error && <p className="mt-1 text-sm text-danger">{opts.error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-5xl space-y-6">
      {pageOptions}
      <section className="fb-panel flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-panel)] p-5 sm:p-6">
        <div className="max-w-2xl">
          <label htmlFor={`${uid}-shown`} className="font-semibold text-text">
            Show the footer&apos;s columns
          </label>
          <p className="mt-1 text-sm text-muted">
            {form.hidden
              ? "Only the copyright and the legal links (with the cookie settings) show. Your content is kept."
              : "The call to action, the logo with its tagline and description, and the link columns show."}
          </p>
        </div>
        <Switch
          id={`${uid}-shown`}
          label="Show the footer's columns"
          checked={!form.hidden}
          disabled={!canEdit}
          onChange={() => set({ hidden: !form.hidden })}
        />
      </section>

      <section className="fb-panel space-y-4 rounded-[var(--radius-panel)] p-5 sm:p-6">
        <h2 className="font-semibold text-text">Logo column</h2>
        {field("tagline", "Tagline", form.tagline, (v) => set({ tagline: v }), {
          max: 80,
          placeholder: defaults.tagline,
          error: errorFor("footer.tagline"),
        })}
        <div>
          <label htmlFor={`${uid}-note`} className="block text-sm font-medium text-text">
            Description
          </label>
          <textarea
            id={`${uid}-note`}
            value={form.note}
            maxLength={280}
            rows={3}
            disabled={disabled}
            placeholder={defaults.note}
            aria-invalid={errorFor("footer.note") ? true : undefined}
            onChange={(e) => set({ note: e.target.value })}
            className={fieldClasses("mt-1.5 min-h-24 resize-y px-3.5 py-2.5")}
          />
          {errorFor("footer.note") && <p className="mt-1 text-sm text-danger">{errorFor("footer.note")}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("email", "Contact email (optional)", form.email, (v) => set({ email: v }), {
            max: 120,
            type: "email",
            placeholder: "hello@example.com",
            error: errorFor("footer.contact.email"),
          })}
          {field("phone", "Contact phone (optional)", form.phone, (v) => set({ phone: v }), {
            max: 24,
            type: "tel",
            placeholder: "+254 798 993 404",
            error: errorFor("footer.contact.phone"),
          })}
        </div>
        {corporate && (
          <p className="text-xs text-subtle">
            Empty fields keep the approved wording. Text shows on English pages; other languages keep their
            own wording. Contact details and profiles show in every language.
          </p>
        )}
      </section>

      <section className="fb-panel space-y-4 rounded-[var(--radius-panel)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-text">Call to action above the footer</h2>
            <p className="mt-1 text-sm text-muted">
              A contrasting panel. Pages that already end with their own call to action don&apos;t show it, so
              two never stack.
            </p>
          </div>
          <Switch
            id={`${uid}-cta`}
            label="Show the call to action"
            checked={form.cta.show}
            disabled={!canEdit}
            onChange={() => setCta({ show: !form.cta.show })}
          />
        </div>
        <div className={cn("grid gap-4 sm:grid-cols-2", !form.cta.show && "opacity-60")}>
          {field("cta-heading", "Heading", form.cta.heading, (v) => setCta({ heading: v }), {
            max: 80,
            placeholder: defaults.ctaHeading,
            error: errorFor("footer.cta.heading"),
          })}
          {field("cta-label", "Button label", form.cta.label, (v) => setCta({ label: v }), {
            max: 32,
            placeholder: defaults.ctaLabel,
            error: errorFor("footer.cta.label"),
          })}
          <div className="sm:col-span-2">
            {field("cta-body", "Description", form.cta.body, (v) => setCta({ body: v }), {
              max: 200,
              placeholder: defaults.ctaBody,
              error: errorFor("footer.cta.body"),
            })}
          </div>
          <div className="sm:col-span-2">
            {field("cta-href", "Button goes to", form.cta.href, (v) => setCta({ href: v }), {
              max: 200,
              list: true,
              placeholder: corporate ? "/products" : "/contact?kind=demo_request#enquire",
              hint: "A page path on this website, or an https:// address.",
              error: errorFor("footer.cta.href"),
            })}
          </div>
        </div>
        {!corporate && !(form.cta.heading.trim() && form.cta.label.trim() && form.cta.href.trim()) && (
          <p className="text-xs text-subtle">
            Shown once it has a heading, a button label and a destination.
          </p>
        )}
      </section>

      <section className="fb-panel space-y-4 rounded-[var(--radius-panel)] p-5 sm:p-6">
        <div>
          <h2 className="font-semibold text-text">Link groups</h2>
          <p className="mt-1 text-sm text-muted">
            Up to {MAX_GROUPS} titled columns, in order.{" "}
            {corporate
              ? "On English pages they replace Navigate; Products and Legal & support always show."
              : "Legal & Support, with the privacy, terms and cookie pages and the cookie settings, always shows after them."}
          </p>
        </div>
        {form.groups.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-subtle">
            {corporate
              ? "No groups: the footer shows Navigate (Home, About, Products, Blog, Contact)."
              : form.links.length
                ? `No groups yet: the footer shows the older list of ${form.links.length} link${form.links.length === 1 ? "" : "s"} as one group.`
                : "No groups: the footer repeats the menu."}
          </p>
        )}
        <ol className="space-y-4">
          {form.groups.map((group, gi) => (
            <li key={gi} data-footer-group={gi} className="rounded-2xl border border-line p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`${uid}-g${gi}`} className="block text-sm font-medium text-text">
                    Group title
                  </label>
                  <input
                    id={`${uid}-g${gi}`}
                    value={group.title}
                    maxLength={30}
                    disabled={disabled}
                    onChange={(e) => setGroup(gi, { title: e.target.value })}
                    className={input}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Move ${group.title || "group"} earlier`}
                  disabled={disabled || gi === 0}
                  onClick={() => set({ groups: move(form.groups, gi, gi - 1) })}
                  className={iconButton}
                >
                  <ArrowUp aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${group.title || "group"} later`}
                  disabled={disabled || gi === form.groups.length - 1}
                  onClick={() => set({ groups: move(form.groups, gi, gi + 1) })}
                  className={iconButton}
                >
                  <ArrowDown aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${group.title || "group"}`}
                  disabled={disabled}
                  onClick={() => set({ groups: form.groups.filter((_, j) => j !== gi) })}
                  className={iconButton}
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </div>
              <ul className="mt-3 space-y-2">
                {group.links.map((link, li) => {
                  const patch = (p: Partial<SiteLink>) =>
                    setGroup(gi, { links: group.links.map((l, k) => (k === li ? { ...l, ...p } : l)) });
                  return (
                    <li key={li} className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label={`Label of link ${li + 1} in ${group.title || "this group"}`}
                        value={link.label}
                        maxLength={40}
                        disabled={disabled}
                        placeholder="Label"
                        onChange={(e) => patch({ label: e.target.value })}
                        className={cn(small, "w-full sm:w-48")}
                      />
                      <input
                        aria-label={`Destination of link ${li + 1} in ${group.title || "this group"}`}
                        value={link.href}
                        maxLength={200}
                        disabled={disabled}
                        list={`${uid}-pages`}
                        placeholder="/platform or https://…"
                        onChange={(e) => patch({ href: e.target.value })}
                        className={cn(small, "min-w-0 flex-1")}
                      />
                      <button
                        type="button"
                        aria-label={`Move ${link.label || "link"} up`}
                        disabled={disabled || li === 0}
                        onClick={() => setGroup(gi, { links: move(group.links, li, li - 1) })}
                        className={iconButton}
                      >
                        <ArrowUp aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${link.label || "link"} down`}
                        disabled={disabled || li === group.links.length - 1}
                        onClick={() => setGroup(gi, { links: move(group.links, li, li + 1) })}
                        className={iconButton}
                      >
                        <ArrowDown aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${link.label || "link"}`}
                        disabled={disabled}
                        onClick={() => setGroup(gi, { links: group.links.filter((_, k) => k !== li) })}
                        className={iconButton}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                disabled={disabled || group.links.length >= MAX_LINKS}
                onClick={() => setGroup(gi, { links: [...group.links, { label: "", href: "" }] })}
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-accent-strong hover:bg-surface-2 disabled:opacity-40"
              >
                <Plus aria-hidden className="size-4" />
                Add a link to {group.title || "this group"}
              </button>
            </li>
          ))}
        </ol>
        {errorFor("footer.groups") && <p className="text-sm text-danger">{errorFor("footer.groups")}</p>}
        <button
          type="button"
          disabled={disabled || form.groups.length >= MAX_GROUPS}
          onClick={() =>
            set({
              groups: [
                ...form.groups,
                // A first group starts from the older list, so nothing is lost.
                form.groups.length === 0 && form.links.length
                  ? { title: "Explore", links: form.links.map((l) => ({ ...l })) }
                  : { title: "", links: [{ label: "", href: "" }] },
              ],
            })
          }
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-medium text-text hover:bg-surface-2 disabled:opacity-40"
        >
          <Plus aria-hidden className="size-4" />
          Add a group
        </button>
      </section>

      <section className="fb-panel space-y-4 rounded-[var(--radius-panel)] p-5 sm:p-6">
        <div>
          <h2 className="font-semibold text-text">Social profiles</h2>
          <p className="mt-1 text-sm text-muted">
            Official, verified profiles and app store pages of {name} only, shown as icons in the footer.
            Leave the address empty to show the icon without a link for now: it becomes a link (opening in a
            new tab) as soon as the address is added. With none listed, Facebook, Instagram, X and LinkedIn
            show without links.
          </p>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm text-text">
          <input
            type="checkbox"
            checked={!form.hideSocial}
            disabled={disabled}
            onChange={() => set({ hideSocial: !form.hideSocial })}
            className="size-5 accent-[var(--action)]"
          />
          Show social icons in the footer
        </label>
        <ul className="space-y-2">
          {form.social.map((profile, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`Network of profile ${i + 1}`}
                value={profile.network}
                disabled={disabled}
                onChange={(e) =>
                  set({
                    social: form.social.map((s, j) =>
                      j === i ? { ...s, network: e.target.value as FooterSocialNetwork } : s,
                    ),
                  })
                }
                className={cn(small, "w-full sm:w-40")}
              >
                {NETWORKS.map((n) => (
                  <option key={n} value={n}>
                    {SOCIAL_NAMES[n]}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Address of the ${SOCIAL_NAMES[profile.network]} profile`}
                value={profile.href}
                maxLength={200}
                disabled={disabled}
                placeholder="https://… (optional for now)"
                onChange={(e) =>
                  set({ social: form.social.map((s, j) => (j === i ? { ...s, href: e.target.value } : s)) })
                }
                className={cn(small, "min-w-0 flex-1")}
              />
              <button
                type="button"
                aria-label={`Remove the ${SOCIAL_NAMES[profile.network]} profile`}
                disabled={disabled}
                onClick={() => set({ social: form.social.filter((_, j) => j !== i) })}
                className={iconButton}
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        {errorFor("footer.social") && <p className="text-sm text-danger">{errorFor("footer.social")}</p>}
        <button
          type="button"
          disabled={disabled || form.social.length >= MAX_SOCIAL}
          onClick={() => {
            const free = NETWORKS.find((n) => !form.social.some((s) => s.network === n)) ?? "linkedin";
            set({ social: [...form.social, { network: free, href: "" }] });
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-medium text-text hover:bg-surface-2 disabled:opacity-40"
        >
          <Plus aria-hidden className="size-4" />
          Add a profile
        </button>
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
            ready={unpublished || hasDraft}
            busy={busy === "publish"}
            hint={busy ? undefined : "Nothing to publish"}
            onClick={() => save("publish")}
          >
            Publish
          </ActionButton>
          {corporate && (
            <a
              href="/en"
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-text"
            >
              See the footer
              <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
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
        <p className="text-sm text-subtle">You can view this; a reviewer or owner can change it.</p>
      )}
    </div>
  );
}
