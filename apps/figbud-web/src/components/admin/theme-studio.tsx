"use client";

import {
  CORE_FIELDS,
  GRADIENT_PRESETS,
  type Gradient,
  type GradientPreset,
  MODE_FIELDS,
  type ModeTokens,
  type SiteTheme,
  type StudioTheme,
  type ThemeMode,
  builtInTheme,
  contrast,
  gradientCss,
  isHex,
  themeIssues,
  themeTokens,
} from "@figbud/site-kit";
import { cn, fieldClasses } from "@figbud/ui";
import { Copy, Monitor, Plus, Smartphone, Tablet, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type CSSProperties, useId, useState } from "react";

import { AdminError, type FieldError, adminFetch } from "@/lib/admin-client";
import { sameValue, useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import type { WebsiteSettingsAdmin } from "./website-settings";

/*
 * Websites → a website → Colours & themes: the Brand & Theme Studio (owner's
 * brief, 11 Nov 2026). The draft and the published theme are both kept in the
 * website's settings (same version check and audit trail as its other
 * settings); only the published one reaches the website, scoped to it. The
 * editor always shows complete colours, starting from the website's built-in
 * theme; what still equals the built-in theme isn't stored, so "Restore
 * defaults" and publishing gives the website exactly its built-in colours.
 */

const MAX_SWATCHES = 16;
const TABS = ["palette", "light", "dark", "gradients", "history"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  palette: "Palette",
  light: "Light mode",
  dark: "Dark mode",
  gradients: "Gradients",
  history: "History",
};

const FIELD_LABELS: Record<(typeof MODE_FIELDS)[number], { label: string; hint: string }> = {
  background: { label: "Background", hint: "The page behind everything" },
  surface: { label: "Cards and panels", hint: "Raised surfaces; deeper ones are derived from it" },
  text: { label: "Headings and text", hint: "At least 4.5:1 on every surface" },
  text_muted: { label: "Secondary text", hint: "Descriptions and captions, at least 4.5:1" },
  action: { label: "Buttons and active states", hint: "Primary buttons, selected tabs, progress" },
  action_text: { label: "Text on buttons", hint: "At least 4.5:1 on the button colour" },
  accent_text: { label: "Links and labels", hint: "The brand colour where it's text" },
  border: { label: "Borders", hint: "Optional: derived from the text colour" },
  focus: { label: "Focus ring", hint: "Optional: at least 3:1 on the background" },
  text_on_gradient: {
    label: "Secondary text on gradients",
    hint: "Optional: on calls to action, bands and demonstrations",
  },
};

const PRESET_LABELS: Record<GradientPreset, string> = {
  hero: "Hero",
  band: "Feature bands",
  demo: "Demonstrations",
  cta: "Call to action",
  footer: "Footer call to action",
};

const VIEWPORTS = [
  { key: "desktop", label: "Desktop", width: "100%", Icon: Monitor },
  { key: "tablet", label: "Tablet", width: "48rem", Icon: Tablet },
  { key: "mobile", label: "Mobile", width: "24.375rem", Icon: Smartphone },
] as const;

/** Complete colours for editing: the theme over the website's built-in one. */
function complete(slug: string, theme?: SiteTheme | null): StudioTheme {
  const base = builtInTheme(slug);
  const pick = (mode: ThemeMode): ModeTokens => {
    const own = theme?.[mode];
    return own && CORE_FIELDS.every((f) => isHex(own[f])) ? { ...own } : { ...base[mode] };
  };
  const gradients: StudioTheme["gradients"] = {};
  for (const p of GRADIENT_PRESETS) {
    const own = theme?.gradients?.[p];
    const light = own?.light ?? base.gradients?.[p]?.light ?? null;
    const dark = own?.dark ?? base.gradients?.[p]?.dark ?? null;
    if (light || dark) gradients[p] = { light, dark };
  }
  return {
    palette: theme?.palette?.length
      ? theme.palette.map((s) => ({ ...s }))
      : (base.palette ?? []).map((s) => ({ ...s })),
    light: pick("light"),
    dark: pick("dark"),
    gradients,
  };
}

const clean = (m?: ModeTokens) =>
  Object.fromEntries(MODE_FIELDS.flatMap((f) => (m?.[f] ? [[f, m[f]!.toLowerCase()]] : []))) as ModeTokens;

/** What to store: only what differs from the built-in theme. */
function compact(slug: string, form: StudioTheme): StudioTheme {
  const base = builtInTheme(slug);
  const out: StudioTheme = {};
  if (!sameValue(form.palette, base.palette ?? [])) out.palette = form.palette;
  const gradients: NonNullable<StudioTheme["gradients"]> = {};
  for (const mode of ["light", "dark"] as const) {
    let gradientChanged = false;
    for (const p of GRADIENT_PRESETS) {
      const g = form.gradients?.[p]?.[mode];
      if (g && !sameValue(g, base.gradients?.[p]?.[mode])) {
        gradients[p] = { ...gradients[p], [mode]: g };
        gradientChanged = true;
      }
    }
    if (gradientChanged || !sameValue(clean(form[mode]), clean(base[mode]))) out[mode] = clean(form[mode]);
  }
  if (Object.keys(gradients).length) out.gradients = gradients;
  return out;
}

/** The parts of the theme managed elsewhere (section band colours) stay as they are. */
const studioPart = (t?: SiteTheme | null): StudioTheme => ({
  palette: t?.palette,
  light: t?.light,
  dark: t?.dark,
  gradients: t?.gradients,
});

export function ColourField({
  id,
  label,
  hint,
  value,
  palette,
  disabled,
  ratio,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  palette: StudioTheme["palette"];
  disabled: boolean;
  ratio?: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          aria-label={`${label}: colour picker`}
          value={isHex(value) ? value : "#000000"}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-1 disabled:opacity-60"
        />
        <input
          id={id}
          value={text}
          maxLength={7}
          spellCheck={false}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          aria-invalid={text !== "" && !isHex(text)}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            if (isHex(v) || v === "") onChange(v.toLowerCase());
          }}
          className={fieldClasses("min-h-11 w-28 px-3 font-mono text-sm")}
        />
        {!!palette?.length && (
          <select
            aria-label={`${label}: use a palette colour`}
            value=""
            disabled={disabled}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            className={fieldClasses("min-h-11 max-w-44 px-2 text-sm")}
          >
            <option value="">From the palette…</option>
            {palette.map((s) => (
              <option key={`${s.name}${s.hex}`} value={s.hex}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {ratio && <span className="text-xs text-subtle tabular-nums">{ratio}</span>}
      </div>
      <p id={`${id}-hint`} className="text-xs text-subtle">
        {hint}
      </p>
    </div>
  );
}

/** A small page in the theme's colours, at the chosen width. */
function ThemePreview({ form, mode, width }: { form: StudioTheme; mode: ThemeMode; width: string }) {
  const tokens: Record<string, string> = themeTokens(form[mode] ?? {});
  for (const p of GRADIENT_PRESETS) {
    const g = form.gradients?.[p]?.[mode];
    const css = g && gradientCss(g);
    if (css) tokens[`--grad-${p}`] = css;
  }
  const style = tokens as CSSProperties;
  const panel = "rounded-2xl p-5 @md:p-7";
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface-2 p-3">
      <div
        data-site-preview=""
        data-theme={mode}
        data-theme-preview=""
        style={{ ...style, width, maxWidth: "100%" }}
        className="@container mx-auto grid gap-4 rounded-xl bg-bg p-4 text-text transition-[width] duration-[var(--motion-base)] ease-out-expo motion-reduce:transition-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3 text-sm">
          <span className="font-semibold">Website name</span>
          <span className="flex items-center gap-3">
            <span className="text-accent underline underline-offset-4">Platform</span>
            <span className="rounded-full bg-action px-3 py-1.5 font-medium text-action-ink">
              Book a demo
            </span>
          </span>
        </div>
        <div className={panel} style={{ background: "var(--grad-hero, var(--bg))" }}>
          <p className="text-xs font-medium tracking-wide text-accent uppercase">Sample label</p>
          <p className="mt-2 font-display text-2xl font-semibold">A headline in the theme</p>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Secondary text, as in descriptions and captions, on the hero gradient.
          </p>
          <span className="mt-4 inline-flex rounded-full bg-action px-4 py-2 text-sm font-medium text-action-ink">
            Primary button
          </span>
        </div>
        <div className="grid gap-3 @md:grid-cols-2">
          {["Card on a surface", "Selected item"].map((t, i) => (
            <div
              key={t}
              className={cn(
                "rounded-xl border p-4",
                i ? "border-action bg-surface-2" : "border-line bg-surface",
              )}
            >
              <p className="font-medium">{t}</p>
              <p className="mt-1 text-sm text-muted">
                Secondary text on {i ? "a deeper surface" : "a card"}.
              </p>
            </div>
          ))}
        </div>
        <div
          className={panel}
          style={{
            background: "var(--grad-band, var(--bg-elevated))",
            ["--text-muted" as string]: "var(--text-on-grad)",
          }}
        >
          <p className="font-semibold">Feature band</p>
          <p className="mt-1 text-sm text-muted">Secondary text on the band gradient.</p>
        </div>
        <div
          className={panel}
          style={{
            background: "var(--grad-cta, var(--surface))",
            ["--text-muted" as string]: "var(--text-on-grad)",
          }}
        >
          <p className="font-semibold">Call to action</p>
          <p className="mt-1 text-sm text-muted">Secondary text on the call-to-action gradient.</p>
        </div>
      </div>
    </div>
  );
}

function GradientEditor({
  id,
  gradient,
  disabled,
  onChange,
}: {
  id: string;
  gradient: Gradient;
  disabled: boolean;
  onChange: (g: Gradient) => void;
}) {
  const range = "w-full accent-[var(--action,var(--accent))]";
  const stops = gradient.stops;
  const setStop = (i: number, patch: Partial<Gradient["stops"][number]>) =>
    onChange({ ...gradient, stops: stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-4">
        <label className="grid gap-1.5 text-sm font-medium text-text">
          Type
          <select
            value={gradient.kind ?? "linear"}
            disabled={disabled}
            onChange={(e) => onChange({ ...gradient, kind: e.target.value as Gradient["kind"] })}
            className={fieldClasses("min-h-11 px-3 text-sm")}
          >
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
          </select>
        </label>
        {gradient.kind === "radial" ? (
          (["x", "y"] as const).map((axis) => (
            <label key={axis} className="grid min-w-40 flex-1 gap-1.5 text-sm font-medium text-text">
              Centre {axis === "x" ? "across" : "down"}: {gradient[axis] ?? 50}%
              <input
                type="range"
                min={0}
                max={100}
                value={gradient[axis] ?? 50}
                disabled={disabled}
                onChange={(e) => onChange({ ...gradient, [axis]: Number(e.target.value) })}
                className={range}
              />
            </label>
          ))
        ) : (
          <label className="grid min-w-48 flex-1 gap-1.5 text-sm font-medium text-text">
            Angle: {gradient.angle ?? 0}°
            <input
              type="range"
              min={0}
              max={360}
              value={gradient.angle ?? 0}
              disabled={disabled}
              onChange={(e) => onChange({ ...gradient, angle: Number(e.target.value) })}
              className={range}
            />
          </label>
        )}
      </div>
      <ol className="grid gap-3">
        {stops.map((stop, i) => (
          <li
            key={i}
            className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end"
          >
            <ColourField
              id={`${id}-stop-${i}`}
              label={`Stop ${i + 1}`}
              hint=""
              value={stop.color}
              palette={undefined}
              disabled={disabled}
              onChange={(color) => setStop(i, { color })}
            />
            <label className="grid gap-1.5 text-sm text-text">
              Position: {stop.at}%
              <input
                type="range"
                min={0}
                max={100}
                value={stop.at}
                disabled={disabled}
                onChange={(e) => setStop(i, { at: Number(e.target.value) })}
                className={range}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-text">
              Opacity: {stop.opacity ?? 100}%
              <input
                type="range"
                min={0}
                max={100}
                value={stop.opacity ?? 100}
                disabled={disabled}
                onChange={(e) => setStop(i, { opacity: Number(e.target.value) })}
                className={range}
              />
            </label>
            <button
              type="button"
              aria-label={`Remove stop ${i + 1}`}
              disabled={disabled || stops.length <= 2}
              onClick={() => onChange({ ...gradient, stops: stops.filter((_, j) => j !== i) })}
              className="grid size-11 place-items-center rounded-xl border border-line text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={disabled || stops.length >= 5}
        onClick={() =>
          onChange({ ...gradient, stops: [...stops, { color: stops.at(-1)?.color ?? "#000000", at: 100 }] })
        }
        className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-medium text-text hover:bg-surface-2 disabled:opacity-40"
      >
        <Plus aria-hidden className="size-4" />
        Add a colour stop
      </button>
    </div>
  );
}

export function ThemeStudio({
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
  const settings = data.settings;
  const [form, setForm] = useState<StudioTheme>(() => complete(slug, settings.theme_draft ?? settings.theme));
  const [published, setPublished] = useState<StudioTheme>(() =>
    compact(slug, complete(slug, settings.theme)),
  );
  const [hasDraft, setHasDraft] = useState(Boolean(settings.theme_draft));
  const [version, setVersion] = useState(data.version);
  const [tab, setTab] = useState<Tab>("palette");
  const [previewMode, setPreviewMode] = useState<ThemeMode>("dark");
  const [viewport, setViewport] = useState<(typeof VIEWPORTS)[number]["key"]>("desktop");
  const [preset, setPreset] = useState<GradientPreset>("hero");
  const [gradientMode, setGradientMode] = useState<ThemeMode>("dark");
  const [busy, setBusy] = useState<"draft" | "publish" | "discard" | null>(null);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(canEdit && dirty);
  const disabled = !canEdit || busy !== null;
  const stored = compact(slug, form);
  const unpublished = !sameValue(stored, published);
  const issues = themeIssues(form);
  const critical = issues.filter((i) => i.critical);
  const history = settings.theme_history ?? [];

  async function save(kind: "draft" | "publish" | "discard") {
    setBusy(kind);
    setMessage(null);
    setFields([]);
    // The section band colours (Navigation & enquiries) stay as published.
    const bands = {
      brand_section: settings.theme?.brand_section ?? null,
      soft_section: settings.theme?.soft_section ?? null,
    };
    try {
      const saved = await adminFetch<WebsiteSettingsAdmin>(`sites/${slug}/settings`, {
        // The rest of the document is sent back unchanged.
        settings:
          kind === "publish"
            ? { ...settings, theme: { ...bands, ...stored }, theme_draft: null }
            : kind === "draft"
              ? { ...settings, theme_draft: { ...bands, ...stored } }
              : { ...settings, theme_draft: null },
        version,
      });
      setVersion(saved.version);
      setHasDraft(kind === "draft");
      if (kind === "publish") setPublished(stored);
      if (kind === "discard") {
        const back = complete(slug, saved.settings.theme);
        setForm(back);
        markSaved(back);
      } else markSaved();
      setMessage({
        tone: "ok",
        text:
          kind === "publish"
            ? `Published. ${name} shows these colours within a few minutes.`
            : kind === "draft"
              ? "Draft saved. Visitors still see the published colours."
              : "Draft discarded. You're back to the published colours.",
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

  const setMode = (mode: ThemeMode, field: (typeof MODE_FIELDS)[number], value: string) =>
    setForm((f) => ({ ...f, [mode]: { ...f[mode], [field]: value || undefined } }));
  const palette = form.palette ?? [];
  const setPalette = (next: NonNullable<StudioTheme["palette"]>) => setForm((f) => ({ ...f, palette: next }));
  const gradient = form.gradients?.[preset]?.[gradientMode] ?? null;
  const setGradient = (g: Gradient | null) =>
    setForm((f) => ({
      ...f,
      gradients: { ...f.gradients, [preset]: { ...f.gradients?.[preset], [gradientMode]: g } },
    }));
  const builtIn = builtInTheme(slug);
  const errorFor = (prefix: string) => fields.find((f) => f.field.startsWith(prefix))?.message;
  const ratioFor = (mode: ThemeMode, field: (typeof MODE_FIELDS)[number]) => {
    const m = form[mode] ?? {};
    const against =
      field === "action_text"
        ? m.action
        : field === "action" || field === "background" || field === "surface"
          ? null
          : field === "focus"
            ? m.background
            : m.surface;
    const v = m[field];
    return against && isHex(v) && isHex(against) ? `${contrast(v, against).toFixed(2)}:1` : undefined;
  };

  const tabButton = (t: Tab) => (
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
  );

  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
      <div className="grid gap-6">
        <div
          role="tablist"
          aria-label="Theme settings"
          className="flex flex-wrap gap-1 rounded-full border border-line p-1"
        >
          {TABS.map(tabButton)}
        </div>

        <section
          id={`${uid}-panel`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${tab}`}
          className="grid gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-6"
        >
          {tab === "palette" && (
            <>
              <p className="text-sm text-muted">
                {name}&apos;s named colours. Pick them for any colour in the light and dark modes and in
                gradients.
              </p>
              <ul className="grid gap-3">
                {palette.map((swatch, i) => (
                  <li key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
                    <label className="grid flex-1 gap-1.5 text-sm font-medium text-text">
                      Name
                      <input
                        value={swatch.name}
                        maxLength={40}
                        disabled={disabled}
                        onChange={(e) =>
                          setPalette(palette.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)))
                        }
                        className={fieldClasses("min-h-11 min-w-40 px-3 text-sm")}
                      />
                    </label>
                    <ColourField
                      id={`${uid}-swatch-${i}`}
                      label={`${swatch.name || "Colour"} hex`}
                      hint=""
                      value={swatch.hex}
                      palette={undefined}
                      disabled={disabled}
                      onChange={(hex) => setPalette(palette.map((s, j) => (j === i ? { ...s, hex } : s)))}
                    />
                    <button
                      type="button"
                      aria-label={`Duplicate ${swatch.name || "this colour"}`}
                      disabled={disabled || palette.length >= MAX_SWATCHES}
                      onClick={() =>
                        setPalette([
                          ...palette.slice(0, i + 1),
                          { ...swatch, name: `${swatch.name} copy`.slice(0, 40) },
                          ...palette.slice(i + 1),
                        ])
                      }
                      className="grid size-11 place-items-center rounded-xl border border-line text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
                    >
                      <Copy aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${swatch.name || "this colour"}`}
                      disabled={disabled}
                      onClick={() => setPalette(palette.filter((_, j) => j !== i))}
                      className="grid size-11 place-items-center rounded-xl border border-line text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              {errorFor("theme.palette") && (
                <p className="text-sm text-danger">{errorFor("theme.palette")}</p>
              )}
              <button
                type="button"
                disabled={disabled || palette.length >= MAX_SWATCHES}
                onClick={() =>
                  setPalette([...palette, { name: `Colour ${palette.length + 1}`, hex: "#f7933a" }])
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
                {tab === "light" ? "Light" : "Dark"} mode, independent of the other. The colours are checked
                as you go; publishing needs every critical check to pass.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                {MODE_FIELDS.map((field) => (
                  <ColourField
                    key={`${tab}-${field}`}
                    id={`${uid}-${tab}-${field}`}
                    label={FIELD_LABELS[field].label}
                    hint={FIELD_LABELS[field].hint}
                    value={form[tab]?.[field] ?? ""}
                    palette={palette}
                    disabled={disabled}
                    ratio={ratioFor(tab, field)}
                    onChange={(v) => setMode(tab, field, v)}
                  />
                ))}
              </div>
              {errorFor(`theme.${tab}`) && <p className="text-sm text-danger">{errorFor(`theme.${tab}`)}</p>}
            </>
          )}

          {tab === "gradients" && (
            <>
              <div className="flex flex-wrap gap-4">
                <label className="grid gap-1.5 text-sm font-medium text-text">
                  Where it&apos;s used
                  <select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value as GradientPreset)}
                    className={fieldClasses("min-h-11 px-3 text-sm")}
                  >
                    {GRADIENT_PRESETS.map((p) => (
                      <option key={p} value={p}>
                        {PRESET_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="grid gap-1.5">
                  <legend className="text-sm font-medium text-text">Mode</legend>
                  <div className="flex gap-1">
                    {(["dark", "light"] as const).map((m) => (
                      <label
                        key={m}
                        className={cn(
                          "has-focus-visible:outline-focus inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-4 text-sm has-focus-visible:outline-2",
                          gradientMode === m
                            ? "border-action bg-surface-2 text-text"
                            : "border-line text-muted",
                        )}
                      >
                        <input
                          type="radio"
                          name={`${uid}-gradient-mode`}
                          className="sr-only"
                          checked={gradientMode === m}
                          onChange={() => setGradientMode(m)}
                        />
                        {m === "dark" ? "Dark" : "Light"}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div
                aria-hidden
                className="h-20 rounded-xl border border-line"
                style={{ background: (gradient && gradientCss(gradient)) || "var(--surface-2)" }}
              />
              {gradient ? (
                <>
                  <GradientEditor
                    id={`${uid}-${preset}-${gradientMode}`}
                    gradient={gradient}
                    disabled={disabled}
                    onChange={setGradient}
                  />
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setGradient(builtIn.gradients?.[preset]?.[gradientMode] ?? null)}
                    className="inline-flex min-h-11 w-fit items-center rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
                  >
                    {builtIn.gradients?.[preset]?.[gradientMode]
                      ? "Back to the built-in gradient"
                      : "Remove this gradient"}
                  </button>
                </>
              ) : (
                <div className="grid gap-3">
                  <p className="text-sm text-muted">
                    No {PRESET_LABELS[preset].toLowerCase()} gradient in {gradientMode} mode: it uses the
                    plain surface.
                  </p>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const m = form[gradientMode] ?? {};
                      setGradient({
                        kind: "linear",
                        angle: 135,
                        stops: [
                          { color: m.background ?? "#000000", at: 0 },
                          { color: m.surface ?? "#222222", at: 100 },
                        ],
                      });
                    }}
                    className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-medium text-text hover:bg-surface-2 disabled:opacity-40"
                  >
                    <Plus aria-hidden className="size-4" />
                    Add a gradient
                  </button>
                </div>
              )}
              <p className="text-xs text-subtle">
                Sections can use the hero, band and call-to-action gradients (Page builder → a section →
                Section style).
              </p>
            </>
          )}

          {tab === "history" && (
            <>
              <p className="text-sm text-muted">
                The last {history.length || "few"} published themes, newest first. Load one to look at it,
                then publish it to roll back. Every change is also in the audit log.
              </p>
              {history.length ? (
                <ol className="grid gap-2">
                  {history.map((v, i) => (
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
                            Live now
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setForm(complete(slug, studioPart(v.theme)))}
                        className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm text-text hover:bg-surface-2 disabled:opacity-40"
                      >
                        Load this version
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-subtle">
                  Nothing published from the Studio yet: {name} uses its built-in colours.
                </p>
              )}
            </>
          )}
        </section>

        <section
          aria-labelledby={`${uid}-checks`}
          aria-live="polite"
          className="grid gap-3 rounded-2xl border border-line p-5"
        >
          <h2 id={`${uid}-checks`} className="font-medium text-text">
            Contrast checks
          </h2>
          {issues.length === 0 ? (
            <p className="text-sm text-success">Every colour meets WCAG AA in both modes.</p>
          ) : (
            <ul className="grid gap-1.5 text-sm" data-theme-issues="">
              {issues.map((issue, i) => (
                <li key={i} className={issue.critical ? "text-danger" : "text-warning"}>
                  {issue.critical ? "Blocks publishing" : "Warning"} ·{" "}
                  {issue.mode === "light" ? "Light" : "Dark"}: {issue.message}
                  {issue.ratio !== undefined && ` (${issue.ratio.toFixed(2)}:1)`}
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
                busy ? undefined : critical.length ? "Fix the contrast checks first" : "Nothing to publish"
              }
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
                  const back = complete(slug, settings.theme);
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
                setForm(complete(slug, null));
                setMessage({
                  tone: "ok",
                  text: "The built-in colours are back in the editor. Publish to use them.",
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
          <p className="text-sm text-subtle">You can view this; a reviewer or owner can change it.</p>
        )}
      </div>

      <section aria-labelledby={`${uid}-preview`} className="grid gap-3 xl:sticky xl:top-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${uid}-preview`} className="font-medium text-text">
            Preview
          </h2>
          <div className="flex flex-wrap gap-2">
            <div role="group" aria-label="Preview mode" className="flex gap-1">
              {(["dark", "light"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={previewMode === m}
                  onClick={() => setPreviewMode(m)}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 text-sm",
                    previewMode === m ? "border-action bg-surface-2 text-text" : "border-line text-muted",
                  )}
                >
                  {m === "dark" ? "Dark" : "Light"}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Preview width" className="flex gap-1">
              {VIEWPORTS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={viewport === key}
                  aria-label={label}
                  title={label}
                  onClick={() => setViewport(key)}
                  className={cn(
                    "grid size-11 place-items-center rounded-xl border",
                    viewport === key ? "border-action bg-surface-2 text-text" : "border-line text-muted",
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
        <ThemePreview
          form={form}
          mode={previewMode}
          width={VIEWPORTS.find((v) => v.key === viewport)!.width}
        />
        <p className="text-xs text-subtle">
          {unpublished ? "Showing your unpublished colours." : "Showing the published colours."} Only {name}{" "}
          changes; other websites keep their own.
        </p>
      </section>
    </div>
  );
}
