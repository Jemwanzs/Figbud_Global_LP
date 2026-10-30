"use client";

import {
  PageBlocks,
  type PageCta,
  type PageDocument,
  type PageSection,
  type SectionTone,
  type SiteTheme,
  siteThemeStyle,
} from "@figbud/site-kit";
import { buttonClasses, cn } from "@figbud/ui";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  LoaderCircle,
  Monitor,
  Plus,
  Redo2,
  Smartphone,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

import { type AdminUser, AdminError, adminFetch, hasRole } from "@/lib/admin-client";
import { sameValue, useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { LocalTime, fromLocalInput, localInputFromNow } from "./local-time";
import {
  BLOCKS,
  type BlockType,
  type MediaItem,
  PATH_PATTERN,
  type SharedItem,
  type PageDetail,
  STUDIO_MEDIA_BASE,
  blockLabel,
  copySection,
  newSection,
} from "./page-types";

type Draft = { title: string; path: string; document: PageDocument };
type SaveState = "saved" | "unsaved" | "saving" | "invalid" | "conflict" | "error";

const when = (iso: string) => `${new Date(iso).toUTCString().slice(5, 22)} UTC`;
const STATE_LABELS = {
  pending: "Awaiting approval",
  scheduled: "Scheduled",
  published: "Published",
  rejected: "Rejected",
  cancelled: "Cancelled",
};
const KNOWN = ["figbud", "zirahr", "jasiri", "expense_now", "ziwa"];

/** Why a requested go-live time can't be used, or null (mirrors the API's rule). */
function scheduleProblem(iso: string | null): string | null {
  if (!iso) return "Choose when it goes live";
  const at = new Date(iso).getTime();
  if (at <= Date.now() + 60_000) return "Choose a time at least a minute from now";
  if (at > Date.now() + 366 * 864e5) return "Choose a time within the next year";
  return null;
}
const isPast = (iso: string) => new Date(iso).getTime() <= Date.now();
const inputClass =
  "mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text disabled:opacity-60";

function TextField({
  label,
  value,
  onChange,
  max,
  multiline,
  mono,
  disabled,
  hint,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  max: number;
  multiline?: boolean;
  mono?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-muted">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value ?? ""}
          maxLength={max}
          rows={4}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, "py-2.5", mono && "font-mono")}
        />
      ) : (
        <input
          id={id}
          value={value ?? ""}
          maxLength={max}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, mono && "font-mono")}
        />
      )}
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}

function CtaFields({
  label,
  cta,
  onChange,
  optional,
  disabled,
}: {
  label: string;
  cta: PageCta | null | undefined;
  onChange: (cta: PageCta | null) => void;
  optional?: boolean;
  disabled?: boolean;
}) {
  if (!cta) {
    return optional && !disabled ? (
      <button
        type="button"
        onClick={() => onChange({ label: "Learn more", href: "/" })}
        className="text-sm font-medium text-accent hover:underline"
      >
        Add {label.toLowerCase()}
      </button>
    ) : null;
  }
  return (
    <fieldset className="rounded-xl border border-line p-3">
      <legend className="px-1 text-xs font-medium text-muted">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Button text"
          value={cta.label}
          max={40}
          disabled={disabled}
          onChange={(v) => onChange({ ...cta, label: v })}
        />
        <TextField
          label="Link"
          value={cta.href}
          max={300}
          mono
          disabled={disabled}
          hint="/contact, or https://…"
          onChange={(v) => onChange({ ...cta, href: v })}
        />
      </div>
      {optional && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-2 text-xs text-subtle hover:text-text"
        >
          Remove button
        </button>
      )}
    </fieldset>
  );
}

/** Editable lists inside a block (features, steps, figures, questions): 1–12 items. */
function Items<T>({
  items,
  onChange,
  blank,
  noun,
  disabled,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  blank: T;
  noun: string;
  disabled?: boolean;
  render: (item: T, set: (item: T) => void) => ReactNode;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-subtle">
            <span>
              {noun} {i + 1}
            </span>
            {!disabled && items.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="hover:text-danger"
              >
                Remove
                <span className="sr-only">
                  {" "}
                  {noun} {i + 1}
                </span>
              </button>
            )}
          </div>
          <div className="grid gap-3">
            {render(item, (next) => onChange(items.map((x, j) => (j === i ? next : x))))}
          </div>
        </div>
      ))}
      {!disabled && items.length < 12 && (
        <button
          type="button"
          onClick={() => onChange([...items, structuredClone(blank)])}
          className="text-sm font-medium text-accent hover:underline"
        >
          Add {noun.toLowerCase()}
        </button>
      )}
    </div>
  );
}

const TONES: { value: SectionTone | undefined; label: string; hint: string }[] = [
  { value: undefined, label: "Default", hint: "On the page background" },
  { value: "brand", label: "Brand band", hint: "White text on the website's brand colour" },
  { value: "soft", label: "Soft band", hint: "A light tint (a deep tint in dark mode)" },
];

/** A section's style: none, or a band in the website's theme colours (Navigation & forms → Theme). */
function ToneField({
  tone,
  label,
  theme,
  disabled,
  onChange,
}: {
  tone?: SectionTone;
  label: string;
  theme?: SiteTheme;
  disabled: boolean;
  onChange: (tone: SectionTone | undefined) => void;
}) {
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="text-sm font-medium text-text">Section style</p>
      <div role="radiogroup" aria-label={`${label} section style`} className="mt-2 grid gap-2 sm:grid-cols-3">
        {TONES.map((t) => {
          const selected = tone === t.value;
          return (
            <button
              key={t.label}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(t.value)}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-start transition-colors disabled:opacity-60",
                selected ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong",
              )}
            >
              <span
                aria-hidden
                style={{
                  background:
                    t.value === "brand"
                      ? (theme?.brand_section ?? "#1e293b")
                      : t.value === "soft"
                        ? (theme?.soft_section ?? "#f1f5f9")
                        : "transparent",
                }}
                className="mt-0.5 size-4 shrink-0 rounded-full border border-line-strong"
              />
              <span>
                <span className="block text-sm text-text">{t.label}</span>
                <span className="block text-xs text-subtle">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * How the page appears in search results and when shared (P7-G1): a result
 * preview, the page's own sharing image, keeping it out of search engines,
 * and the old addresses that forward to it.
 */
function SearchSettings({
  siteName,
  title,
  path,
  description,
  imageId,
  noindex,
  library,
  redirects,
  disabled,
  onImage,
  onNoindex,
  onRemoveRedirect,
}: {
  siteName: string;
  title: string;
  path: string;
  description: string;
  imageId: string | null;
  noindex: boolean;
  library: MediaItem[] | null;
  redirects: { from_path: string; created_at: string }[];
  disabled: boolean;
  onImage: (id: string | null) => void;
  onNoindex: (on: boolean) => void;
  onRemoveRedirect: (from: string) => Promise<void>;
}) {
  const uid = useId();
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
  return (
    <div className="mt-6 space-y-5 border-t border-line pt-5">
      <div>
        <p className="text-xs font-medium tracking-wide text-subtle uppercase">Search result preview</p>
        <div className="mt-2 rounded-xl border border-line bg-surface p-4" aria-label="Search result preview">
          <p className="truncate text-xs text-muted">
            {siteName} › {path ? path.split("/").join(" › ") : "home"}
          </p>
          <p className="mt-1 truncate text-base text-[#8ab4f8] [[data-theme=light]_&]:text-[#1a0dab]">
            {clip(title, 70)}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-muted">
            {description
              ? clip(description, 170)
              : "Without a description, search engines pick text from the page."}
          </p>
        </div>
      </div>

      <div>
        <label htmlFor={`${uid}-image`} className="block text-sm font-medium text-text">
          Sharing image
        </label>
        <select
          id={`${uid}-image`}
          value={imageId ?? ""}
          disabled={disabled || library === null}
          onChange={(e) => onImage(e.target.value || null)}
          className="mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text disabled:opacity-60"
        >
          <option value="">The website&apos;s sharing image</option>
          {(library ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-subtle">
          Shown when the page is shared on LinkedIn, WhatsApp, X and similar. Wide images (about 1200 × 630)
          work best.
        </p>
        {imageId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${STUDIO_MEDIA_BASE}${imageId}?w=480`}
            alt=""
            className="mt-2 aspect-[1200/630] w-full rounded-xl border border-line bg-surface-2 object-cover"
          />
        )}
      </div>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-text">
        <input
          type="checkbox"
          checked={noindex}
          disabled={disabled}
          onChange={(e) => onNoindex(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
        />
        <span>
          Hide from search engines
          <span className="mt-0.5 block text-subtle">
            For pages like thank-you or campaign pages. Visitors can still open the page; it&apos;s left out
            of the sitemap.
          </span>
        </span>
      </label>

      <div>
        <p className="text-sm font-medium text-text">Old addresses</p>
        {redirects.length === 0 ? (
          <p className="mt-1 text-xs text-subtle">
            When a published page moves, its old address forwards here automatically.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {redirects.map((r) => (
              <li
                key={r.from_path}
                className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2"
              >
                <span className="min-w-0 truncate font-mono text-sm text-text">{r.from_path}</span>
                {!disabled && (
                  <button
                    type="button"
                    disabled={removing === r.from_path}
                    onClick={async () => {
                      setRemoving(r.from_path);
                      setError(null);
                      try {
                        await onRemoveRedirect(r.from_path);
                      } catch {
                        setError("That didn't work. Please try again.");
                      } finally {
                        setRemoving(null);
                      }
                    }}
                    className="shrink-0 text-sm text-muted hover:text-danger disabled:opacity-50"
                  >
                    Stop forwarding<span className="sr-only"> {r.from_path}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function BlockForm({
  section,
  library = null,
  sharedLibrary = null,
  slug = "",
  onChange,
  disabled,
}: {
  section: PageSection;
  library?: MediaItem[] | null;
  sharedLibrary?: SharedItem[] | null;
  slug?: string;
  onChange: (s: PageSection) => void;
  disabled: boolean;
}) {
  const p = { disabled };
  switch (section.type) {
    case "shared": {
      const item = sharedLibrary?.find((i) => i.id === section.shared_id);
      return (
        <div className="grid gap-3">
          <label className="block text-sm font-medium text-text">
            Shared content
            <select
              value={section.shared_id}
              disabled={disabled || sharedLibrary === null}
              onChange={(e) => onChange({ ...section, shared_id: e.target.value })}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm font-normal text-text disabled:opacity-60"
            >
              {(sharedLibrary ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.published_number ? "" : " (not published yet)"}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-subtle">
            {item?.published_number
              ? `Shows version ${item.published_number} and updates when a new version is published, on every website using it.`
              : "It appears on the website once a reviewer publishes it."}{" "}
            <Link
              href={`/admin/content/${section.shared_id}`}
              className="text-accent underline underline-offset-2"
            >
              Edit in the content library
            </Link>
          </p>
        </div>
      );
    }
    case "image":
      return (
        <div className="grid gap-4">
          <div>
            <p className="text-sm font-medium text-text">Image</p>
            {library === null ? (
              <p className="mt-2 text-sm text-subtle">Loading the media library…</p>
            ) : (
              <div
                role="radiogroup"
                aria-label="Image"
                className="mt-2 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3"
              >
                {library.map((m) => {
                  const selected = section.image_id === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={m.label}
                      disabled={disabled}
                      onClick={() => onChange({ ...section, image_id: m.id })}
                      className={cn(
                        "overflow-hidden rounded-xl border-2 text-start transition-colors disabled:opacity-60",
                        selected ? "border-accent" : "border-transparent hover:border-line-strong",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${STUDIO_MEDIA_BASE}${m.id}?w=480`}
                        alt=""
                        loading="lazy"
                        className="aspect-[4/3] w-full bg-surface-2 object-cover"
                      />
                      <span className="block truncate px-2 py-1.5 text-xs text-muted">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-subtle">
              Alt text comes from the library, so it&apos;s written once.{" "}
              <Link href={`/admin/sites/${slug}/media`} className="text-accent underline underline-offset-2">
                Manage media
              </Link>
            </p>
          </div>
          <TextField
            label="Caption (optional)"
            value={section.caption}
            max={200}
            {...p}
            onChange={(v) => onChange({ ...section, caption: v })}
          />
          <div role="radiogroup" aria-label="Image width" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { value: "content", label: "Text width" },
                { value: "wide", label: "Full width" },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={(section.size ?? "content") === o.value}
                disabled={disabled}
                onClick={() => onChange({ ...section, size: o.value })}
                className={cn(
                  "min-h-11 rounded-xl border px-3 text-sm text-text transition-colors disabled:opacity-60",
                  (section.size ?? "content") === o.value
                    ? "border-accent bg-accent-soft"
                    : "border-line hover:border-line-strong",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      );
    case "hero":
      return (
        <div className="grid gap-3">
          <TextField
            label="Eyebrow (optional)"
            value={section.eyebrow}
            max={60}
            {...p}
            onChange={(v) => onChange({ ...section, eyebrow: v })}
          />
          <TextField
            label="Headline"
            value={section.heading}
            max={120}
            {...p}
            onChange={(v) => onChange({ ...section, heading: v })}
          />
          <TextField
            label="Introduction (optional)"
            value={section.lead}
            max={400}
            multiline
            {...p}
            onChange={(v) => onChange({ ...section, lead: v })}
          />
          <CtaFields
            label="Primary button"
            cta={section.primary}
            optional
            {...p}
            onChange={(c) => onChange({ ...section, primary: c })}
          />
          <CtaFields
            label="Secondary button"
            cta={section.secondary}
            optional
            {...p}
            onChange={(c) => onChange({ ...section, secondary: c })}
          />
        </div>
      );
    case "text":
      return (
        <div className="grid gap-3">
          <TextField
            label="Heading (optional)"
            value={section.heading}
            max={120}
            {...p}
            onChange={(v) => onChange({ ...section, heading: v })}
          />
          <TextField
            label="Text (Markdown)"
            value={section.body}
            max={10000}
            multiline
            mono
            hint="## Subheading, **bold**, lists with - and [links](/contact). HTML isn't allowed."
            {...p}
            onChange={(v) => onChange({ ...section, body: v })}
          />
        </div>
      );
    case "feature_grid":
      return (
        <div className="grid gap-3">
          <TextField
            label="Heading (optional)"
            value={section.heading}
            max={120}
            {...p}
            onChange={(v) => onChange({ ...section, heading: v })}
          />
          <TextField
            label="Introduction (optional)"
            value={section.intro}
            max={400}
            {...p}
            onChange={(v) => onChange({ ...section, intro: v })}
          />
          <Items
            items={section.items}
            noun="Feature"
            blank={{ title: "Capability", body: "What it does." }}
            {...p}
            onChange={(items) => onChange({ ...section, items })}
            render={(item, setItem) => (
              <>
                <TextField
                  label="Title"
                  value={item.title}
                  max={80}
                  {...p}
                  onChange={(v) => setItem({ ...item, title: v })}
                />
                <TextField
                  label="Description"
                  value={item.body}
                  max={400}
                  multiline
                  {...p}
                  onChange={(v) => setItem({ ...item, body: v })}
                />
              </>
            )}
          />
        </div>
      );
    case "steps":
      return (
        <div className="grid gap-3">
          <TextField
            label="Heading (optional)"
            value={section.heading}
            max={120}
            {...p}
            onChange={(v) => onChange({ ...section, heading: v })}
          />
          <Items
            items={section.items}
            noun="Step"
            blank={{ title: "Next step", body: "What happens." }}
            {...p}
            onChange={(items) => onChange({ ...section, items })}
            render={(item, setItem) => (
              <>
                <TextField
                  label="Title"
                  value={item.title}
                  max={80}
                  {...p}
                  onChange={(v) => setItem({ ...item, title: v })}
                />
                <TextField
                  label="Description"
                  value={item.body}
                  max={400}
                  multiline
                  {...p}
                  onChange={(v) => setItem({ ...item, body: v })}
                />
              </>
            )}
          />
        </div>
      );
    case "stats":
      return (
        <div className="grid gap-3">
          <TextField
            label="Heading (optional)"
            value={section.heading}
            max={120}
            {...p}
            onChange={(v) => onChange({ ...section, heading: v })}
          />
          <Items
            items={section.items}
            noun="Figure"
            blank={{ value: "0", label: "Label" }}
            {...p}
            onChange={(items) => onChange({ ...section, items })}
            render={(item, setItem) => (
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                <TextField
                  label="Figure"
                  value={item.value}
                  max={20}
                  {...p}
                  onChange={(v) => setItem({ ...item, value: v })}
                />
                <TextField
                  label="Label"
                  value={item.label}
                  max={80}
                  {...p}
                  onChange={(v) => setItem({ ...item, label: v })}
                />
              </div>
            )}
          />
          <TextField
            label="Source"
            value={section.source}
            max={200}
            hint="Required: where the figures come from. Publish verified figures only."
            {...p}
            onChange={(v) => onChange({ ...section, source: v })}
          />
        </div>
      );
    case "faq":
      return (
        <div className="grid gap-3">
          <TextField
            label="Heading (optional)"
            value={section.heading}
            max={120}
            {...p}
            onChange={(v) => onChange({ ...section, heading: v })}
          />
          <Items
            items={section.items}
            noun="Question"
            blank={{ question: "A common question?", answer: "The answer." }}
            {...p}
            onChange={(items) => onChange({ ...section, items })}
            render={(item, setItem) => (
              <>
                <TextField
                  label="Question"
                  value={item.question}
                  max={200}
                  {...p}
                  onChange={(v) => setItem({ ...item, question: v })}
                />
                <TextField
                  label="Answer (Markdown)"
                  value={item.answer}
                  max={2000}
                  multiline
                  {...p}
                  onChange={(v) => setItem({ ...item, answer: v })}
                />
              </>
            )}
          />
        </div>
      );
    case "call_to_action":
      return (
        <div className="grid gap-3">
          <TextField
            label="Heading"
            value={section.heading}
            max={120}
            {...p}
            onChange={(v) => onChange({ ...section, heading: v })}
          />
          <TextField
            label="Text (optional)"
            value={section.body}
            max={400}
            {...p}
            onChange={(v) => onChange({ ...section, body: v })}
          />
          <CtaFields
            label="Button"
            cta={section.cta}
            {...p}
            onChange={(c) => c && onChange({ ...section, cta: c })}
          />
        </div>
      );
  }
}

const summary = (section: PageSection) =>
  "heading" in section && section.heading
    ? section.heading
    : section.type === "text"
      ? (section.body ?? "").slice(0, 60)
      : section.type === "image"
        ? (section.caption ?? "")
        : "";

/**
 * The page builder. Every change autosaves to the draft, which is never
 * public; publishing is a submission someone else approves.
 */
export function PageEditor({ slug, user, initial }: { slug: string; user: AdminUser; initial: PageDetail }) {
  const router = useRouter();
  const uid = useId();
  const pageId = initial.page.id;
  const canEdit = hasRole(user, "editor") && !initial.page.archived_at;
  const [data, setData] = useState(initial);
  const start: Draft = { title: initial.page.title, path: initial.page.path, document: initial.page.draft };
  const [draft, setDraft] = useState<Draft>(start);
  const { baseline, markSaved } = useSavedBaseline(draft, start);
  const [save, setSave] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const version = useRef(initial.page.draft_version);
  const [rendered, setRendered] = useState<PageDocument | null>(initial.preview);
  const [past, setPast] = useState<Draft[]>([]);
  const [future, setFuture] = useState<Draft[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<BlockType>("text");
  const [dragging, setDragging] = useState<number | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [note, setNote] = useState("");
  const [timing, setTiming] = useState<"approval" | "scheduled">("approval");
  const [publishAt, setPublishAt] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useUnsavedChangesWarning(save === "unsaved" || save === "saving" || save === "invalid");
  const stateFor = (next: Draft): SaveState => (sameValue(next, baseline) ? "saved" : "unsaved");

  const change = (next: Draft) => {
    if (!canEdit) return;
    setPast((p) => [...p.slice(-49), draft]);
    setFuture([]);
    setDraft(next);
    setSave(stateFor(next));
  };
  const setSections = (sections: PageSection[]) =>
    change({ ...draft, document: { ...draft.document, sections } });
  const sections = draft.document.sections;

  const reload = useCallback(
    async (resetDraft: boolean) => {
      const fresh = await adminFetch<PageDetail>(`pages/${pageId}`);
      setData(fresh);
      setRendered(fresh.preview);
      if (resetDraft) {
        const next = { title: fresh.page.title, path: fresh.page.path, document: fresh.page.draft };
        setDraft(next);
        markSaved(next);
        version.current = fresh.page.draft_version;
        setPast([]);
        setFuture([]);
        setSave("saved");
      }
    },
    [pageId, markSaved],
  );

  // Autosave the draft shortly after the last change. Never publishes.
  useEffect(() => {
    if (save !== "unsaved") return;
    const timer = setTimeout(async () => {
      setSave("saving");
      setSaveError(null);
      try {
        const saved = await adminFetch<{ draft_version: number; preview: PageDocument }>(
          `pages/${pageId}/draft`,
          {
            ...draft,
            version: version.current,
          },
        );
        version.current = saved.draft_version;
        markSaved(draft);
        setRendered(saved.preview);
        setSave((s) => (s === "saving" ? "saved" : s));
        reload(false).catch(() => undefined);
      } catch (err) {
        if (err instanceof AdminError && err.status === 422) {
          setSave("invalid");
          setSaveError(err.fields[0]?.message ?? err.message);
        } else if (err instanceof AdminError && err.status === 409) {
          setSave("conflict");
        } else {
          setSave("error");
          setSaveError(err instanceof Error ? err.message : "Draft not saved.");
        }
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [draft, save, pageId, reload, markSaved]);

  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [draft, ...f]);
    setDraft(previous);
    setSave(stateFor(previous));
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, draft]);
    setDraft(next);
    setSave(stateFor(next));
  };

  const moveSection = (from: number, to: number) => {
    if (to < 0 || to >= sections.length || from === to) return;
    const next = [...sections];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setSections(next);
  };

  async function run(
    label: string,
    path: string,
    body: unknown,
    success: string,
    resetDraft = false,
    after?: () => void,
  ) {
    setBusy(label);
    setMessage(null);
    try {
      await adminFetch(path, body);
      setMessage({ tone: "ok", text: success });
      setNote("");
      setDecisionNote("");
      setTiming("approval");
      setPublishAt("");
      if (after) after();
      else await reload(resetDraft);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  // Preview: local edits immediately; Markdown uses the API's rendering once saved.
  const [redirects, setRedirects] = useState(initial.redirects ?? []);
  // The content library, for Shared content sections (archived items can't be chosen).
  const [sharedLibrary, setSharedLibrary] = useState<SharedItem[] | null>(null);
  useEffect(() => {
    let live = true;
    adminFetch<{ items: SharedItem[] }>("shared")
      .then((data) => live && setSharedLibrary(data.items.filter((i) => !i.archived_at)))
      .catch(() => live && setSharedLibrary([]));
    return () => {
      live = false;
    };
  }, []);
  // The website's media library, for Image blocks (archived images can't be chosen).
  const [library, setLibrary] = useState<MediaItem[] | null>(null);
  useEffect(() => {
    let live = true;
    adminFetch<{ items: MediaItem[] }>(`sites/${slug}/media`)
      .then((data) => live && setLibrary(data.items.filter((m) => !m.archived_at)))
      .catch(() => live && setLibrary([]));
    return () => {
      live = false;
    };
  }, [slug]);

  const previewDoc: PageDocument = {
    ...draft.document,
    sections: sections.map((section) => {
      const server = rendered?.sections.find((s) => s.id === section.id);
      if (section.type === "shared") {
        // The saved preview's resolved content, or the item's published content while a new choice saves.
        if (server?.shared?.id === section.shared_id) return server;
        const item = sharedLibrary?.find((i) => i.id === section.shared_id);
        return item?.published
          ? ({
              ...item.published,
              id: section.id,
              hidden: section.hidden,
              tone: section.tone,
              shared: { id: item.id, name: item.name, version: item.published_number ?? 0 },
            } as PageSection)
          : section;
      }
      if (section.type === "image") {
        // The saved preview's file details, or the library's while a new choice saves.
        const saved =
          server?.type === "image" && server.image_id === section.image_id ? server.media : undefined;
        const item = library?.find((m) => m.id === section.image_id);
        return {
          ...section,
          media:
            saved ??
            (item
              ? {
                  id: item.id,
                  alt: item.alt_text,
                  width: item.width,
                  height: item.height,
                  content_type: item.content_type,
                  widths: [],
                }
              : null),
        };
      }
      if (section.type === "text" && server?.type === "text" && server.body === section.body) {
        return { ...section, body_html: server.body_html };
      }
      if (section.type === "faq" && server?.type === "faq") {
        return {
          ...section,
          items: section.items.map((item, i) => {
            const savedItem = server.items[i];
            const savedAnswer = initialAnswer(data, section.id, i);
            return savedItem && savedAnswer === item.answer
              ? { ...item, answer_html: savedItem.answer_html }
              : item;
          }),
        };
      }
      return section;
    }),
  };

  const pending = data.revisions.find((r) => r.state === "pending");
  const ownPending = pending?.requested_by_id === user.id;
  const canDecide = pending && hasRole(user, "reviewer") && (!ownPending || user.role === "owner");
  const canCancel = pending && (ownPending || user.role === "owner");
  const canChangeVisibility = hasRole(user, "reviewer") && !data.page.archived_at;
  const scheduled = data.revisions.find((r) => r.state === "scheduled");
  const canUnschedule = scheduled && (scheduled.requested_by_id === user.id || hasRole(user, "reviewer"));
  // A pending change asked to go live later is scheduled on approval.
  const pendingLater = pending?.publish_at && !isPast(pending.publish_at) ? pending.publish_at : null;
  const publishAtIso = timing === "scheduled" ? fromLocalInput(publishAt) : null;
  const pathValid = PATH_PATTERN.test(draft.path.trim().replace(/^\/+|\/+$/g, ""));
  const submitBlocker =
    save === "unsaved" || save === "saving"
      ? "Saving the draft…"
      : save === "invalid"
        ? "Fix the highlighted problem first"
        : save !== "saved"
          ? "Reload the draft first"
          : sections.length === 0
            ? "Add at least one section"
            : !data.draft_differs
              ? "The draft matches the published page"
              : !note.trim()
                ? "Say what changed"
                : timing === "scheduled"
                  ? scheduleProblem(publishAtIso)
                  : null;

  const saveText: Record<SaveState, string> = {
    saved: "Draft saved",
    unsaved: "Unsaved changes",
    saving: "Saving draft…",
    invalid: "Draft not saved: fix the problem below",
    conflict: "Someone else changed this page",
    error: "Draft not saved",
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-5 flex flex-wrap items-center gap-3 border-b border-line bg-bg/90 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted">
          {save === "saving" ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
          ) : save === "saved" ? (
            <CircleCheck aria-hidden className="size-4 text-success" />
          ) : (
            <CircleAlert
              aria-hidden
              className={cn("size-4", save === "unsaved" ? "text-muted" : "text-danger")}
            />
          )}
          {saveText[save]} · not public until published
        </p>
        {save === "conflict" && (
          <button
            type="button"
            onClick={() => reload(true)}
            className="text-sm font-medium text-accent hover:underline"
          >
            Reload their changes
          </button>
        )}
        <div className="ms-auto flex flex-wrap gap-1">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={undo}
                disabled={!past.length}
                className={buttonClasses("ghost", "md", "px-3")}
              >
                <Undo2 aria-hidden className="size-4" />
                Undo
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!future.length}
                className={buttonClasses("ghost", "md", "px-3")}
              >
                <Redo2 aria-hidden className="size-4" />
                Redo
              </button>
            </>
          )}
          <Link
            href={`/admin/sites/${slug}/pages/${pageId}/preview`}
            target="_blank"
            className={buttonClasses("secondary", "md", "px-4")}
          >
            <ExternalLink aria-hidden className="size-4" />
            Full preview<span className="sr-only"> (opens in a new tab, shows the saved draft)</span>
          </Link>
        </div>
      </div>

      {saveError && (
        <p
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-text"
        >
          {saveError}
        </p>
      )}
      {data.page.archived_at && (
        <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
          This page is archived and not on the website. Restore it from the page list to edit it.
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section aria-labelledby={`${uid}-settings`} className="fb-panel rounded-[var(--radius-panel)] p-5">
            <h2 id={`${uid}-settings`} className="font-semibold text-text">
              Page
            </h2>
            <div className="mt-4 grid gap-3">
              <TextField
                label="Page title"
                value={draft.title}
                max={120}
                disabled={!canEdit}
                onChange={(v) => change({ ...draft, title: v })}
              />
              <TextField
                label="Address"
                value={draft.path}
                max={180}
                mono
                disabled={!canEdit}
                hint={
                  !pathValid
                    ? "Lower-case words joined by hyphens; up to three levels."
                    : initial.page.published && draft.path !== initial.page.path
                      ? `/${draft.path} · the old address /${initial.page.path} will forward here`
                      : `/${draft.path} · empty for the home page`
                }
                onChange={(v) => change({ ...draft, path: v })}
              />
              <TextField
                label="Search title (optional)"
                value={draft.document.seo_title}
                max={70}
                disabled={!canEdit}
                hint={`${(draft.document.seo_title ?? "").length}/70`}
                onChange={(v) => change({ ...draft, document: { ...draft.document, seo_title: v } })}
              />
              <TextField
                label="Search description (optional)"
                value={draft.document.seo_description}
                max={170}
                multiline
                disabled={!canEdit}
                hint={`${(draft.document.seo_description ?? "").length}/170`}
                onChange={(v) => change({ ...draft, document: { ...draft.document, seo_description: v } })}
              />
            </div>
            <SearchSettings
              siteName={initial.site.name}
              title={draft.document.seo_title || draft.title}
              path={draft.path}
              description={draft.document.seo_description ?? ""}
              imageId={draft.document.seo_image_id ?? null}
              noindex={!!draft.document.seo_noindex}
              library={library}
              redirects={redirects}
              disabled={!canEdit}
              onImage={(id) =>
                change({ ...draft, document: { ...draft.document, seo_image_id: id ?? undefined } })
              }
              onNoindex={(on) =>
                change({ ...draft, document: { ...draft.document, seo_noindex: on || undefined } })
              }
              onRemoveRedirect={async (from) => {
                await adminFetch(`pages/${pageId}/redirects/remove`, { from_path: from });
                setRedirects((list) => list.filter((r) => r.from_path !== from));
              }}
            />
          </section>

          <section aria-labelledby={`${uid}-sections`} className="fb-panel rounded-[var(--radius-panel)] p-5">
            <h2 id={`${uid}-sections`} className="font-semibold text-text">
              Sections
            </h2>
            <p className="mt-1 text-sm text-muted">Drag to reorder, or use the arrows.</p>
            <ol className="mt-4 space-y-2" aria-label="Sections">
              {sections.map((section, i) => {
                const expanded = open === section.id;
                return (
                  <li
                    key={section.id}
                    draggable={canEdit && !expanded}
                    onDragStart={() => setDragging(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragging !== null) moveSection(dragging, i);
                      setDragging(null);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={cn(
                      "rounded-2xl border border-line bg-surface",
                      dragging === i && "border-accent opacity-70",
                    )}
                  >
                    <div className="flex items-center gap-2 p-2">
                      {canEdit && (
                        <GripVertical aria-hidden className="size-5 shrink-0 cursor-grab text-subtle" />
                      )}
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : section.id)}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-start"
                      >
                        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                          {blockLabel(section.type)}
                        </span>
                        {section.hidden && (
                          <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                            Hidden
                          </span>
                        )}
                        <span
                          className={cn("truncate text-sm", section.hidden ? "text-subtle" : "text-text")}
                        >
                          {summary(section)}
                        </span>
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            "ms-auto size-4 shrink-0 text-subtle transition-transform",
                            expanded && "rotate-180",
                          )}
                        />
                      </button>
                      {canEdit && (
                        <span className="flex shrink-0">
                          {/* Hidden sections stay in the page and its versions but aren't shown on the website. */}
                          <button
                            type="button"
                            aria-pressed={!!section.hidden}
                            title={section.hidden ? "Hidden on the website" : "Shown on the website"}
                            onClick={() =>
                              setSections(
                                sections.map((s) =>
                                  s.id === section.id ? { ...s, hidden: !s.hidden || undefined } : s,
                                ),
                              )
                            }
                            className={buttonClasses("ghost", "md", "px-2")}
                          >
                            {section.hidden ? (
                              <EyeOff aria-hidden className="size-4" />
                            ) : (
                              <Eye aria-hidden className="size-4" />
                            )}
                            <span className="sr-only">Hide {blockLabel(section.type)} section</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSection(i, i - 1)}
                            disabled={i === 0}
                            className={buttonClasses("ghost", "md", "px-2")}
                          >
                            <ArrowUp aria-hidden className="size-4" />
                            <span className="sr-only">Move {blockLabel(section.type)} section up</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSection(i, i + 1)}
                            disabled={i === sections.length - 1}
                            className={buttonClasses("ghost", "md", "px-2")}
                          >
                            <ArrowDown aria-hidden className="size-4" />
                            <span className="sr-only">Move {blockLabel(section.type)} section down</span>
                          </button>
                          <button
                            type="button"
                            disabled={sections.length >= 40}
                            onClick={() =>
                              setSections([
                                ...sections.slice(0, i + 1),
                                copySection(section),
                                ...sections.slice(i + 1),
                              ])
                            }
                            className={buttonClasses("ghost", "md", "px-2")}
                          >
                            <Copy aria-hidden className="size-4" />
                            <span className="sr-only">Duplicate {blockLabel(section.type)} section</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSections(sections.filter((s) => s.id !== section.id))}
                            className={buttonClasses("ghost", "md", "px-2 hover:text-danger")}
                          >
                            <Trash2 aria-hidden className="size-4" />
                            <span className="sr-only">Remove {blockLabel(section.type)} section</span>
                          </button>
                        </span>
                      )}
                    </div>
                    {expanded && (
                      <div className="border-t border-line p-4">
                        <BlockForm
                          section={section}
                          library={library}
                          sharedLibrary={sharedLibrary}
                          slug={slug}
                          disabled={!canEdit}
                          onChange={(next) =>
                            setSections(sections.map((s) => (s.id === section.id ? next : s)))
                          }
                        />
                        <ToneField
                          tone={section.tone}
                          label={blockLabel(section.type)}
                          theme={initial.site.theme}
                          disabled={!canEdit}
                          onChange={(tone) =>
                            setSections(sections.map((s) => (s.id === section.id ? { ...s, tone } : s)))
                          }
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {canEdit && (
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`${uid}-block`} className="block text-xs font-medium text-muted">
                    Add a section
                  </label>
                  <select
                    id={`${uid}-block`}
                    value={adding}
                    onChange={(e) => setAdding(e.target.value as BlockType)}
                    className={cn(inputClass, "px-3")}
                  >
                    {BLOCKS.map((b) => (
                      <option key={b.type} value={b.type}>
                        {b.label} · {b.hint}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={
                    sections.length >= 40 ||
                    (adding === "image" && !library?.length) ||
                    (adding === "shared" && !sharedLibrary?.length)
                  }
                  onClick={() => {
                    const section = newSection(
                      adding,
                      adding === "shared" ? sharedLibrary?.[0]?.id : library?.[0]?.id,
                    );
                    setSections([...sections, section]);
                    setOpen(section.id);
                  }}
                  className={buttonClasses("secondary", "md")}
                >
                  <Plus aria-hidden className="size-4" />
                  Add
                </button>
                {adding === "shared" && sharedLibrary?.length === 0 && (
                  <p className="w-full text-sm text-subtle">
                    The content library is empty.{" "}
                    <Link href="/admin/content" className="text-accent underline underline-offset-2">
                      Create shared content
                    </Link>{" "}
                    first.
                  </p>
                )}
                {adding === "image" && library?.length === 0 && (
                  <p className="w-full text-sm text-subtle">
                    No images yet.{" "}
                    <Link
                      href={`/admin/sites/${slug}/media`}
                      className="text-accent underline underline-offset-2"
                    >
                      Upload one in Media
                    </Link>{" "}
                    first.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section aria-labelledby={`${uid}-preview`} className="fb-panel rounded-[var(--radius-panel)] p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id={`${uid}-preview`} className="font-semibold text-text">
                Live preview
              </h2>
              <div
                role="group"
                aria-label="Preview width"
                className="flex gap-1 rounded-full border border-line p-1"
              >
                {(
                  [
                    ["desktop", "Desktop", Monitor],
                    ["mobile", "Phone", Smartphone],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={device === value}
                    onClick={() => setDevice(value)}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm",
                      device === value ? "bg-surface-2 text-text" : "text-muted hover:text-text",
                    )}
                  >
                    <Icon aria-hidden className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div
              data-product={KNOWN.includes(slug) ? slug : "figbud"}
              style={siteThemeStyle(initial.site.theme)}
              tabIndex={0}
              role="group"
              aria-label="Page preview (scrollable)"
              className={cn(
                "mt-4 max-h-[44rem] overflow-y-auto rounded-2xl border border-line bg-bg p-6 sm:p-8",
                device === "mobile" && "mx-auto max-w-[24rem] p-5",
              )}
            >
              {sections.length === 0 ? (
                <p className="py-16 text-center text-muted">Add a section to start building this page.</p>
              ) : (
                <PageBlocks
                  document={previewDoc}
                  mode="preview"
                  mediaBase={STUDIO_MEDIA_BASE}
                  firstHeading={2}
                  className={device === "mobile" ? "space-y-12" : undefined}
                />
              )}
            </div>
          </section>

          <section aria-labelledby={`${uid}-publish`} className="fb-panel rounded-[var(--radius-panel)] p-5">
            <h2 id={`${uid}-publish`} className="font-semibold text-text">
              Publishing
            </h2>
            {pending ? (
              <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-4">
                <p className="text-sm font-medium text-text">Version {pending.number} is awaiting approval</p>
                <p className="mt-1 text-sm text-muted">{pending.note}</p>
                <p className="mt-1 text-xs text-subtle">
                  Submitted by {pending.requested_by ?? "a former admin"} · {when(pending.created_at)}
                </p>
                {pending.publish_at && (
                  <p className="mt-2 flex items-start gap-2 text-sm text-text">
                    <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span>
                      {pendingLater ? (
                        <>
                          Goes live <LocalTime iso={pendingLater} /> once approved.
                        </>
                      ) : (
                        <>
                          The requested time (<LocalTime iso={pending.publish_at} />) has passed: approving
                          publishes it now.
                        </>
                      )}
                    </span>
                  </p>
                )}
                {canDecide && (
                  <TextField
                    label="Note (optional)"
                    value={decisionNote}
                    max={300}
                    onChange={setDecisionNote}
                  />
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {canDecide && (
                    <>
                      <ActionButton
                        ready={!busy}
                        busy={busy === "approve"}
                        onClick={() =>
                          run(
                            "approve",
                            `pages/${pageId}/revisions/${pending.id}/approve`,
                            { note: decisionNote || null },
                            pendingLater ? "Approved and scheduled." : "Page published.",
                          )
                        }
                      >
                        {pendingLater
                          ? ownPending
                            ? "Schedule my change"
                            : "Approve and schedule"
                          : ownPending
                            ? "Publish my change"
                            : "Approve and publish"}
                      </ActionButton>
                      <ActionButton
                        variant="secondary"
                        ready={!busy}
                        busy={busy === "reject"}
                        onClick={() =>
                          run(
                            "reject",
                            `pages/${pageId}/revisions/${pending.id}/reject`,
                            { note: decisionNote || null },
                            "Change rejected.",
                          )
                        }
                      >
                        Reject
                      </ActionButton>
                    </>
                  )}
                  {canCancel && (
                    <ActionButton
                      variant="ghost"
                      ready={!busy}
                      busy={busy === "cancel"}
                      onClick={() =>
                        run(
                          "cancel",
                          `pages/${pageId}/revisions/${pending.id}/cancel`,
                          {},
                          "Submission withdrawn.",
                        )
                      }
                    >
                      Withdraw
                    </ActionButton>
                  )}
                </div>
                {ownPending && user.role !== "owner" && (
                  <p className="mt-3 text-xs text-subtle">
                    A reviewer or an owner needs to approve your change.
                  </p>
                )}
              </div>
            ) : scheduled ? (
              <div className="mt-4 rounded-xl border border-accent/40 bg-accent-soft/50 p-4">
                <p className="flex items-start gap-2 text-sm font-medium text-text">
                  <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span>
                    Version {scheduled.number} goes live <LocalTime iso={scheduled.publish_at!} />
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted">{scheduled.note}</p>
                <p className="mt-1 text-xs text-subtle">
                  Approved by {scheduled.decided_by ?? "a former admin"}
                  {scheduled.decided_at && (
                    <>
                      {" · "}
                      <LocalTime iso={scheduled.decided_at} />
                    </>
                  )}
                  . The current version stays live until then; draft edits made now are not part of it.
                </p>
                {canUnschedule && (
                  <div className="mt-4">
                    <ActionButton
                      variant="secondary"
                      ready={!busy}
                      busy={busy === "unschedule"}
                      onClick={() =>
                        run(
                          "unschedule",
                          `pages/${pageId}/revisions/${scheduled.id}/cancel`,
                          {},
                          "Schedule cancelled. Submit again when you're ready.",
                        )
                      }
                    >
                      Cancel schedule
                    </ActionButton>
                  </div>
                )}
              </div>
            ) : canEdit ? (
              <form
                className="mt-4 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (submitBlocker === null && !busy)
                    run(
                      "submit",
                      `pages/${pageId}/submit`,
                      { note, publish_at: publishAtIso },
                      publishAtIso
                        ? "Sent for approval, to go live at the time you chose."
                        : "Sent for approval.",
                    );
                }}
              >
                <TextField label="What changed?" value={note} max={300} multiline onChange={setNote} />
                <fieldset>
                  <legend className="text-xs font-medium text-muted">When should it go live?</legend>
                  <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        ["approval", "When approved"],
                        ["scheduled", "At a set time"],
                      ] as const
                    ).map(([value, label]) => (
                      <label
                        key={value}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                          timing === value
                            ? "border-accent bg-accent-soft/60 text-text"
                            : "border-line text-muted hover:border-line-strong",
                        )}
                      >
                        <input
                          type="radio"
                          name={`${uid}-timing`}
                          value={value}
                          checked={timing === value}
                          onChange={() => {
                            setTiming(value);
                            if (value === "scheduled" && !publishAt) setPublishAt(localInputFromNow(60));
                          }}
                          className="size-4 accent-[var(--color-accent)]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  {timing === "scheduled" && (
                    <div className="mt-3">
                      <label htmlFor={`${uid}-publish-at`} className="block text-xs font-medium text-muted">
                        Go-live time <span className="font-normal">(your time zone)</span>
                      </label>
                      <input
                        id={`${uid}-publish-at`}
                        type="datetime-local"
                        value={publishAt}
                        onChange={(e) => setPublishAt(e.target.value)}
                        className={inputClass}
                      />
                      <p className="mt-1.5 text-xs text-subtle">
                        It still needs approval. Once approved it waits, and the current version stays live
                        until then.
                      </p>
                    </div>
                  )}
                </fieldset>
                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton
                    type="submit"
                    ready={submitBlocker === null && !busy}
                    busy={busy === "submit"}
                    hint={submitBlocker ?? undefined}
                  >
                    Submit for publishing
                  </ActionButton>
                  {data.page.published_revision && (
                    <ActionButton
                      variant="ghost"
                      ready={data.draft_differs && save === "saved" && !busy}
                      busy={busy === "discard"}
                      onClick={() =>
                        run(
                          "discard",
                          `pages/${pageId}/revisions/${data.page.published_revision}/restore`,
                          {},
                          "Draft reset to the published page.",
                          true,
                        )
                      }
                    >
                      Discard draft changes
                    </ActionButton>
                  )}
                </div>
              </form>
            ) : (
              <p className="mt-4 text-sm text-muted">Editors and above can change pages.</p>
            )}
            {message && (
              <p
                role={message.tone === "error" ? "alert" : "status"}
                className={cn("mt-4 text-sm", message.tone === "error" ? "text-danger" : "text-success")}
              >
                {message.text}
              </p>
            )}
            {hasRole(user, "reviewer") && !data.page.archived_at && (
              <div className="mt-5 border-t border-line pt-4">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => {
                    if (
                      window.confirm(`Archive "${draft.title}"? It is taken off the website until restored.`)
                    ) {
                      run("archive", `pages/${pageId}/archive`, {}, "Page archived.", false, () =>
                        router.push(`/admin/sites/${slug}/pages`),
                      );
                    }
                  }}
                  className={buttonClasses("ghost", "md")}
                >
                  Archive page
                </button>
              </div>
            )}
          </section>

          <section
            aria-labelledby={`${uid}-visibility`}
            className="fb-panel rounded-[var(--radius-panel)] p-5"
          >
            <h2 id={`${uid}-visibility`} className="font-semibold text-text">
              Visibility
            </h2>
            <p className="mt-1 text-sm text-muted">
              Takes effect on the website straight away, separately from publishing. Content and versions are
              kept.
            </p>
            <div className="mt-4 divide-y divide-line">
              <VisibilitySwitch
                label="Online"
                on={!data.page.offline}
                hint={
                  data.page.path === ""
                    ? "The home page is always online."
                    : data.page.offline
                      ? "Visitors get “page not found” until it is back online."
                      : "Visitors can open this page."
                }
                disabled={!canChangeVisibility || data.page.path === "" || !!busy}
                onToggle={() => {
                  const goingOffline = !data.page.offline;
                  if (
                    goingOffline &&
                    !window.confirm(
                      `Take "${draft.title}" offline? Visitors will get “page not found” until it is back online.`,
                    )
                  )
                    return;
                  run(
                    "visibility",
                    `pages/${pageId}/${goingOffline ? "offline" : "online"}`,
                    {},
                    goingOffline ? "Page taken offline." : "Page back online.",
                  );
                }}
              />
              <VisibilitySwitch
                label="Show in navigation"
                on={data.page.show_in_nav}
                hint={
                  data.page.show_in_nav
                    ? "Listed in the website's menu."
                    : "Left out of the menu; still reachable at its address."
                }
                disabled={!canChangeVisibility || !!busy}
                onToggle={() =>
                  run(
                    "visibility",
                    `pages/${pageId}/${data.page.show_in_nav ? "hide-from-nav" : "show-in-nav"}`,
                    {},
                    data.page.show_in_nav ? "Removed from the navigation." : "Added to the navigation.",
                  )
                }
              />
            </div>
            {!canChangeVisibility && (
              <p className="mt-3 text-xs text-subtle">Reviewers and owners can change visibility.</p>
            )}
          </section>

          <section aria-labelledby={`${uid}-history`} className="fb-panel rounded-[var(--radius-panel)] p-5">
            <h2 id={`${uid}-history`} className="font-semibold text-text">
              Version history
            </h2>
            {data.revisions.length === 0 ? (
              <p className="mt-3 text-sm text-subtle">Nothing published yet.</p>
            ) : (
              <ol className="mt-3 space-y-4 text-sm">
                {data.revisions.map((r) => (
                  <li key={r.id}>
                    <p className="text-text">
                      Version {r.number} · {STATE_LABELS[r.state]}
                      {r.state === "scheduled" && r.publish_at && (
                        <>
                          {" "}
                          for <LocalTime iso={r.publish_at} />
                        </>
                      )}
                      {r.id === data.page.published_revision && (
                        <span className="ms-2 rounded-full border border-success/30 px-2 py-0.5 text-xs text-success">
                          Live
                        </span>
                      )}
                    </p>
                    <p className="text-muted">{r.note}</p>
                    <p className="text-xs text-subtle">
                      {r.decided_by ?? r.requested_by ?? "FigBud"} · {when(r.decided_at ?? r.created_at)}
                    </p>
                    {canEdit && r.state === "published" && r.id !== data.page.published_revision && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() =>
                          run(
                            `restore-${r.id}`,
                            `pages/${pageId}/revisions/${r.id}/restore`,
                            {},
                            `Version ${r.number} copied into the draft. Review it, then submit.`,
                            true,
                          )
                        }
                        className="mt-1 text-sm font-medium text-accent hover:underline"
                      >
                        Restore to draft<span className="sr-only"> (version {r.number})</span>
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** An on/off control for a page's visibility (role="switch"). */
function VisibilitySwitch({
  label,
  on,
  hint,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  hint: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span id={id} className="block text-sm font-medium text-text">
          {label}
        </span>
        <span className="block text-xs text-subtle">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={id}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none",
          on ? "border-accent bg-accent" : "border-line-strong bg-surface-3",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "size-5 rounded-full bg-white shadow transition-transform duration-200",
            on ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1",
          )}
        />
      </button>
    </div>
  );
}

/** The saved (server) answer text for a FAQ item, to know if its rendered HTML is current. */
function initialAnswer(data: PageDetail, sectionId: string, index: number): string | undefined {
  const section = data.page.draft.sections.find((s) => s.id === sectionId);
  return section?.type === "faq" ? section.items[index]?.answer : undefined;
}
