"use client";

import { cn, fieldClasses } from "@figbud/ui";
import { CircleAlert, CircleCheck, Copy, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type CSSProperties, useId, useState } from "react";

import { AdminError, type FieldError, adminFetch } from "@/lib/admin-client";
import { sameValue, useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";
import {
  type Appearance,
  type AppearanceAdmin,
  MODE_COLOURS,
  STUDIO_DEFAULTS,
  type StudioMode,
  type StudioModeKey,
  appearanceIssues,
  studioTokens,
} from "@/lib/studio-appearance";

import { ActionButton } from "./action-button";
import { ColourField } from "./theme-studio";

/*
 * Settings & Security → Appearance & themes (owner's brief, 12 Nov 2026): the
 * Studio's own colours, independent of every website. The editor always shows
 * complete colours, starting from the built-in palette; only what differs is
 * stored, so Restore defaults and Publish gives exactly the built-in Studio.
 */

const TABS = ["shared", "light", "dark", "history"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  shared: "Shared brand colours",
  light: "Light mode",
  dark: "Dark mode",
  history: "History",
};

const LABELS: Record<(typeof MODE_COLOURS)[number], { label: string; hint: string }> = {
  background: { label: "Page background", hint: "Behind every page" },
  sidebar: { label: "Sidebar and navigation", hint: "The sidebar, menus and drawers" },
  surface: { label: "Cards and panels", hint: "Raised areas such as cards" },
  hover: { label: "Hover background", hint: "Under the pointer, and selected rows" },
  field: { label: "Form fields", hint: "Optional: inputs and selects (else the page background)" },
  border: { label: "Borders and dividers", hint: "Lines between areas" },
  text: { label: "Headings and text", hint: "At least 4.5:1 everywhere" },
  text_muted: { label: "Body text", hint: "Descriptions and hints, at least 4.5:1" },
  action: { label: "Buttons and active states", hint: "Primary buttons, the active tab" },
  action_text: { label: "Text on buttons", hint: "At least 4.5:1 on buttons" },
  accent_text: { label: "Links and active labels", hint: "Also the focus ring" },
  success: { label: "Success", hint: "Saved and published messages" },
  warning: { label: "Warning", hint: "Things to check" },
  danger: { label: "Error", hint: "Errors and destructive actions" },
  glow: { label: "Gradient and glow", hint: "Optional: the accent line and glows" },
};

const clean = (m?: StudioMode): StudioMode =>
  Object.fromEntries(
    Object.entries(m ?? {}).filter(([, v]) => v !== undefined && v !== "" && v !== null),
  ) as StudioMode;

/** Complete colours for editing: the appearance over the built-in palette. */
function complete(a?: Appearance | null): Appearance {
  const mode = (k: StudioModeKey): StudioMode => ({ ...STUDIO_DEFAULTS[k], ...clean(a?.[k]) });
  return {
    light: mode("light"),
    dark: mode("dark"),
    shared: {
      primary: a?.shared?.primary ?? STUDIO_DEFAULTS.shared?.primary,
      secondary: a?.shared?.secondary ?? STUDIO_DEFAULTS.shared?.secondary,
      palette: (a?.shared?.palette?.length ? a.shared.palette : (STUDIO_DEFAULTS.shared?.palette ?? [])).map(
        (s) => ({ ...s }),
      ),
    },
  };
}

/** What to store: only what differs from the built-in palette. */
function compact(form: Appearance): Appearance {
  const out: Appearance = {};
  for (const k of ["light", "dark"] as const)
    if (!sameValue(clean(form[k]), clean(STUDIO_DEFAULTS[k]))) out[k] = clean(form[k]);
  if (!sameValue(form.shared, STUDIO_DEFAULTS.shared)) out.shared = form.shared;
  return out;
}

/** A small Studio page in the chosen colours. */
function Preview({ form, mode }: { form: Appearance; mode: StudioModeKey }) {
  const m = form[mode] ?? {};
  const style = studioTokens(m, form.shared?.secondary) as CSSProperties;
  return (
    <div
      data-appearance-preview=""
      data-theme={mode}
      style={style}
      className="grid grid-cols-[7rem_1fr] overflow-hidden rounded-2xl border border-line bg-bg text-text"
    >
      <div className="grid content-start gap-1 border-e border-line bg-bg-elevated p-2 text-xs">
        <span className="rounded-lg bg-surface-2 px-2 py-1.5 font-medium text-text">Websites</span>
        <span className="px-2 py-1.5 text-muted">Pricing</span>
        <span className="px-2 py-1.5 text-muted">Settings</span>
      </div>
      <div className="grid gap-3 p-4">
        <p className="font-semibold">Page heading</p>
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-sm font-medium">A card</p>
          <p className="mt-1 text-xs text-muted">
            Body text, with a <span className="text-accent underline">link</span>.
          </p>
          <span
            className="mt-2 block rounded-lg border border-line-strong px-2 py-1.5 text-xs text-muted"
            style={m.field ? { background: m.field } : undefined}
          >
            A form field
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-action px-3 py-1.5 font-medium text-action-ink">Publish</span>
          <span className="text-success">Saved</span>
          <span className="text-warning">Check this</span>
          <span className="text-danger">Error</span>
        </div>
        <span
          aria-hidden
          className="h-1 rounded-full"
          style={{ background: "linear-gradient(90deg, var(--glow), transparent)" }}
        />
      </div>
    </div>
  );
}

export function AppearanceStudio({ data }: { data: AppearanceAdmin }) {
  const router = useRouter();
  const uid = useId();
  const canEdit = data.can_edit;
  const [form, setForm] = useState<Appearance>(() => complete(data.draft ?? data.appearance));
  const [published, setPublished] = useState<Appearance>(() => compact(complete(data.appearance)));
  const [hasDraft, setHasDraft] = useState(Boolean(data.draft));
  const [version, setVersion] = useState(data.version);
  const [tab, setTab] = useState<Tab>("dark");
  const [busy, setBusy] = useState<"draft" | "publish" | "discard" | null>(null);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(canEdit && dirty);
  const disabled = !canEdit || busy !== null;
  const stored = compact(form);
  const unpublished = !sameValue(stored, published);
  const issues = appearanceIssues(form);
  const critical = issues.filter((i) => i.critical);
  const palette = form.shared?.palette ?? [];

  async function save(kind: "draft" | "publish" | "discard") {
    setBusy(kind);
    setMessage(null);
    setFields([]);
    try {
      const saved = await adminFetch<AppearanceAdmin>("studio-appearance", {
        appearance: kind === "publish" ? stored : compact(complete(data.appearance)),
        draft: kind === "draft" ? stored : null,
        version,
      });
      setVersion(saved.version);
      setHasDraft(kind === "draft");
      if (kind === "publish") setPublished(stored);
      if (kind === "discard") {
        const back = complete(saved.appearance);
        setForm(back);
        markSaved(back);
      } else markSaved();
      setMessage({
        tone: "ok",
        text:
          kind === "publish"
            ? "Published. The Studio uses these colours now, for everyone."
            : kind === "draft"
              ? "Draft saved. The Studio keeps its published colours."
              : "Draft discarded.",
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

  const setMode = (mode: StudioModeKey, key: keyof StudioMode, value: string | number | undefined) =>
    setForm((f) => ({ ...f, [mode]: { ...f[mode], [key]: value === "" ? undefined : value } }));
  const setShared = (patch: NonNullable<Appearance["shared"]>) =>
    setForm((f) => ({ ...f, shared: { ...f.shared, ...patch } }));

  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:items-start">
      <div className="grid gap-6">
        <div
          role="tablist"
          aria-label="Appearance settings"
          className="flex flex-wrap gap-1 rounded-full border border-line p-1"
        >
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`${uid}-tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`${uid}-panel`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(e) => {
                const i = TABS.indexOf(t);
                const next =
                  e.key === "ArrowRight"
                    ? TABS[(i + 1) % TABS.length]
                    : e.key === "ArrowLeft"
                      ? TABS[(i + TABS.length - 1) % TABS.length]
                      : null;
                if (next) {
                  e.preventDefault();
                  setTab(next);
                  document.getElementById(`${uid}-tab-${next}`)?.focus();
                }
              }}
              className={cn(
                "min-h-11 rounded-full px-4 text-sm font-medium transition-colors",
                tab === t ? "bg-action text-action-ink" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <section
          id={`${uid}-panel`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${tab}`}
          className="grid gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-6"
        >
          {tab === "shared" && (
            <>
              <p className="text-sm text-muted">
                The brand family both modes pick from: warm cream, cream, warm orange, warm brown and brown.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <ColourField
                  id={`${uid}-primary`}
                  label="Primary colour"
                  hint="Offered first for buttons and active states"
                  value={form.shared?.primary ?? ""}
                  palette={palette}
                  disabled={disabled}
                  onChange={(v) => setShared({ primary: v || undefined })}
                />
                <ColourField
                  id={`${uid}-secondary`}
                  label="Secondary colour"
                  hint="Highlights and the Websites area colour"
                  value={form.shared?.secondary ?? ""}
                  palette={palette}
                  disabled={disabled}
                  onChange={(v) => setShared({ secondary: v || undefined })}
                />
              </div>
              <ul className="grid gap-3">
                {palette.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
                    <label className="grid flex-1 gap-1.5 text-sm font-medium text-text">
                      Name
                      <input
                        value={s.name}
                        maxLength={40}
                        disabled={disabled}
                        onChange={(e) =>
                          setShared({
                            palette: palette.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                          })
                        }
                        className={fieldClasses("min-h-11 min-w-36 px-3 text-sm")}
                      />
                    </label>
                    <ColourField
                      id={`${uid}-swatch-${i}`}
                      label={`${s.name || "Colour"} hex`}
                      hint=""
                      value={s.hex}
                      palette={undefined}
                      disabled={disabled}
                      onChange={(hex) =>
                        setShared({ palette: palette.map((x, j) => (j === i ? { ...x, hex } : x)) })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Duplicate ${s.name || "this colour"}`}
                      disabled={disabled || palette.length >= 16}
                      onClick={() =>
                        setShared({
                          palette: [
                            ...palette.slice(0, i + 1),
                            { ...s, name: `${s.name} copy`.slice(0, 40) },
                            ...palette.slice(i + 1),
                          ],
                        })
                      }
                      className="grid size-11 place-items-center rounded-xl border border-line text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
                    >
                      <Copy aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${s.name || "this colour"}`}
                      disabled={disabled}
                      onClick={() => setShared({ palette: palette.filter((_, j) => j !== i) })}
                      className="grid size-11 place-items-center rounded-xl border border-line text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={disabled || palette.length >= 16}
                onClick={() =>
                  setShared({
                    palette: [...palette, { name: `Colour ${palette.length + 1}`, hex: "#f28c38" }],
                  })
                }
                className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-medium text-text hover:bg-surface-2 disabled:opacity-40"
              >
                <Plus aria-hidden className="size-4" />
                Add a colour
              </button>
            </>
          )}

          {(tab === "light" || tab === "dark") && (
            <>
              <p className="text-sm text-muted">
                {tab === "light" ? "Light" : "Dark"} mode of the Studio, independent of the other and of every
                website.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                {MODE_COLOURS.map((key) => (
                  <ColourField
                    key={`${tab}-${key}`}
                    id={`${uid}-${tab}-${key}`}
                    label={LABELS[key].label}
                    hint={LABELS[key].hint}
                    value={form[tab]?.[key] ?? ""}
                    palette={palette}
                    disabled={disabled}
                    onChange={(v) => setMode(tab, key, v)}
                  />
                ))}
                <label className="grid gap-1.5 text-sm font-medium text-text">
                  Glow intensity: {form[tab]?.glow_intensity ?? 20}%
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={form[tab]?.glow_intensity ?? 20}
                    disabled={disabled}
                    onChange={(e) => setMode(tab, "glow_intensity", Number(e.target.value))}
                    className="w-full accent-[var(--action,var(--accent))]"
                  />
                </label>
              </div>
              {fields.some((f) => f.field === tab) && (
                <p className="text-sm text-danger">{fields.find((f) => f.field === tab)?.message}</p>
              )}
            </>
          )}

          {tab === "history" && (
            <>
              <p className="text-sm text-muted">
                The last {data.history.length || "few"} published appearances, newest first. Load one, then
                publish it to roll back.
              </p>
              {data.history.length ? (
                <ol className="grid gap-2">
                  {data.history.map((v, i) => (
                    <li
                      key={`${v.published_at}${i}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"
                    >
                      <span className="text-sm">
                        <span className="text-text">
                          {new Date(v.published_at).toLocaleString("en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                        <span className="text-subtle"> · {v.by ?? "Unknown"}</span>
                        {i === 0 && (
                          <span className="ms-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                            In use
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setForm(complete(v.appearance))}
                        className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm text-text hover:bg-surface-2 disabled:opacity-40"
                      >
                        Load this version
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-subtle">
                  Nothing published yet: the Studio uses its built-in palette.
                </p>
              )}
            </>
          )}
        </section>

        <section
          aria-labelledby={`${uid}-checks`}
          aria-live="polite"
          className="grid gap-2 rounded-2xl border border-line p-5"
        >
          <h2 id={`${uid}-checks`} className="font-medium text-text">
            Readability checks
          </h2>
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CircleCheck aria-hidden className="size-4" /> Every colour stays readable in both modes.
            </p>
          ) : (
            <ul className="grid gap-1.5 text-sm" data-appearance-issues="">
              {issues.map((issue, i) => (
                <li key={i} className={cn("flex gap-2", issue.critical ? "text-danger" : "text-warning")}>
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {issue.critical ? "Blocks publishing" : "Warning"} ·{" "}
                    {issue.mode === "light" ? "Light" : "Dark"}: {issue.message}
                    {issue.ratio !== undefined && ` (${issue.ratio.toFixed(2)}:1)`}
                  </span>
                </li>
              ))}
            </ul>
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
              ready={(unpublished || hasDraft) && critical.length === 0}
              busy={busy === "publish"}
              hint={
                busy ? undefined : critical.length ? "Fix the readability checks first" : "Nothing to publish"
              }
              title="Everything checked? You're ready to go live."
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
                  const back = complete(data.appearance);
                  setForm(back);
                  markSaved(back);
                  setMessage({ tone: "ok", text: "Changes discarded." });
                } else void save("discard");
              }}
            >
              Discard draft
            </ActionButton>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setForm(complete(null));
                setMessage({
                  tone: "ok",
                  text: "The built-in palette is back in the editor. Publish to use it.",
                });
              }}
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
            >
              Restore defaults
            </button>
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
          <p className="text-sm text-subtle">
            You can view this; an owner can change the Studio&apos;s appearance.
          </p>
        )}
      </div>

      <section aria-labelledby={`${uid}-preview`} className="grid gap-4 xl:sticky xl:top-24">
        <h2 id={`${uid}-preview`} className="font-medium text-text">
          Preview
        </h2>
        {(["dark", "light"] as const).map((mode) => (
          <figure key={mode} className="grid gap-1.5">
            <Preview form={form} mode={mode} />
            <figcaption className="text-xs text-subtle">
              {mode === "dark" ? "Dark mode" : "Light mode"}
            </figcaption>
          </figure>
        ))}
        <p className="text-xs text-subtle">
          {unpublished ? "Showing your unpublished colours." : "Showing the colours in use."} Websites keep
          their own themes.
        </p>
      </section>
    </div>
  );
}
