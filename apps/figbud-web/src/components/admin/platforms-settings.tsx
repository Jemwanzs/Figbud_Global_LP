"use client";

import {
  type ShowcaseSettings,
  type WebsiteSettings,
  orderBySlug,
  showcaseProducts,
  showcaseSettings,
} from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, type FieldError, adminFetch } from "@/lib/admin-client";
import { useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { LocalTime } from "./local-time";
import type { WebsiteSettingsAdmin } from "./website-settings";

type Motion = NonNullable<WebsiteSettings["motion"]>;
type Form = { showcase: ShowcaseSettings; motion: Motion };

const INTENSITY: [ShowcaseSettings["intensity"], string, string][] = [
  ["subtle", "Subtle", "Barely any depth: products slide almost flat."],
  ["standard", "Standard", "Products off centre shrink and fade slightly."],
  ["bold", "Bold", "A little more depth, still without zooming."],
];
const SMOOTHNESS: [ShowcaseSettings["smoothness"], string, string][] = [
  ["direct", "Direct", "Exactly with the scroll."],
  ["smooth", "Smooth", "Eases in behind the scroll."],
  ["gentle", "Gentle", "A slower, softer glide."],
];
const MOBILE: [ShowcaseSettings["mobile"], string, string][] = [
  ["swipe", "Swipe carousel", "Recommended. Visitors swipe or tap; the page scrolls normally."],
  [
    "scroll_where_comfortable",
    "Scroll-driven where it fits",
    "Only on screens where the whole showcase fits; others keep the carousel.",
  ],
];

/**
 * Studio → FigBud Global → Our Platforms (UI-MO5): how the home page's
 * product showcase behaves, and (P14-W13) whether it shows at all and which
 * products it shows. Stored in the website's settings (the same document,
 * audit and version check as navigation and forms): saved as a draft,
 * published, kept for rollback. Hiding a product here never touches its
 * website or any other listing.
 */
export function PlatformsSettingsForm({
  slug,
  data,
  products,
}: {
  slug: string;
  data: WebsiteSettingsAdmin;
  /** Public products in their usual order. */
  products: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const uid = useId();
  const canEdit = data.can_edit;
  // The document as last saved, sent back with each change (the rest unchanged).
  const [base, setBase] = useState(data.settings);
  /** A form from stored settings: every public product listed, in the saved order. */
  const toForm = (
    showcaseIn: Partial<ShowcaseSettings> | undefined,
    motionIn: WebsiteSettings["motion"],
  ): Form => {
    const showcase = showcaseSettings(showcaseIn);
    return {
      showcase: { ...showcase, order: orderBySlug(products, showcase.order).map((p) => p.slug) },
      motion: {
        product_rotation: motionIn?.product_rotation ?? false,
        rotation_seconds: motionIn?.rotation_seconds ?? 9,
      },
    };
  };
  const published = () => toForm(base.showcase, base.motion);
  // A saved draft opens first; otherwise what visitors see.
  const [form, setForm] = useState<Form>(() =>
    data.settings.showcase_draft
      ? toForm(data.settings.showcase_draft.showcase, data.settings.showcase_draft.motion)
      : toForm(data.settings.showcase, data.settings.motion),
  );
  // The settings version to save against: from the last save, or a newer one from a refresh.
  const [version, setVersion] = useState(data.version);
  const [seenVersion, setSeenVersion] = useState(data.version);
  if (data.version !== seenVersion) {
    setSeenVersion(data.version);
    setVersion((v) => Math.max(v, data.version));
  }
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(canEdit && dirty);
  const errorFor = (field: string) => fields.find((f) => f.field === field)?.message;
  const disabled = !canEdit || busy;
  const scroll = form.showcase.scroll_driven;
  const set = (patch: Partial<ShowcaseSettings>) =>
    setForm((f) => ({ ...f, showcase: { ...f.showcase, ...patch } }));
  const names = new Map(products.map((p) => [p.slug, p.name]));

  async function save(kind: "draft" | "publish" | "discard") {
    setBusy(true);
    setFields([]);
    setMessage(null);
    const patch =
      kind === "draft"
        ? { showcase_draft: { showcase: form.showcase, motion: form.motion } }
        : kind === "publish"
          ? { showcase: form.showcase, motion: form.motion, showcase_draft: null }
          : { showcase_draft: null };
    try {
      // The rest of the document is sent back unchanged.
      const saved = await adminFetch<WebsiteSettingsAdmin>(`sites/${slug}/settings`, {
        settings: { ...base, ...patch },
        version,
      });
      setVersion(saved.version);
      setBase(saved.settings);
      if (kind === "discard") setForm(toForm(saved.settings.showcase, saved.settings.motion));
      markSaved();
      setMessage({
        tone: "ok",
        text:
          kind === "draft"
            ? "Draft saved. Visitors still see the published Our Platforms."
            : kind === "publish"
              ? "Published. The home page shows the change at once."
              : "Draft discarded.",
      });
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

  const toggle = (
    id: string,
    label: string,
    hint: string,
    checked: boolean,
    onChange: () => void,
    off = false,
  ) => (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-line p-4 sm:p-5">
      <div className="max-w-xl">
        <p id={`${uid}-${id}`} className="font-medium text-text">
          {label}
        </p>
        <p id={`${uid}-${id}-hint`} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${uid}-${id}`}
        aria-describedby={`${uid}-${id}-hint`}
        disabled={disabled || off}
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
    </div>
  );

  const choice = <K extends "intensity" | "smoothness" | "mobile">(
    key: K,
    legend: string,
    options: [ShowcaseSettings[K], string, string][],
    off = false,
  ) => (
    <fieldset disabled={disabled || off} className="disabled:opacity-60">
      <legend className="text-sm font-medium text-text">{legend}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {options.map(([value, label, hint]) => (
          <label
            key={value}
            className={cn(
              "flex min-h-11 cursor-pointer gap-3 rounded-2xl border p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
              form.showcase[key] === value
                ? "border-accent bg-accent/5"
                : "border-line hover:border-line-strong",
            )}
          >
            <input
              type="radio"
              name={`${uid}-${key}`}
              value={value}
              checked={form.showcase[key] === value}
              onChange={() => set({ [key]: value } as Partial<ShowcaseSettings>)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
            />
            <span>
              <span className="block text-sm font-medium text-text">{label}</span>
              <span className="mt-0.5 block text-xs text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  const order = form.showcase.order;
  const move = (i: number, to: number) => {
    const next = [...order];
    [next[i], next[to]] = [next[to]!, next[i]!];
    set({ order: next });
  };
  const hidden = new Set(form.showcase.hidden);
  // A hidden product keeps its place, so showing it again restores its position.
  const toggleShown = (product: string) =>
    set({
      hidden: hidden.has(product)
        ? form.showcase.hidden.filter((p) => p !== product)
        : [...form.showcase.hidden, product],
    });
  // What visitors will see once published: the same rule as the home page.
  const shown = showcaseProducts(products, form.showcase);
  const sameAsPublished = JSON.stringify(form) === JSON.stringify(published());

  return (
    <form
      className="space-y-10"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (canEdit) void save("publish");
      }}
    >
      <fieldset className="space-y-4">
        <legend className="font-semibold text-text">The section</legend>
        {toggle(
          "enabled",
          "Show Our Platforms on FigBud Global",
          "Off: the home page leaves the section out entirely. Every setting below is kept for when it's back.",
          form.showcase.enabled,
          () => set({ enabled: !form.showcase.enabled }),
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-semibold text-text">Scroll-driven showcase</legend>
        {toggle(
          "scroll",
          "Scroll-driven animation",
          "Scrolling down moves through the products, then the page carries on. Never for visitors who prefer reduced motion. Off: the carousel, moved by tabs, arrows and swipes.",
          scroll,
          () => set({ scroll_driven: !scroll }),
        )}
        {toggle(
          "sticky",
          "Sticky showcase",
          "Keeps the showcase in view while scrolling through the products. It only stays in view on screens where it fits whole; others get the carousel. Off: products move as the section passes.",
          form.showcase.sticky,
          () => set({ sticky: !form.showcase.sticky }),
          !scroll,
        )}
        {choice("intensity", "Animation intensity", INTENSITY, !scroll)}
        {choice("smoothness", "Transition smoothness", SMOOTHNESS, !scroll)}
        {choice("mobile", "On phones and small tablets", MOBILE, !scroll)}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-semibold text-text">Controls</legend>
        {toggle(
          "arrows",
          "Previous and next arrows",
          "Product tabs, swipes and the keyboard always work.",
          form.showcase.show_arrows,
          () => set({ show_arrows: !form.showcase.show_arrows }),
        )}
        {toggle(
          "progress",
          "Progress dots and position",
          "“2 of 4” and the dots. Screen readers are told the position either way.",
          form.showcase.show_progress,
          () => set({ show_progress: !form.showcase.show_progress }),
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-text">Products and order</legend>
        <p className="text-sm text-muted">
          Which products Our Platforms shows, and in what order. A hidden product keeps its place and its
          website, and stays on every other page. Products added later follow at the end, shown.
        </p>
        <ol className="space-y-2">
          {order.map((product, i) => (
            <li
              key={product}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-line px-4 py-2"
              data-order={product}
            >
              <span className="w-5 font-mono text-sm text-subtle">{i + 1}</span>
              <span className={cn("flex-1 font-medium", hidden.has(product) ? "text-subtle" : "text-text")}>
                {names.get(product) ?? product}
                {hidden.has(product) && <span className="ms-2 text-xs font-normal">Hidden</span>}
              </span>
              {/* Show on FigBud: independent of the order. */}
              <button
                type="button"
                role="switch"
                aria-checked={!hidden.has(product)}
                aria-label={`Show ${names.get(product) ?? product} in Our Platforms`}
                disabled={disabled}
                onClick={() => toggleShown(product)}
                data-shown={!hidden.has(product)}
                className={cn(
                  "relative me-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
                  !hidden.has(product) ? "border-accent bg-accent" : "border-line-strong bg-surface-3",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none",
                    !hidden.has(product)
                      ? "translate-x-6 rtl:-translate-x-6"
                      : "translate-x-1 rtl:-translate-x-1",
                  )}
                />
              </button>
              {[
                { label: "Move up", Icon: ArrowUp, to: i - 1 },
                { label: "Move down", Icon: ArrowDown, to: i + 1 },
              ].map(({ label, Icon, to }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={`${label}: ${names.get(product) ?? product}`}
                  disabled={disabled || to < 0 || to >= order.length}
                  onClick={() => move(i, to)}
                  className="inline-flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
                >
                  <Icon aria-hidden className="size-4" />
                </button>
              ))}
            </li>
          ))}
        </ol>
        {errorFor("showcase.order") && <p className="text-sm text-danger">{errorFor("showcase.order")}</p>}
        {errorFor("showcase.hidden") && <p className="text-sm text-danger">{errorFor("showcase.hidden")}</p>}
        {/* The preview: exactly what the home page will show once published. */}
        <div className="rounded-2xl border border-line bg-surface-2/60 p-4" data-showcase-preview="">
          <p className="text-sm font-medium text-text">Visitors will see</p>
          {shown.length === 0 ? (
            <p className="mt-1 text-sm text-muted" data-preview-empty="">
              {form.showcase.enabled
                ? "No products: the home page leaves Our Platforms out."
                : "Our Platforms is switched off: the home page leaves it out."}
            </p>
          ) : (
            <>
              <ol className="mt-2 flex flex-wrap items-center gap-2 text-sm" aria-label="Products shown">
                {shown.map((p, i) => (
                  <li key={p.slug} className="flex items-center gap-2">
                    {i > 0 && (
                      <span aria-hidden className="text-subtle">
                        →
                      </span>
                    )}
                    <span className="rounded-full bg-surface px-3 py-1 text-text">{p.name}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-subtle" data-preview-position="">
                {shown.length === 1
                  ? "One product: shown on its own, without carousel controls or rotation."
                  : `1 of ${shown.length}, with ${shown.length} dots${form.motion.product_rotation ? ", rotating through these alone" : ""}.`}
              </p>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-semibold text-text">Automatic rotation</legend>
        {toggle(
          "rotate",
          "Rotate products slowly",
          "Where the carousel shows (scroll-driven off, phones, screens it can't fit), it moves to the next product on its own. It pauses on hover, focus, any tap or swipe and while off screen, has a pause button, and never moves for visitors who prefer reduced motion.",
          form.motion.product_rotation,
          () =>
            setForm((f) => {
              const seconds = f.motion.rotation_seconds;
              // Turning rotation off hides the seconds: an invalid value there mustn't block saving.
              const valid = Number.isInteger(seconds) && seconds >= 6 && seconds <= 20;
              return {
                ...f,
                motion: {
                  product_rotation: !f.motion.product_rotation,
                  rotation_seconds: f.motion.product_rotation && !valid ? 9 : seconds,
                },
              };
            }),
        )}
        {form.motion.product_rotation && (
          <div className="max-w-xs">
            <label htmlFor={`${uid}-seconds`} className="block text-sm font-medium text-text">
              Seconds on each product
            </label>
            <input
              id={`${uid}-seconds`}
              type="number"
              inputMode="numeric"
              min={6}
              max={20}
              value={form.motion.rotation_seconds}
              disabled={disabled}
              aria-invalid={Boolean(errorFor("motion.rotation_seconds"))}
              onChange={(e) =>
                setForm((f) => ({ ...f, motion: { ...f.motion, rotation_seconds: Number(e.target.value) } }))
              }
              className="mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-text disabled:opacity-60"
            />
            <p className="mt-1.5 text-sm text-subtle">
              {errorFor("motion.rotation_seconds") ?? "6 to 20 seconds."}
            </p>
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        {canEdit && (
          <>
            <ActionButton
              type="button"
              variant="secondary"
              ready={dirty}
              busy={busy}
              hint="Nothing new to save"
              onClick={() => void save("draft")}
            >
              Save draft
            </ActionButton>
            <ActionButton type="submit" ready={!sameAsPublished} busy={busy} hint="Matches what's published">
              Publish
            </ActionButton>
            {base.showcase_draft && (
              <button
                type="button"
                onClick={() => void save("discard")}
                className="text-sm text-muted hover:text-text"
              >
                Discard draft
              </button>
            )}
          </>
        )}
        {dirty && (
          <p className="text-sm text-warning" data-unsaved="">
            Unsaved changes
          </p>
        )}
        <a
          href="/en#platforms"
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-text"
        >
          See it on the home page
          <ExternalLink aria-hidden className="size-3.5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        {message && (
          <p role="status" className={cn("text-sm", message.tone === "ok" ? "text-success" : "text-danger")}>
            {message.text}
          </p>
        )}
      </div>
      {(base.showcase_history?.length ?? 0) > 0 && (
        <details className="rounded-2xl border border-line p-4 text-sm">
          <summary className="cursor-pointer font-medium text-text">Published versions</summary>
          <ul className="mt-2 space-y-2">
            {base.showcase_history!.map((v) => (
              <li key={v.published_at} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted">
                  <LocalTime iso={v.published_at} />
                  {v.by && ` · ${v.by}`} ·{" "}
                  {showcaseProducts(products, showcaseSettings(v.showcase))
                    .map((p) => p.name)
                    .join(", ") || "section off"}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setForm(toForm(v.showcase, v.motion))}
                    className="text-accent-strong underline underline-offset-2"
                  >
                    Load to restore
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-subtle">
            Loading a version fills the form; publish it to restore it.
          </p>
        </details>
      )}
    </form>
  );
}
