"use client";

import {
  type BandTone,
  HOME_SECTIONS,
  type HomeSection,
  type SectionThemes,
  sectionTones,
} from "@figbud/site-kit";
import { cn, fieldClasses } from "@figbud/ui";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { sameValue, useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import type { WebsiteSettingsAdmin } from "./website-settings";

type Choice = BandTone | "auto";

const ALL = HOME_SECTIONS.map((s) => s.key);

const clean = (themes: Partial<Record<string, BandTone>> | null | undefined): SectionThemes =>
  Object.fromEntries(
    Object.entries(themes ?? {}).filter(([key]) => (ALL as readonly string[]).includes(key)),
  ) as SectionThemes;

/** The page's bands in one global theme, as a strip: dark or light swatches in order. */
function Strip({ theme, tones }: { theme: "dark" | "light"; tones: Partial<Record<HomeSection, BandTone>> }) {
  const dark = (tone: BandTone) => (theme === "dark") === (tone === "follow");
  const rows: { label: string; isDark: boolean }[] = [
    { label: "Hero (follows the global theme)", isDark: theme === "dark" },
    ...HOME_SECTIONS.map((s) => ({ label: s.label, isDark: dark(tones[s.key] ?? "follow") })),
  ];
  return (
    <figure className="min-w-0 flex-1">
      <figcaption className="mb-2 text-sm font-medium text-text">
        {theme === "dark" ? "Visitors on the dark theme" : "Visitors on the light theme"}
      </figcaption>
      <ol className="overflow-hidden rounded-2xl border border-line" data-strip={theme}>
        {rows.map((row) => (
          <li
            key={row.label}
            data-band-dark={row.isDark || undefined}
            className={cn(
              "flex items-center justify-between gap-3 px-4 py-2.5 text-xs",
              row.isDark ? "bg-[#020617] text-[#f8fafc]" : "bg-[#f8fafc] text-[#0f172a]",
            )}
          >
            <span>{row.label}</span>
            <span className="opacity-70">{row.isDark ? "Dark" : "Light"}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/**
 * Websites → FigBud Global → Section themes (UI-TH6). Like the footer, the
 * draft and the published choices are both kept in the website's settings
 * (same audit and version check); only the published ones reach the website.
 */
export function SectionThemesEditor({ slug, data }: { slug: string; data: WebsiteSettingsAdmin }) {
  const router = useRouter();
  const uid = useId();
  const canEdit = data.can_edit;
  const [form, setForm] = useState<SectionThemes>(() =>
    clean(data.settings.section_themes_draft ?? data.settings.section_themes),
  );
  const [version, setVersion] = useState(data.version);
  const [published, setPublished] = useState<SectionThemes>(() => clean(data.settings.section_themes));
  const [hasDraft, setHasDraft] = useState(Boolean(data.settings.section_themes_draft));
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(canEdit && dirty);
  const unpublished = !sameValue(form, published);
  const tones = sectionTones(ALL, form);

  const choose = (key: HomeSection, choice: Choice) =>
    setForm((f) => {
      const next = { ...f };
      if (choice === "auto") delete next[key];
      else next[key] = choice;
      return next;
    });

  async function save(kind: "draft" | "publish") {
    setBusy(kind);
    setMessage(null);
    try {
      const saved = await adminFetch<WebsiteSettingsAdmin>(`sites/${slug}/settings`, {
        // The rest of the document is sent back unchanged.
        settings:
          kind === "publish"
            ? { ...data.settings, section_themes: form, section_themes_draft: null }
            : { ...data.settings, section_themes_draft: form },
        version,
      });
      setVersion(saved.version);
      setHasDraft(kind === "draft");
      if (kind === "publish") setPublished(form);
      markSaved();
      setMessage({
        tone: "ok",
        text:
          kind === "publish"
            ? "Published. The home page shows this now."
            : "Draft saved. Visitors still see the published themes.",
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
    <div className="mt-8 max-w-5xl space-y-6">
      <section className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6">
        <h2 className="font-semibold text-text">Each section</h2>
        <p className="mt-1 text-sm text-muted">
          Automatic alternates with the section before it, starting opposite the hero. Sections that
          aren&apos;t on the page (customer proof before anything is published) are skipped, so neighbours
          never match.
        </p>
        <ul className="mt-4 divide-y divide-line">
          {HOME_SECTIONS.map((section) => {
            const choice: Choice = form[section.key] ?? "auto";
            return (
              <li key={section.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <label htmlFor={`${uid}-${section.key}`} className="min-w-0 flex-1 text-sm text-text">
                  {section.label}
                  <span className="block text-xs text-subtle">
                    {`Now: ${tones[section.key] === "inverse" ? "opposite the global theme" : "follows the global theme"}`}
                  </span>
                </label>
                <select
                  id={`${uid}-${section.key}`}
                  value={choice}
                  disabled={!canEdit}
                  onChange={(e) => choose(section.key, e.target.value as Choice)}
                  className={fieldClasses("min-h-11 w-full px-3 sm:w-64")}
                >
                  <option value="auto">Automatic (alternate)</option>
                  <option value="follow">Follow the global theme</option>
                  <option value="inverse">Opposite the global theme</option>
                </select>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6">
        <h2 className="font-semibold text-text">Preview in both themes</h2>
        <p className="mt-1 text-sm text-muted">
          How the home page&apos;s bands fall for each visitor, with these choices.
        </p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <Strip theme="dark" tones={tones} />
          <Strip theme="light" tones={tones} />
        </div>
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
          <a
            href="/en"
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-text"
          >
            See the home page
            <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
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
