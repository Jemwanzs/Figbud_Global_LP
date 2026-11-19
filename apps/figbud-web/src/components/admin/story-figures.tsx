"use client";

import type { PublicMetric } from "@figbud/site-kit";
import { cn, formatFigure } from "@figbud/ui";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";

import { ActionButton } from "./action-button";
import { MediaPicker } from "./media-picker";
import type { MediaItem } from "./page-types";

/** A figure as the Studio lists it (Customers & proof, `GET /v1/admin/proof?kind=metric`). */
export interface FigureRecord {
  id: string;
  title: string;
  status: "draft" | "in_review" | "published" | "changes_pending" | "unpublished" | "archived";
  active: boolean;
  sites: string[];
  published_sites: string[];
  draft: Record<string, unknown>;
  draft_version: number;
  review_requested: boolean;
  archived: boolean;
}

const input = "mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text";

const STATUS: Record<FigureRecord["status"], string> = {
  draft: "Draft",
  in_review: "Awaiting approval",
  published: "Published",
  changes_pending: "Changes not published",
  unpublished: "Unpublished",
  archived: "Archived",
};

const ICONS: [string, string][] = [
  ["", "None"],
  ["wallet", "Wallet"],
  ["users", "People"],
  ["building", "Building"],
  ["badge-check", "Verified badge"],
  ["briefcase", "Briefcase"],
  ["layers", "Layers"],
  ["trending-up", "Growth"],
  ["clock", "Clock"],
  ["globe", "Globe"],
  ["award", "Award"],
  ["receipt", "Receipt"],
  ["landmark", "Institution"],
];

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown, d = 0) => (typeof v === "number" ? v : d);

/** A figure's draft as the websites would show it (also its preview). */
export function asPublic(f: FigureRecord): PublicMetric {
  const d = f.draft ?? {};
  return {
    id: f.id,
    label: str(d.label) || "Untitled figure",
    value: num(d.value),
    format: (str(d.format) || "number") as PublicMetric["format"],
    currency: str(d.currency) || null,
    compact: d.compact === true,
    decimals: num(d.decimals),
    notation: (str(d.notation) || (d.compact === true ? "compact" : "auto")) as PublicMetric["notation"],
    auto_decimals: typeof d.auto_decimals === "boolean" ? d.auto_decimals : num(d.decimals) === 0,
    prefix: str(d.prefix) || null,
    suffix: str(d.suffix) || null,
    source: str(d.source),
    period: str(d.period),
    icon: str(d.icon) || null,
    description: str(d.description) || null,
    link: str(d.link) || null,
    verified_on: str(d.verified_on) || null,
  };
}

function FigureEditor({
  figure,
  slug,
  library,
  canReview,
  onSaved,
}: {
  figure: FigureRecord;
  slug: string;
  library: MediaItem[];
  canReview: boolean;
  onSaved: (next: FigureRecord) => void;
}) {
  const uid = useId();
  const [doc, setDoc] = useState<Record<string, unknown>>(figure.draft);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const set = (patch: Record<string, unknown>) => setDoc((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(doc) !== JSON.stringify(figure.draft);
  const sites = figure.sites.includes(slug) ? figure.sites : [...figure.sites, slug];

  const run = async (label: string, work: () => Promise<FigureRecord>, done: string) => {
    setBusy(label);
    setMessage(null);
    try {
      onSaved(await work());
      setMessage({ tone: "ok", text: done });
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    const saved = await adminFetch<{ version: number }>(`proof/${figure.id}/draft`, {
      document: doc,
      sites,
      version: figure.draft_version,
    });
    return { ...figure, draft: doc, draft_version: saved.version, sites, title: str(doc.label) };
  };
  const text = (key: string, label: string, max: number, hint?: string) => (
    <label className="block text-sm font-medium text-text">
      {label}
      <input
        value={str(doc[key])}
        maxLength={max}
        onChange={(e) => set({ [key]: e.target.value || null })}
        className={input}
      />
      {hint && <span className="mt-1 block text-xs font-normal text-subtle">{hint}</span>}
    </label>
  );
  const preview = asPublic({ ...figure, draft: doc });
  return (
    <div className="mt-3 grid gap-3 rounded-xl bg-surface-2/60 p-3" data-figure-editor={figure.id}>
      <p className="font-display text-2xl font-semibold text-text" data-figure-preview="">
        {formatFigure({
          value: preview.value,
          format: preview.format,
          currency: preview.currency,
          notation: preview.notation,
          decimals: preview.auto_decimals ? null : preview.decimals,
          prefix: preview.prefix,
          suffix: preview.suffix,
        })}
      </p>
      {text("label", "Metric title", 60, "e.g. Payroll processed")}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-text">
          Actual value
          <input
            type="number"
            min={0}
            step="any"
            value={num(doc.value)}
            onChange={(e) => set({ value: Number(e.target.value) })}
            className={input}
          />
        </label>
        <label className="block text-sm font-medium text-text">
          Shown as
          <select
            value={str(doc.format) || "number"}
            onChange={(e) => set({ format: e.target.value })}
            className={input}
          >
            <option value="number">Number</option>
            <option value="currency">Currency</option>
            <option value="percent">Percentage</option>
          </select>
        </label>
        {doc.format === "currency" && text("currency", "Currency code", 3, "e.g. KES")}
        {text("prefix", "Before the number", 4)}
        {text("suffix", "After the number", 8, "e.g. + (only if the figure supports it)")}
        <label className="flex min-h-11 items-end gap-3 pb-2 text-sm text-text">
          <input
            type="checkbox"
            checked={(str(doc.notation) || (doc.compact ? "compact" : "auto")) !== "full"}
            onChange={(e) =>
              set({ notation: e.target.checked ? "compact" : "full", compact: e.target.checked })
            }
            className="size-5 accent-[var(--color-accent)]"
          />
          Compact notation (25M)
        </label>
      </div>
      {text("description", "Supporting description (optional)", 120)}
      <div className="grid gap-3 sm:grid-cols-2">
        {text("source", "Data source", 200, "Shown with the figure.")}
        {text("period", "Reporting period", 80, "e.g. Jan–Nov 2026")}
        <label className="block text-sm font-medium text-text">
          Icon
          <select
            value={str(doc.icon)}
            onChange={(e) => set({ icon: e.target.value || null })}
            className={input}
          >
            {ICONS.map(([v, l]) => (
              <option key={v || "none"} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {text("link", "Links to (optional)", 200, "/platform or https://…")}
      </div>
      <MediaPicker
        label="Supporting image (optional)"
        hint="From FigBud Global's media library, where figures are kept."
        value={str(doc.image_id) || null}
        media={library}
        disabled={false}
        onChange={(id) => set({ image_id: id })}
      />
      <fieldset className="rounded-xl border border-line p-3">
        <legend className="px-1 text-xs font-medium text-muted">Verification</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm text-text">
          <input
            type="checkbox"
            checked={doc.verified === true}
            onChange={(e) => set({ verified: e.target.checked })}
            className="size-5 accent-[var(--color-accent)]"
          />
          Checked against its source: a figure is never published unverified
        </label>
        <label htmlFor={`${uid}-checked`} className="mt-2 block text-sm font-medium text-text">
          Last checked
        </label>
        <input
          id={`${uid}-checked`}
          type="date"
          value={str(doc.verified_on)}
          onChange={(e) => set({ verified_on: e.target.value || null })}
          className={input}
        />
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          variant="secondary"
          ready={dirty || !figure.sites.includes(slug)}
          busy={busy === "save"}
          hint="Nothing to save"
          onClick={() => run("save", save, "Figure saved as a draft.")}
        >
          Save figure
        </ActionButton>
        <ActionButton
          variant="secondary"
          ready={figure.status !== "published" && !figure.review_requested}
          busy={busy === "submit"}
          hint={figure.review_requested ? "Already awaiting approval" : "Nothing new to approve"}
          onClick={() =>
            run(
              "submit",
              async () => {
                const saved = dirty ? await save() : figure;
                const next = await adminFetch<FigureRecord>(`proof/${figure.id}/submit`, {});
                return { ...saved, ...next, draft: saved.draft };
              },
              "Sent for approval.",
            )
          }
        >
          Ask for approval
        </ActionButton>
        {canReview && figure.review_requested && (
          <ActionButton
            busy={busy === "publish"}
            ready
            onClick={() =>
              run(
                "publish",
                async () => ({
                  ...(await adminFetch<FigureRecord>(`proof/${figure.id}/publish`, {})),
                  draft: doc,
                }),
                "Approved and published.",
              )
            }
          >
            Approve and publish
          </ActionButton>
        )}
      </div>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/**
 * Our Success Story's figures (owner's brief, 19 Nov 2026, P10-R3): every
 * figure for this website, managed here. Add, edit, duplicate, reorder,
 * show or hide, take in or out of the story, archive (published) or delete
 * (never published). Figures stay verified records in Customers & proof:
 * each is approved before it's published (maker-checker), and a published
 * story shows published figures only.
 */
export function StoryFigures({
  slug,
  name,
  figures,
  setFigures,
  chosen,
  setChosen,
  limit,
  library,
  canEdit,
  canReview,
}: {
  slug: string;
  name: string;
  figures: FigureRecord[];
  setFigures: (next: FigureRecord[]) => void;
  chosen: string[];
  setChosen: (ids: string[]) => void;
  limit: number;
  library: MediaItem[];
  canEdit: boolean;
  canReview: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = chosen.length >= limit;
  const mine = figures.filter(
    (f) => f.draft && !f.archived && (f.sites.includes(slug) || f.published_sites.includes(slug)),
  );
  // In the story's order first, then the rest.
  const ordered = [
    ...chosen.map((id) => mine.find((f) => f.id === id)).filter((f): f is FigureRecord => Boolean(f)),
    ...mine.filter((f) => !chosen.includes(f.id)),
  ];

  const act = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };
  const create = (draft: Record<string, unknown>) =>
    act("add", async () => {
      const { id } = await adminFetch<{ id: string }>("proof", { kind: "metric" });
      const document = { ...draft };
      const saved = await adminFetch<{ version: number }>(`proof/${id}/draft`, {
        document,
        sites: [slug],
        version: 1,
      });
      const record: FigureRecord = {
        id,
        title: String(document.label ?? ""),
        status: "draft",
        active: true,
        sites: [slug],
        published_sites: [],
        draft: document,
        draft_version: saved.version,
        review_requested: false,
        archived: false,
      };
      setFigures([...figures, record]);
      if (!full) setChosen([...chosen, id]);
      setOpen(id);
    });
  const move = (i: number, by: -1 | 1) => {
    const ids = [...chosen];
    [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
    setChosen(ids);
  };
  const replace = (next: FigureRecord) => setFigures(figures.map((f) => (f.id === next.id ? next : f)));

  return (
    <fieldset className="rounded-xl border border-line p-3" data-story-figures="">
      <legend className="px-1 text-xs font-medium text-muted">
        Figures ({chosen.length} of up to {limit} in the story)
      </legend>
      {mine.length === 0 && (
        <p className="text-sm text-subtle">No figures for {name} yet. Add the first one.</p>
      )}
      <ul className="space-y-2">
        {ordered.map((f) => {
          const at = chosen.indexOf(f.id);
          const metric = asPublic(f);
          return (
            <li key={f.id} className="rounded-xl border border-line p-2" data-figure-row={f.id}>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={at >= 0}
                    disabled={!canEdit || (at < 0 && full)}
                    onChange={(e) =>
                      setChosen(e.target.checked ? [...chosen, f.id] : chosen.filter((x) => x !== f.id))
                    }
                    className="size-5 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{metric.label}</span>
                    <span className="block text-xs text-subtle">
                      {STATUS[f.status] ?? f.status}
                      {!f.active && " · hidden"}
                      {metric.source && ` · ${metric.source} · ${metric.period}`}
                    </span>
                  </span>
                </label>
                {canEdit && (
                  <span className="flex flex-wrap items-center">
                    {at >= 0 && (
                      <>
                        <button
                          type="button"
                          disabled={at === 0}
                          onClick={() => move(at, -1)}
                          aria-label={`Move ${metric.label} earlier`}
                          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2 disabled:opacity-40"
                        >
                          <ArrowUp aria-hidden className="size-4" />
                        </button>
                        <button
                          type="button"
                          disabled={at === chosen.length - 1}
                          onClick={() => move(at, 1)}
                          aria-label={`Move ${metric.label} later`}
                          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2 disabled:opacity-40"
                        >
                          <ArrowDown aria-hidden className="size-4" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      aria-expanded={open === f.id}
                      onClick={() => setOpen(open === f.id ? null : f.id)}
                      aria-label={`Edit ${metric.label}`}
                      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2"
                    >
                      <Pencil aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        // A copy is a new draft and must be verified again before it's published.
                        create({
                          ...f.draft,
                          label: `${metric.label} (copy)`,
                          verified: false,
                          verified_on: null,
                        })
                      }
                      aria-label={`Duplicate ${metric.label}`}
                      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2"
                    >
                      <Copy aria-hidden className="size-4" />
                    </button>
                    {canReview && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          act(f.id, async () =>
                            replace({
                              ...(await adminFetch<FigureRecord>(`proof/${f.id}/settings`, {
                                active: !f.active,
                              })),
                              draft: f.draft,
                            }),
                          )
                        }
                        aria-label={`${f.active ? "Hide" : "Show"} ${metric.label} on the websites`}
                        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2"
                      >
                        {f.active ? (
                          <Eye aria-hidden className="size-4" />
                        ) : (
                          <EyeOff aria-hidden className="size-4" />
                        )}
                      </button>
                    )}
                    {f.status === "draft" ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          act(f.id, async () => {
                            await adminFetch(`proof/${f.id}/delete`, {});
                            setFigures(figures.filter((x) => x.id !== f.id));
                            setChosen(chosen.filter((x) => x !== f.id));
                          })
                        }
                        aria-label={`Delete ${metric.label}`}
                        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-danger hover:bg-surface-2"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    ) : null}
                  </span>
                )}
              </div>
              {open === f.id && canEdit && (
                <FigureEditor
                  figure={f}
                  slug={slug}
                  library={library}
                  canReview={canReview}
                  onSaved={replace}
                />
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              create({
                label: "New figure",
                value: 0,
                format: "number",
                notation: "auto",
                auto_decimals: true,
                source: "",
                period: "",
                verified: false,
              })
            }
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-dashed border-line-strong px-4 text-sm font-medium text-text hover:border-accent hover:text-accent-strong",
            )}
          >
            <Plus aria-hidden className="size-4" />
            Add figure
          </button>
          {full && (
            <p className="text-xs text-subtle" role="status">
              The story shows up to {limit} figures. Take one out, or raise the limit, to add another to it.
            </p>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-subtle">
        Figures are verified records kept in Customers &amp; proof, each with its source and period. Each is
        approved before it&apos;s published; the live story shows published figures only. Published figures
        are archived there, not deleted, so their history stays.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
