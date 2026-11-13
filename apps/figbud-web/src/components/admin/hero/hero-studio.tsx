"use client";

import { publicProducts } from "@figbud/brand";
import {
  DEFAULT_HERO_CONFIG,
  HERO_DESIGNS,
  HERO_PALETTE_KEYS,
  type HeroConfig,
  type HeroPaletteKey,
  type HeroVariant,
} from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Eye,
  Maximize2,
  Monitor,
  Moon,
  Pause,
  Play,
  Pencil,
  Smartphone,
  Sun,
  Tablet,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { AdminError, ApprovalRecorded, type FieldError, adminFetch } from "@/lib/admin-client";
import { useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { PALETTE_LABELS, PLATFORM_LOOKS, isPlatformDesign } from "../../home/heroes/platform-looks";
import { ActionButton } from "../action-button";
import type { HeroAdmin } from "./hero-types";

type Theme = "light" | "dark";
const DEVICES = {
  desktop: { width: 1440, height: 900, label: "Desktop", Icon: Monitor },
  tablet: { width: 834, height: 1112, label: "Tablet", Icon: Tablet },
  mobile: { width: 390, height: 844, label: "Phone", Icon: Smartphone },
} as const;
type Device = keyof typeof DEVICES;

const STATUS: Record<HeroAdmin["status"], { label: string; tone: string }> = {
  draft: {
    label: "Nothing published · the website keeps its current hero",
    tone: "border-line-strong text-muted",
  },
  in_review: { label: "Awaiting approval", tone: "border-warning/40 text-warning" },
  published: { label: "Published", tone: "border-accent/40 text-accent-strong" },
  changes_pending: { label: "Published · draft changes", tone: "border-accent/40 text-accent-strong" },
  own: { label: "Live · the website's own hero", tone: "border-accent/40 text-accent-strong" },
};

/** The website's own hero, always listed (owner's brief, 12 Nov 2026). */
const OWN = "own";

const field =
  "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text disabled:opacity-60";

/** A non-interactive frame of the real hero (the preview route), scaled to fill its card. */
function Frame({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.24);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setScale(entry.contentRect.width / 1440));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className="relative aspect-[1440/900] w-full overflow-hidden">
      <iframe
        src={src}
        title={title}
        loading="lazy"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute start-0 top-0 origin-top-left border-0 bg-bg"
        style={{ width: 1440, height: 900, transform: `scale(${scale})` }}
      />
    </div>
  );
}

/**
 * Hero Design Studio (P12): a website's hero variants with exact previews
 * (the production components in a frame), light and dark, desktop, tablet
 * and phone; editing within each design's settings; approval, publishing of
 * exactly one variant, versions and one-step rollback.
 */
export function HeroStudio({ data, isOwner }: { data: HeroAdmin; isOwner: boolean }) {
  const router = useRouter();
  const uid = useId();
  const slug = data.site.slug;
  const [draft, setDraft] = useState(data.draft);
  const [version, setVersion] = useState(data.draft_version);
  const [theme, setTheme] = useState<Theme>("dark");
  // Preview only: hold the motion still (the variant's own setting is unchanged).
  const [still, setStill] = useState(false);
  const [preview, setPreview] = useState<{ id: string; device: Device } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [note, setNote] = useState("");
  const { dirty, markSaved } = useSavedBaseline(draft);
  useUnsavedChangesWarning(data.can_edit && dirty);
  const [seen, setSeen] = useState(data.draft_version);
  if (data.draft_version !== seen) {
    setSeen(data.draft_version);
    setVersion(data.draft_version);
    if (!dirty) {
      setDraft(data.draft);
      markSaved(data.draft);
    }
  }
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (preview) dialog.current?.showModal();
    else dialog.current?.close();
  }, [preview]);

  const src = (id: string, mode: Theme = theme) =>
    `/admin/hero-preview/${slug}/${id}?theme=${mode}&v=${version}${still ? "&motion=off" : ""}`;
  const live = data.published;
  const ownName = `${data.site.name}'s own hero`;
  const editable = data.can_edit;
  const review = data.review;
  const canDecide = review && data.can_review && (!review.own || isOwner);
  const status = STATUS[data.status];
  const update = (id: string, patch: Partial<HeroVariant>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
  const setConfig = (id: string, patch: Partial<HeroConfig>) =>
    setDraft((d) => ({
      ...d,
      variants: d.variants.map((v) => (v.id === id ? { ...v, config: { ...v.config, ...patch } } : v)),
    }));

  async function run(name: string, task: () => Promise<string>) {
    setBusy(name);
    setMessage(null);
    setFields([]);
    try {
      setMessage({ tone: "ok", text: await task() });
      router.refresh();
    } catch (err) {
      if (err instanceof ApprovalRecorded) {
        setMessage({ tone: "ok", text: err.message });
        return;
      }
      if (err instanceof AdminError) {
        setFields(err.fields);
        setMessage({
          tone: "error",
          text:
            err.status === 422 ? (err.fields[0]?.message ?? "Some settings need attention.") : err.message,
        });
      } else setMessage({ tone: "error", text: "Something went wrong. Please try again." });
    } finally {
      setBusy(null);
    }
  }
  const save = () =>
    run("save", async () => {
      const result = await adminFetch<{ version: number }>(`sites/${slug}/hero/draft`, {
        document: draft,
        version,
      });
      setVersion(result.version);
      markSaved();
      return "Draft saved. Previews show it now; the website keeps the published hero until a reviewer approves.";
    });
  const act = (name: string, body: Record<string, unknown>, done: string, confirm?: string) => () => {
    if (confirm && !window.confirm(confirm)) return;
    return run(name, async () => {
      await adminFetch(`sites/${slug}/hero/${name}`, body);
      setNote("");
      return done;
    });
  };
  const duplicate = (v: HeroVariant) => {
    let n = draft.variants.length + 1;
    while (draft.variants.some((x) => x.id === `v${n}`)) n++;
    const copy = { ...v, id: `v${n}`, name: `${v.name} (copy)`.slice(0, 60), config: { ...v.config } };
    setDraft((d) => ({ ...d, variants: [...d.variants, copy] }));
    setEditing(copy.id);
  };

  if (data.designs.length === 0)
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-muted">
        {`${data.site.name} doesn't have its own hero designs yet. They're designed per product (never copied from another website); this website keeps its current hero.`}
      </p>
    );

  const editingVariant = draft.variants.find((v) => v.id === editing);
  const editFields = editingVariant ? HERO_DESIGNS[editingVariant.design].fields : [];
  const text = (key: keyof HeroConfig, label: string, max: number, hint?: string) => {
    if (!editingVariant || !editFields.includes(key)) return null;
    const id = `${uid}-${key}`;
    return (
      <div>
        <label htmlFor={id} className="block text-xs font-medium text-muted">
          {label}
        </label>
        <input
          id={id}
          maxLength={max}
          value={(editingVariant.config[key] as string | null | undefined) ?? ""}
          placeholder={hint ?? "Design's approved copy"}
          disabled={!editable}
          onChange={(e) => setConfig(editingVariant.id, { [key]: e.target.value || null })}
          className={cn(field, "mt-1")}
        />
      </div>
    );
  };
  const choice = <K extends keyof HeroConfig>(key: K, label: string, options: [HeroConfig[K], string][]) => {
    if (!editingVariant || !editFields.includes(key)) return null;
    const id = `${uid}-${key}`;
    return (
      <div>
        <label htmlFor={id} className="block text-xs font-medium text-muted">
          {label}
        </label>
        <select
          id={id}
          value={String(editingVariant.config[key] ?? DEFAULT_HERO_CONFIG[key])}
          disabled={!editable}
          onChange={(e) => setConfig(editingVariant.id, { [key]: e.target.value } as Partial<HeroConfig>)}
          className={cn(field, "mt-1")}
        >
          {options.map(([value, text]) => (
            <option key={String(value)} value={String(value)}>
              {text}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs", status.tone)}>{status.label}</span>
        <span className="text-xs text-muted">
          {live ? `Live: ${live.name} · version ${data.published_number}` : `Live: ${ownName}`}
        </span>
        <button
          type="button"
          aria-pressed={still}
          onClick={() => setStill((s) => !s)}
          className="ms-auto inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 text-sm text-muted hover:text-text"
        >
          {still ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
          {still ? "Play motion" : "Pause motion"}
        </button>
        <div
          role="radiogroup"
          aria-label="Preview theme"
          className="inline-flex gap-1 rounded-full border border-line bg-surface-2 p-1"
        >
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => setTheme(t)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm",
                theme === t ? "bg-surface font-medium text-text shadow-sm" : "text-muted hover:text-text",
              )}
            >
              {t === "light" ? (
                <Sun aria-hidden className="size-4" />
              ) : (
                <Moon aria-hidden className="size-4" />
              )}
              {t === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-subtle">
        Previews render the website&apos;s own hero components with the saved draft. Switching the preview
        theme changes these frames only.
      </p>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("text-sm", message.tone === "error" ? "text-danger" : "text-accent-strong")}
        >
          {message.text}
        </p>
      )}

      <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* What the website shows without a published design: listed first, labelled live when it is. */}
        <li
          data-variant={OWN}
          className={cn(
            "overflow-hidden rounded-2xl border bg-surface",
            draft.selected === OWN ? "border-accent/60" : "border-line",
          )}
        >
          <div className="relative border-b border-line bg-bg">
            <Frame src={src(OWN)} title={`${ownName} preview`} />
            <div className="absolute start-3 top-3 flex gap-1.5">
              {data.live === OWN && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[0.7rem] font-medium text-accent-ink">
                  Live
                </span>
              )}
              {draft.selected === OWN && (
                <span className="rounded-full border border-accent/50 bg-surface/90 px-2 py-0.5 text-[0.7rem] text-accent-strong">
                  Selected to publish
                </span>
              )}
            </div>
          </div>
          <div className="p-4">
            <p className="font-medium text-text">{ownName}</p>
            <p className="mt-0.5 text-xs text-subtle">
              {slug === "figbud"
                ? "The hero built into the home page, shown whenever no design is published."
                : "The hero section of the published home page (Page builder), shown whenever no design is published."}
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              <button
                type="button"
                title="See it before the world does."
                onClick={() => setPreview({ id: OWN, device: "desktop" })}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm text-text hover:bg-surface-2"
              >
                <Eye aria-hidden className="size-4" />
                Preview
              </button>
              {slug !== "figbud" && (
                <Link
                  href={`/admin/sites/${slug}/pages`}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm text-text hover:bg-surface-2"
                >
                  <Pencil aria-hidden className="size-4" />
                  Edit in Page builder
                </Link>
              )}
              {draft.selected !== OWN && (
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => setDraft((d) => ({ ...d, selected: OWN }))}
                  className="inline-flex min-h-10 items-center rounded-lg px-2.5 text-sm text-accent hover:bg-accent-soft disabled:opacity-50"
                >
                  Select for publishing
                </button>
              )}
            </div>
          </div>
        </li>
        {draft.variants.map((v) => {
          const isLive = live?.variant_id === v.id;
          const selected = draft.selected === v.id;
          return (
            <li
              key={v.id}
              data-variant={v.id}
              className={cn(
                "overflow-hidden rounded-2xl border bg-surface",
                selected ? "border-accent/60" : "border-line",
              )}
            >
              <div className="relative border-b border-line bg-bg">
                <Frame src={src(v.id)} title={`${v.name} preview`} />
                <div className="absolute start-3 top-3 flex gap-1.5">
                  {isLive && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[0.7rem] font-medium text-accent-ink">
                      Live
                    </span>
                  )}
                  {selected && (
                    <span className="rounded-full border border-accent/50 bg-surface/90 px-2 py-0.5 text-[0.7rem] text-accent-strong">
                      Selected to publish
                    </span>
                  )}
                </div>
              </div>
              <div className="p-4">
                <p className="font-medium text-text">{v.name}</p>
                <p className="mt-0.5 text-xs text-subtle">{HERO_DESIGNS[v.design].summary}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  <button
                    type="button"
                    title="See it before the world does."
                    onClick={() => setPreview({ id: v.id, device: "desktop" })}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm text-text hover:bg-surface-2"
                  >
                    <Eye aria-hidden className="size-4" />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(editing === v.id ? null : v.id)}
                    aria-expanded={editing === v.id}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm text-text hover:bg-surface-2"
                  >
                    <Pencil aria-hidden className="size-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={!editable || draft.variants.length >= 9}
                    onClick={() => duplicate(v)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm text-text hover:bg-surface-2 disabled:opacity-50"
                  >
                    <Copy aria-hidden className="size-4" />
                    Duplicate
                  </button>
                  {!selected && (
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => setDraft((d) => ({ ...d, selected: v.id }))}
                      className="inline-flex min-h-10 items-center rounded-lg px-2.5 text-sm text-accent hover:bg-accent-soft disabled:opacity-50"
                    >
                      Select for publishing
                    </button>
                  )}
                  {!selected && !isLive && draft.variants.length > 1 && (
                    <button
                      type="button"
                      disabled={!editable}
                      aria-label={`Remove ${v.name}`}
                      onClick={() =>
                        window.confirm(`Remove ${v.name} from the draft?`) &&
                        setDraft((d) => ({ ...d, variants: d.variants.filter((x) => x.id !== v.id) }))
                      }
                      className="ms-auto inline-flex size-10 items-center justify-center rounded-lg text-muted hover:text-danger disabled:opacity-50"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {editingVariant && (
        <section
          aria-label={`Edit ${editingVariant.name}`}
          className="rounded-2xl border border-line bg-surface p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-text">{`Edit · ${HERO_DESIGNS[editingVariant.design].name}`}</h2>
            {editable && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Reset "${editingVariant.name}" to the design's defaults?`)) return;
                  update(editingVariant.id, { config: { ...DEFAULT_HERO_CONFIG } });
                }}
                className="ms-auto min-h-10 rounded-lg px-3 text-sm font-medium text-accent hover:bg-accent-soft/60"
              >
                Reset to default
              </button>
            )}
            <button
              type="button"
              aria-label="Close editor"
              onClick={() => setEditing(null)}
              className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <p className="mt-1 text-sm text-muted">
            The design&apos;s structure stays fixed. Empty text keeps its approved copy; text applies to
            English pages (other languages keep their reviewed copy).
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label htmlFor={`${uid}-name`} className="block text-xs font-medium text-muted">
                Variant name
              </label>
              <input
                id={`${uid}-name`}
                maxLength={60}
                value={editingVariant.name}
                disabled={!editable}
                onChange={(e) => update(editingVariant.id, { name: e.target.value })}
                className={cn(field, "mt-1")}
              />
            </div>
            {text("eyebrow", "Eyebrow", 60)}
            {text("headline", "Headline", 90)}
            {text("headline_accent", "Headline, second line", 60)}
            <div className="sm:col-span-2 lg:col-span-4">{text("lead", "Supporting text", 260)}</div>
            {text("primary_label", "Main button label", 32)}
            {text("primary_href", "Main button goes to", 200, "/contact, #platforms or https://…")}
            {text("secondary_label", "Second button label", 32)}
            {text("secondary_href", "Second button goes to", 200, "/contact, #platforms or https://…")}
            {choice("speed", "Animation speed", [
              ["slow", "Slow"],
              ["normal", "Normal"],
              ["fast", "Fast"],
            ])}
            {choice("intensity", "Animation intensity", [
              ["subtle", "Subtle"],
              ["standard", "Standard"],
              ["bold", "Bold"],
            ])}
            {choice("height", "Section height", [
              ["auto", "Fit content"],
              ["tall", "Tall"],
              ["screen", "Full screen"],
            ])}
            {choice("align", "Content alignment", [
              ["start", "Start"],
              ["center", "Centred"],
            ])}
            {choice("accent", "Accent", [
              ["brand", "Brand"],
              ["blue", "Blue"],
              ["violet", "Violet"],
              ["neutral", "Neutral"],
            ])}
            {choice("mobile_layout", "Phone layout", [
              ["stacked", "Stacked"],
              ["compact", "Compact"],
            ])}
            {choice("theme_mode", "Light and dark mode", [
              ["design", "Keep the design's own look"],
              ["site", "Follow the website's mode"],
            ])}
          </div>
          {editFields.includes("badges") && (
            <fieldset className="mt-5">
              <legend className="text-xs font-medium text-muted">
                Badges under the buttons (empty keeps the approved ones)
              </legend>
              <div className="mt-1 grid gap-2 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <input
                    key={i}
                    aria-label={`Badge ${i + 1}`}
                    maxLength={40}
                    disabled={!editable}
                    value={editingVariant.config.badges?.[i] ?? ""}
                    onChange={(e) => {
                      const next = [0, 1, 2].map((j) =>
                        j === i ? e.target.value : (editingVariant.config.badges?.[j] ?? ""),
                      );
                      setConfig(editingVariant.id, { badges: next.some((b) => b.trim()) ? next : [] });
                    }}
                    className={field}
                  />
                ))}
              </div>
            </fieldset>
          )}
          {editFields.includes("products") && (
            <fieldset className="mt-5">
              <legend className="text-xs font-medium text-muted">
                Products shown, in order (none ticked shows every listed product)
              </legend>
              <ul className="mt-1 grid gap-1.5">
                {(() => {
                  const chosen = editingVariant.config.products ?? [];
                  const order = [
                    ...chosen.flatMap((s) => publicProducts.filter((p) => p.slug === s)),
                    ...publicProducts.filter((p) => !chosen.includes(p.slug)),
                  ];
                  const move = (slug: string, by: number) => {
                    const i = chosen.indexOf(slug);
                    const next = [...chosen];
                    const j = i + by;
                    if (i < 0 || j < 0 || j >= next.length) return;
                    [next[i], next[j]] = [next[j]!, next[i]!];
                    setConfig(editingVariant.id, { products: next });
                  };
                  return order.map((p) => {
                    const on = chosen.includes(p.slug);
                    return (
                      <li key={p.slug} className="flex items-center gap-2">
                        <label className="flex min-h-10 flex-1 items-center gap-2 text-sm text-text">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={!editable}
                            onChange={() =>
                              setConfig(editingVariant.id, {
                                products: on ? chosen.filter((s) => s !== p.slug) : [...chosen, p.slug],
                              })
                            }
                            className="size-5 accent-[var(--accent)]"
                          />
                          {p.name}
                        </label>
                        {on && (
                          <>
                            <button
                              type="button"
                              aria-label={`Move ${p.name} up`}
                              disabled={!editable || chosen.indexOf(p.slug) === 0}
                              onClick={() => move(p.slug, -1)}
                              className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-40"
                            >
                              <ArrowUp aria-hidden className="size-4" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${p.name} down`}
                              disabled={!editable || chosen.indexOf(p.slug) === chosen.length - 1}
                              onClick={() => move(p.slug, 1)}
                              className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-40"
                            >
                              <ArrowDown aria-hidden className="size-4" />
                            </button>
                          </>
                        )}
                      </li>
                    );
                  });
                })()}
              </ul>
            </fieldset>
          )}
          {editFields.includes("palette") && isPlatformDesign(editingVariant.design) && (
            <fieldset className="mt-5">
              <legend className="text-xs font-medium text-muted">
                {editingVariant.config.theme_mode === "site"
                  ? "Colours (following the website's mode: an override here still applies)"
                  : "Colours (the design's own; change any, or reset it)"}
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {HERO_PALETTE_KEYS.map((key: HeroPaletteKey) => {
                  const design = PLATFORM_LOOKS[editingVariant.design as keyof typeof PLATFORM_LOOKS];
                  const own = editingVariant.config.palette?.[key];
                  const id = `${uid}-colour-${key}`;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        id={id}
                        type="color"
                        disabled={!editable}
                        aria-describedby={own ? undefined : `${id}-hint`}
                        value={own ?? design.palette[key]}
                        onChange={(e) =>
                          setConfig(editingVariant.id, {
                            palette: { ...editingVariant.config.palette, [key]: e.target.value },
                          })
                        }
                        className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface"
                      />
                      <span className="min-w-0 flex-1 text-sm text-text">
                        <label htmlFor={id}>{PALETTE_LABELS[key]}</label>
                        {!own && (
                          <span id={`${id}-hint`} className="block text-xs text-subtle">
                            Design default
                          </span>
                        )}
                      </span>
                      {own && (
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => {
                            const rest = Object.fromEntries(
                              Object.entries(editingVariant.config.palette ?? {}).filter(([k]) => k !== key),
                            );
                            setConfig(editingVariant.id, { palette: rest });
                          }}
                          className="min-h-9 rounded-lg px-2 text-xs font-medium text-accent hover:bg-accent-soft/60"
                        >
                          Reset<span className="sr-only"> {PALETTE_LABELS[key]}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          )}
          {editFields.includes("motion") && (
            <label className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                disabled={!editable}
                checked={editingVariant.config.motion}
                onChange={(e) => setConfig(editingVariant.id, { motion: e.target.checked })}
                className="size-5 shrink-0 accent-[var(--accent)]"
              />
              Motion (visitors who prefer reduced motion always get a still hero)
            </label>
          )}
          {fields.length > 0 && (
            <p className="mt-3 text-sm text-danger">{fields.map((f) => f.message).join(" ")}</p>
          )}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold text-text">Publish</h2>
          <p className="mt-1 text-sm text-muted">
            Exactly one variant is live. Publishing the selected variant replaces the live one; the website
            updates at once, without a redeployment. Drafts never reach the website.
          </p>
          {review && (
            <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-muted">
              {`Approval requested by ${review.own ? "you" : (review.requested_by ?? "someone")}${review.note ? `: “${review.note}”` : "."}`}
            </p>
          )}
          <label htmlFor={`${uid}-note`} className="mt-4 block text-xs font-medium text-muted">
            Note
          </label>
          <input
            id={`${uid}-note`}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={cn(field, "mt-1")}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {editable && (
              <ActionButton
                ready={dirty}
                busy={busy === "save"}
                hint={dirty ? undefined : "No changes to save."}
                onClick={save}
              >
                Save draft
              </ActionButton>
            )}
            {editable && dirty && (
              <ActionButton
                variant="ghost"
                ready
                onClick={() => {
                  if (!window.confirm("Discard your unsaved changes?")) return;
                  setDraft(data.draft);
                  markSaved(data.draft);
                  setMessage({ tone: "ok", text: "Changes discarded: back to the saved draft." });
                }}
              >
                Discard changes
              </ActionButton>
            )}
            {!review && editable && (
              <ActionButton
                variant="secondary"
                ready={!dirty && data.status !== "published" && data.status !== "own"}
                busy={busy === "submit"}
                hint={
                  dirty
                    ? "Save the draft first."
                    : data.status === "published" || data.status === "own"
                      ? "The selected variant is already live."
                      : undefined
                }
                onClick={act("submit", { note }, "Approval requested. A different reviewer publishes it.")}
              >
                Ask for approval
              </ActionButton>
            )}
            {review && data.can_review && (
              <>
                <ActionButton
                  ready={Boolean(canDecide)}
                  busy={busy === "publish"}
                  hint={review.own && !isOwner ? "Another reviewer approves your own request." : undefined}
                  title="Everything checked? You're ready to go live."
                  onClick={act("publish", { note }, "Published. The website shows this hero now.")}
                >
                  Approve and publish
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  ready={Boolean(canDecide)}
                  busy={busy === "reject"}
                  onClick={act("reject", { note }, "Request declined; the draft is kept.")}
                >
                  Decline
                </ActionButton>
              </>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold text-text">Version history</h2>
          {data.versions.length === 0 ? (
            <p className="mt-2 text-sm text-subtle">
              Nothing published yet: the website shows its current hero.
            </p>
          ) : (
            <ol className="mt-3 divide-y divide-line">
              {data.versions.map((ver) => (
                <li key={ver.number} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-text">
                      {`Version ${ver.number} · ${ver.hero?.name ?? ownName}`}
                      {ver.number === data.published_number && (
                        <span className="ms-2 text-xs text-accent-strong">Live</span>
                      )}
                    </p>
                    <p className="text-xs text-subtle">{`${ver.note} · ${ver.published_by ?? "someone"} · ${new Date(ver.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}</p>
                  </div>
                  {data.can_review && ver.number !== data.published_number && (
                    <ActionButton
                      variant="secondary"
                      ready
                      busy={busy === "rollback"}
                      onClick={act(
                        "rollback",
                        { version: ver.number },
                        `Rolled back: version ${ver.number} is live again.`,
                        `Make version ${ver.number} (${ver.hero?.name ?? ownName}) live again?`,
                      )}
                    >
                      Roll back to this
                    </ActionButton>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <dialog
        ref={dialog}
        aria-label="Hero preview"
        onClose={() => setPreview(null)}
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-bg p-0 backdrop:bg-black/60"
      >
        {preview && (
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <p className="font-medium text-text">
                {preview.id === OWN ? ownName : draft.variants.find((v) => v.id === preview.id)?.name}
              </p>
              <div
                role="radiogroup"
                aria-label="Device"
                className="inline-flex gap-1 rounded-full border border-line bg-surface-2 p-1"
              >
                {(Object.keys(DEVICES) as Device[]).map((d) => {
                  const { Icon, label } = DEVICES[d];
                  return (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={preview.device === d}
                      onClick={() => setPreview({ ...preview, device: d })}
                      className={cn(
                        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm",
                        preview.device === d ? "bg-surface font-medium text-text shadow-sm" : "text-muted",
                      )}
                    >
                      <Icon aria-hidden className="size-4" />
                      {label}
                    </button>
                  );
                })}
              </div>
              <div
                role="radiogroup"
                aria-label="Theme"
                className="inline-flex gap-1 rounded-full border border-line bg-surface-2 p-1"
              >
                {(["light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={theme === t}
                    onClick={() => setTheme(t)}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm",
                      theme === t ? "bg-surface font-medium text-text shadow-sm" : "text-muted",
                    )}
                  >
                    {t === "light" ? (
                      <Sun aria-hidden className="size-4" />
                    ) : (
                      <Moon aria-hidden className="size-4" />
                    )}
                    {t === "light" ? "Light" : "Dark"}
                  </button>
                ))}
              </div>
              <a
                href={src(preview.id)}
                target="_blank"
                rel="noopener"
                className="ms-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-text hover:bg-surface-2"
              >
                <Maximize2 aria-hidden className="size-4" />
                Full screen
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
              <button
                type="button"
                aria-label="Close preview"
                onClick={() => setPreview(null)}
                className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="flex flex-1 items-start justify-center overflow-auto bg-surface-2 p-6">
              <div className="overflow-hidden rounded-xl border border-line shadow-[var(--shadow-elevated)]">
                <iframe
                  key={`${preview.id}-${preview.device}-${theme}-${version}`}
                  src={src(preview.id)}
                  title={`Preview on ${DEVICES[preview.device].label}`}
                  className="block border-0 bg-bg"
                  style={{
                    width: DEVICES[preview.device].width,
                    height: Math.min(DEVICES[preview.device].height, 900),
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </dialog>
      {dirty && (
        <p className="text-xs text-subtle">Unsaved changes: save the draft to see them in the previews.</p>
      )}
    </div>
  );
}
