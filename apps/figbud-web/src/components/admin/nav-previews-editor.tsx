"use client";

import {
  NAV_PREVIEW_ICONS,
  type NavPreviewContent,
  NavPreviewCard,
  type NavPreviewSettings,
  navPreviewIcon,
} from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { sameValue, useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import type { WebsiteSettingsAdmin } from "./website-settings";

export interface NavPreviewLink {
  key: string;
  label: string;
  /** The website's approved wording; used wherever the Studio's text is empty. */
  fallback?: NavPreviewContent;
}

const ICON_LABELS: Record<(typeof NAV_PREVIEW_ICONS)[number], string> = {
  sparkles: "Sparkles",
  compass: "Compass",
  "book-open": "Open book",
  "message-circle": "Message",
  building: "Building",
  users: "People",
  layers: "Layers",
  rocket: "Rocket",
  shield: "Shield",
  chart: "Chart",
  globe: "Globe",
  wallet: "Wallet",
  calendar: "Calendar",
  briefcase: "Briefcase",
  phone: "Phone",
  lightbulb: "Light bulb",
};

/** What the fields hold: empty text rather than nothing. */
type FormItem = { key: string; enabled: boolean; icon: string; headline: string; description: string };
type Form = { enabled: boolean; items: Record<string, FormItem> };

function toForm(settings: NavPreviewSettings | null | undefined, links: NavPreviewLink[]): Form {
  const saved = new Map((settings?.items ?? []).map((item) => [item.key, item]));
  return {
    enabled: settings?.enabled ?? true,
    items: Object.fromEntries(
      links.map((link) => {
        const item = saved.get(link.key);
        return [
          link.key,
          {
            key: link.key,
            enabled: item?.enabled ?? true,
            icon: item?.icon ?? "",
            headline: item?.headline ?? "",
            description: item?.description ?? "",
          },
        ];
      }),
    ),
  };
}

const toSettings = (form: Form): NavPreviewSettings => ({
  enabled: form.enabled,
  items: Object.values(form.items)
    .filter((item) => !item.enabled || item.icon || item.headline.trim() || item.description.trim())
    .map((item) => ({
      key: item.key,
      enabled: item.enabled,
      icon: item.icon || null,
      headline: item.headline.trim() || null,
      description: item.description.trim() || null,
    })),
});

function Switch({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
        checked ? "border-accent bg-accent" : "border-line-strong bg-surface-3",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none",
          checked ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1",
        )}
      />
    </button>
  );
}

/** The card as visitors get it: dark on the light website, light on the dark website. */
function Sample({
  theme,
  content,
  caption,
}: {
  theme: "light" | "dark";
  content: NavPreviewContent;
  caption: string;
}) {
  return (
    <figure className="min-w-0 flex-1">
      <figcaption className="mb-1.5 text-xs text-subtle">{caption}</figcaption>
      <div
        data-theme={theme}
        data-inverse=""
        className="fb-panel rounded-2xl border border-line p-3.5 shadow-[0_12px_30px_-18px_rgb(0_0_0/0.45)]"
      >
        <NavPreviewCard content={content} />
      </div>
    </figure>
  );
}

/**
 * Websites → a website → Navigation → Hover Previews (UI-NAV2). The draft and
 * the published version are both kept in the website's settings (same audit
 * and version check); only the published version ever reaches the website.
 */
export function NavPreviewsEditor({
  slug,
  data,
  links,
  corporate,
}: {
  slug: string;
  data: WebsiteSettingsAdmin;
  links: NavPreviewLink[];
  corporate: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const canEdit = data.can_edit;
  const [form, setForm] = useState<Form>(() =>
    toForm(data.settings.nav_previews_draft ?? data.settings.nav_previews, links),
  );
  const [version, setVersion] = useState(data.version);
  const [published, setPublished] = useState<NavPreviewSettings>(() =>
    toSettings(toForm(data.settings.nav_previews, links)),
  );
  const [hasDraft, setHasDraft] = useState(Boolean(data.settings.nav_previews_draft));
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(canEdit && dirty);

  const current = toSettings(form);
  const unpublished = !sameValue(current, published);
  const setItem = (key: string, patch: Partial<FormItem>) =>
    setForm((f) => ({ ...f, items: { ...f.items, [key]: { ...f.items[key]!, ...patch } } }));

  async function save(kind: "draft" | "publish") {
    setBusy(kind);
    setMessage(null);
    try {
      const saved = await adminFetch<WebsiteSettingsAdmin>(`sites/${slug}/settings`, {
        // The rest of the document is sent back unchanged.
        settings:
          kind === "publish"
            ? { ...data.settings, nav_previews: current, nav_previews_draft: null }
            : { ...data.settings, nav_previews_draft: current },
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
              ? "Published. The menu shows this now."
              : "Published. The website shows this within a few minutes."
            : "Draft saved. Visitors still see the published version.",
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

  const inputClass =
    "mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-text disabled:opacity-60";

  return (
    <div className="mt-8 max-w-5xl space-y-6">
      <section className="fb-panel flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-panel)] p-5 sm:p-6">
        <div className="max-w-2xl">
          <label htmlFor={`${uid}-enabled`} className="font-semibold text-text">
            Show hover previews
          </label>
          <p className="mt-1 text-sm text-muted">
            {form.enabled
              ? "Plain menu links show their card on hover and keyboard focus."
              : "No menu link shows a card. Your wording is kept for when you turn them back on."}
          </p>
        </div>
        <Switch
          id={`${uid}-enabled`}
          label="Show hover previews"
          checked={form.enabled}
          disabled={!canEdit}
          onChange={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
        />
      </section>

      {links.length === 0 && (
        <p className="rounded-2xl border border-line p-5 text-sm text-muted">
          This website&apos;s menu has no links yet. Publish pages marked &quot;Show in navigation&quot;, or
          add links in Navigation, footer & forms.
        </p>
      )}

      <ul className={cn("space-y-4", !form.enabled && "opacity-60")}>
        {links.map((link) => {
          const item = form.items[link.key]!;
          const content: NavPreviewContent = {
            icon: item.icon || link.fallback?.icon || "sparkles",
            headline: item.headline.trim() || link.fallback?.headline || "",
            description: item.description.trim() || link.fallback?.description || "",
          };
          const ChosenIcon = navPreviewIcon(content.icon);
          const showing = form.enabled && item.enabled && Boolean(content.headline);
          return (
            <li
              key={link.key}
              data-preview={link.key}
              className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold text-text">{link.label}</h2>
                <Switch
                  id={`${uid}-${link.key}`}
                  label={`Preview on ${link.label}`}
                  checked={item.enabled}
                  disabled={!canEdit}
                  onChange={() => setItem(link.key, { enabled: !item.enabled })}
                />
              </div>
              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <label htmlFor={`${uid}-${link.key}-h`} className="block text-sm font-medium text-text">
                      Headline
                    </label>
                    <input
                      id={`${uid}-${link.key}-h`}
                      aria-label={`Headline for ${link.label}`}
                      value={item.headline}
                      maxLength={60}
                      disabled={!canEdit}
                      placeholder={link.fallback?.headline ?? "A short, memorable line"}
                      onChange={(e) => setItem(link.key, { headline: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-${link.key}-d`} className="block text-sm font-medium text-text">
                      Description
                    </label>
                    <input
                      id={`${uid}-${link.key}-d`}
                      aria-label={`Description for ${link.label}`}
                      value={item.description}
                      maxLength={120}
                      disabled={!canEdit}
                      placeholder={link.fallback?.description ?? "One concise supporting sentence"}
                      onChange={(e) => setItem(link.key, { description: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-${link.key}-i`} className="block text-sm font-medium text-text">
                      Icon
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span
                        aria-hidden
                        className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong"
                      >
                        <ChosenIcon className="size-5" />
                      </span>
                      <select
                        id={`${uid}-${link.key}-i`}
                        aria-label={`Icon for ${link.label}`}
                        value={item.icon}
                        disabled={!canEdit}
                        onChange={(e) => setItem(link.key, { icon: e.target.value })}
                        className={cn(inputClass, "mt-0")}
                      >
                        <option value="">{link.fallback ? "Approved default" : "Sparkles (default)"}</option>
                        {NAV_PREVIEW_ICONS.map((icon) => (
                          <option key={icon} value={icon}>
                            {ICON_LABELS[icon]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {link.fallback && (
                    <p className="text-xs text-subtle">
                      Empty fields keep the approved wording. Edits show on English pages; other languages
                      keep their own wording.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-4 sm:flex-row lg:flex-col">
                  {content.headline ? (
                    <>
                      <Sample theme="dark" content={content} caption="On the light website" />
                      <Sample theme="light" content={content} caption="On the dark website" />
                    </>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-subtle">
                      Add a headline to show a preview on this link.
                    </p>
                  )}
                  {!showing && content.headline && (
                    <p className="text-xs text-subtle">Hidden from visitors while switched off.</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

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
              See the menu
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
        <p className="text-sm text-subtle">You can view these; a reviewer or owner can change them.</p>
      )}
    </div>
  );
}
