"use client";

import { buttonClasses, cn } from "@figbud/ui";
import { CircleAlert, CircleCheck, LoaderCircle, Redo2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { type AdminUser, AdminError, adminFetch, hasRole } from "@/lib/admin-client";
import { sameValue, useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";

import { AssetThumb, BrandLibrary } from "./brand-library";
import { BrandPreview } from "./brand-preview";
import {
  type BrandConfig,
  type BrandStudioData,
  LOGO_SLOTS,
  type LibraryAsset,
  type LogoSlot,
  SINGLE_SLOTS,
  type SingleSlot,
} from "./brand-types";

const when = (iso: string) => `${new Date(iso).toUTCString().slice(5, 22)} UTC`;
const STATE_LABELS = {
  pending: "Awaiting approval",
  published: "Published",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

type SaveState = "saved" | "unsaved" | "saving" | "conflict" | "error";

/**
 * Admin Studio → Websites → Branding. Every change autosaves to the draft,
 * which is never public. Publishing goes through a submission that a second
 * person approves; restoring an earlier version copies it into the draft.
 */
export function BrandStudio({
  slug,
  siteName,
  tagline,
  user,
  initial,
}: {
  slug: string;
  siteName: string;
  tagline?: string | null;
  user: AdminUser;
  initial: BrandStudioData;
}) {
  const uid = useId();
  const [data, setData] = useState(initial);
  const [config, setConfig] = useState<BrandConfig>(initial.draft);
  const [past, setPast] = useState<BrandConfig[]>([]);
  const [future, setFuture] = useState<BrandConfig[]>([]);
  const [save, setSave] = useState<SaveState>("saved");
  const [checks, setChecks] = useState({ list: initial.checks, publishable: initial.publishable });
  const version = useRef(initial.draft_version);
  const [note, setNote] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // The last draft the server has; an edit undone back to it needs no save.
  const { baseline, markSaved } = useSavedBaseline(config, initial.draft);
  const stateFor = (next: BrandConfig): SaveState => (sameValue(next, baseline) ? "saved" : "unsaved");
  useUnsavedChangesWarning(save === "unsaved" || save === "saving");
  const canEdit = hasRole(user, "editor");
  const assets = useMemo(() => new Map(data.assets.map((a) => [a.id, a])), [data.assets]);
  const usable = data.assets.filter((a) => !a.archived_at);
  const pending = data.revisions.find((r) => r.state === "pending");
  const ownPending = pending?.requested_by_id === user.id;
  const canDecide = pending && hasRole(user, "reviewer") && (!ownPending || user.role === "owner");
  const canCancel = pending && (ownPending || user.role === "owner");

  const reload = useCallback(
    async (resetDraft: boolean) => {
      const fresh = await adminFetch<BrandStudioData>(`sites/${slug}/brand`);
      setData(fresh);
      setChecks({ list: fresh.checks, publishable: fresh.publishable });
      if (resetDraft) {
        setConfig(fresh.draft);
        markSaved(fresh.draft);
        version.current = fresh.draft_version;
        setPast([]);
        setFuture([]);
        setSave("saved");
      }
    },
    [slug, markSaved],
  );

  const change = (next: BrandConfig) => {
    if (!canEdit) return;
    setPast((p) => [...p.slice(-49), config]);
    setFuture([]);
    setConfig(next);
    setSave(stateFor(next));
  };

  // Autosave the draft a moment after the last change. Never publishes.
  useEffect(() => {
    if (save !== "unsaved") return;
    const timer = setTimeout(async () => {
      setSave("saving");
      try {
        const saved = await adminFetch<{
          draft_version: number;
          checks: BrandStudioData["checks"];
          publishable: boolean;
        }>(`sites/${slug}/brand/draft`, { config, version: version.current });
        version.current = saved.draft_version;
        markSaved(config);
        setChecks({ list: saved.checks, publishable: saved.publishable });
        setSave((s) => (s === "saving" ? "saved" : s));
        reload(false).catch(() => undefined);
      } catch (err) {
        setSave(err instanceof AdminError && err.status === 409 ? "conflict" : "error");
        if (err instanceof AdminError && err.status !== 409) setMessage({ tone: "error", text: err.message });
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [config, save, slug, reload, markSaved]);

  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [config, ...f]);
    setConfig(previous);
    setSave(stateFor(previous));
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, config]);
    setConfig(next);
    setSave(stateFor(next));
  };

  async function run(label: string, path: string, body: unknown, success: string, resetDraft = false) {
    setBusy(label);
    setMessage(null);
    try {
      await adminFetch(`sites/${slug}/brand/${path}`, body);
      setMessage({ tone: "ok", text: success });
      setNote("");
      setDecisionNote("");
      await reload(resetDraft);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  const setLogo = (slot: LogoSlot, theme: "on_dark" | "on_light", id: string | null) =>
    change({ ...config, logos: { ...config.logos, [slot]: { ...config.logos[slot], [theme]: id } } });
  const setSingle = (slot: SingleSlot, id: string | null) => change({ ...config, [slot]: id });
  const setColour = (key: keyof BrandConfig["colors"], value: string) =>
    change({ ...config, colors: { ...config.colors, [key]: value } });

  const picker = (id: string, label: string, value: string | null, onPick: (id: string | null) => void) => {
    const current = value ? assets.get(value) : undefined;
    return (
      <div className="flex items-center gap-3">
        <span className="w-20 shrink-0">
          {current ? (
            <AssetThumb asset={current} className="h-12" />
          ) : (
            <span className="flex h-12 items-center justify-center rounded-lg border border-dashed border-line text-xs text-subtle">
              None
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block text-xs text-muted">
            {label}
          </label>
          <select
            id={id}
            value={value ?? ""}
            disabled={!canEdit}
            onChange={(e) => onPick(e.target.value || null)}
            className="mt-1 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text disabled:opacity-60"
          >
            <option value="">None</option>
            {[...usable, ...(current?.archived_at ? [current] : [])].map((a: LibraryAsset) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  // Why the draft can't be submitted yet, most fundamental reason first.
  const submitBlocker =
    save === "unsaved" || save === "saving"
      ? "Saving the draft…"
      : save !== "saved"
        ? "Reload the draft first"
        : !data.draft_differs
          ? "The draft matches the published brand"
          : !checks.publishable
            ? "Fix the required checks above"
            : !note.trim()
              ? "Say what changed"
              : null;

  const saveText: Record<SaveState, string> = {
    saved: "Draft saved",
    unsaved: "Unsaved changes",
    saving: "Saving draft…",
    conflict: "Someone else changed this draft",
    error: "Draft not saved",
  };

  return (
    <div className="space-y-8">
      {/* Status bar */}
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
        {canEdit && (
          <div className="ms-auto flex gap-1">
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
          </div>
        )}
      </div>

      {data.draft_note && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          {data.draft_note}
        </p>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="space-y-8">
          <section aria-labelledby={`${uid}-logos`} className="fb-panel rounded-[var(--radius-panel)] p-6">
            <h2 id={`${uid}-logos`} className="font-semibold text-text">
              Logos
            </h2>
            <p className="mt-1 text-sm text-muted">
              Choose a file for dark backgrounds (the default theme) and, ideally, one for light backgrounds.
            </p>
            <div className="mt-6 space-y-6">
              {LOGO_SLOTS.map((slot) => (
                <fieldset key={slot.key} className="border-t border-line pt-5 first:border-t-0 first:pt-0">
                  <legend className="text-sm font-medium text-text">
                    {slot.label} <span className="font-normal text-subtle">· {slot.hint}</span>
                  </legend>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {picker(
                      `${uid}-${slot.key}-dark`,
                      `${slot.label}: dark backgrounds`,
                      config.logos[slot.key].on_dark,
                      (id) => setLogo(slot.key, "on_dark", id),
                    )}
                    {picker(
                      `${uid}-${slot.key}-light`,
                      `${slot.label}: light backgrounds`,
                      config.logos[slot.key].on_light,
                      (id) => setLogo(slot.key, "on_light", id),
                    )}
                  </div>
                </fieldset>
              ))}
              <fieldset className="border-t border-line pt-5">
                <legend className="text-sm font-medium text-text">Icons and sharing</legend>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {SINGLE_SLOTS.map((slot) => (
                    <div key={slot.key}>
                      {picker(`${uid}-${slot.key}`, `${slot.label} (${slot.hint})`, config[slot.key], (id) =>
                        setSingle(slot.key, id),
                      )}
                    </div>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>

          <section aria-labelledby={`${uid}-colours`} className="fb-panel rounded-[var(--radius-panel)] p-6">
            <h2 id={`${uid}-colours`} className="font-semibold text-text">
              Colours and size
            </h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              {(["primary", "secondary", "accent"] as const).map((key) => (
                <div key={key}>
                  <label htmlFor={`${uid}-${key}`} className="block text-sm font-medium text-text capitalize">
                    {key} colour
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={`${key} colour picker`}
                      value={/^#[0-9a-f]{6}$/i.test(config.colors[key]) ? config.colors[key] : "#000000"}
                      disabled={!canEdit}
                      onChange={(e) => setColour(key, e.target.value)}
                      className="size-11 shrink-0 cursor-pointer rounded-xl border border-line-strong bg-surface p-1"
                    />
                    <input
                      id={`${uid}-${key}`}
                      value={config.colors[key]}
                      maxLength={7}
                      disabled={!canEdit}
                      onChange={(e) => setColour(key, e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-mono text-sm text-text"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <label htmlFor={`${uid}-height`} className="block text-sm font-medium text-text">
                Header logo height: {config.logo_height} px
              </label>
              <input
                id={`${uid}-height`}
                type="range"
                min={20}
                max={48}
                step={1}
                value={config.logo_height}
                disabled={!canEdit}
                onChange={(e) => change({ ...config, logo_height: Number(e.target.value) })}
                className="mt-3 w-full accent-[var(--accent)]"
              />
              <p className="mt-1 text-xs text-subtle">
                20–48 px. Footers and cards scale from this; logos keep their proportions.
              </p>
            </div>
          </section>

          <section aria-labelledby={`${uid}-library`} className="fb-panel rounded-[var(--radius-panel)] p-6">
            <h2 id={`${uid}-library`} className="font-semibold text-text">
              Brand files
            </h2>
            <p className="mt-1 mb-5 text-sm text-muted">
              Files are never changed or deleted: replacing a logo adds a new file, so earlier versions can be
              restored.
            </p>
            <BrandLibrary slug={slug} assets={data.assets} canEdit={canEdit} onChange={() => reload(false)} />
          </section>
        </div>

        <aside className="space-y-8" aria-label="Preview and publishing">
          <section className="fb-panel rounded-[var(--radius-panel)] p-6">
            <BrandPreview config={config} assets={assets} name={siteName} tagline={tagline} />
          </section>

          <section aria-labelledby={`${uid}-publish`} className="fb-panel rounded-[var(--radius-panel)] p-6">
            <h2 id={`${uid}-publish`} className="font-semibold text-text">
              Publishing
            </h2>
            <ul className="mt-4 space-y-2 text-sm" aria-label="Brand checks">
              {checks.list.map((check) => (
                <li key={check.id} className="flex items-start gap-2">
                  {check.ok ? (
                    <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <CircleAlert
                      aria-hidden
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        check.required ? "text-danger" : "text-warning",
                      )}
                    />
                  )}
                  <span className={check.ok ? "text-muted" : "text-text"}>
                    {check.label}
                    {check.ratio !== undefined && ` · ${check.ratio}:1`}
                    {!check.ok && (check.required ? " (required)" : " (recommended)")}
                  </span>
                </li>
              ))}
            </ul>

            {pending ? (
              <div className="mt-5 rounded-xl border border-warning/40 bg-warning/10 p-4">
                <p className="text-sm font-medium text-text">Version {pending.number} is awaiting approval</p>
                <p className="mt-1 text-sm text-muted">{pending.note}</p>
                <p className="mt-1 text-xs text-subtle">
                  Submitted by {pending.requested_by ?? "a former admin"} · {when(pending.created_at)}
                </p>
                {canDecide && (
                  <div className="mt-4">
                    <label htmlFor={`${uid}-decision`} className="block text-sm font-medium text-text">
                      Note (optional)
                    </label>
                    <input
                      id={`${uid}-decision`}
                      value={decisionNote}
                      maxLength={300}
                      onChange={(e) => setDecisionNote(e.target.value)}
                      className="mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-text"
                    />
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {canDecide && (
                    <>
                      <button
                        type="button"
                        disabled={!!busy}
                        className={buttonClasses("primary", "md")}
                        onClick={() =>
                          run(
                            "approve",
                            `revisions/${pending.id}/approve`,
                            { note: decisionNote || null },
                            "Brand published. Websites update within a few minutes.",
                          )
                        }
                      >
                        {busy === "approve" && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                        {ownPending ? "Publish my change" : "Approve and publish"}
                      </button>
                      <button
                        type="button"
                        disabled={!!busy}
                        className={buttonClasses("secondary", "md")}
                        onClick={() =>
                          run(
                            "reject",
                            `revisions/${pending.id}/reject`,
                            { note: decisionNote || null },
                            "Change rejected.",
                          )
                        }
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {canCancel && (
                    <button
                      type="button"
                      disabled={!!busy}
                      className={buttonClasses("ghost", "md")}
                      onClick={() =>
                        run("cancel", `revisions/${pending.id}/cancel`, {}, "Submission withdrawn.")
                      }
                    >
                      Withdraw
                    </button>
                  )}
                </div>
                {ownPending && user.role !== "owner" && (
                  <p className="mt-3 text-xs text-subtle">
                    A reviewer or an owner needs to approve your change.
                  </p>
                )}
              </div>
            ) : canEdit ? (
              <form
                className="mt-5 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (submitBlocker === null && busy === null)
                    run("submit", "submit", { note }, "Sent for approval.");
                }}
              >
                <label htmlFor={`${uid}-note`} className="block text-sm font-medium text-text">
                  What changed?
                </label>
                <textarea
                  id={`${uid}-note`}
                  value={note}
                  rows={2}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-text"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton
                    type="submit"
                    ready={submitBlocker === null && busy === null}
                    busy={busy === "submit"}
                    hint={submitBlocker ?? undefined}
                  >
                    Submit for publishing
                  </ActionButton>
                  {data.published_revision && (
                    <ActionButton
                      variant="ghost"
                      ready={data.draft_differs && save === "saved" && busy === null}
                      busy={busy === "discard"}
                      onClick={() =>
                        run(
                          "discard",
                          `revisions/${data.published_revision}/restore`,
                          {},
                          "Draft reset to the published brand.",
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
              <p className="mt-5 text-sm text-muted">Editors and above can change branding.</p>
            )}

            {message && (
              <p
                role={message.tone === "error" ? "alert" : "status"}
                className={cn("mt-4 text-sm", message.tone === "error" ? "text-danger" : "text-success")}
              >
                {message.text}
              </p>
            )}
          </section>

          <section aria-labelledby={`${uid}-history`} className="fb-panel rounded-[var(--radius-panel)] p-6">
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
                      {r.id === data.published_revision && (
                        <span className="ms-2 rounded-full border border-success/30 px-2 py-0.5 text-xs text-success">
                          Live
                        </span>
                      )}
                    </p>
                    <p className="text-muted">{r.note}</p>
                    <p className="text-xs text-subtle">
                      {r.decided_by ?? r.requested_by ?? "FigBud"} · {when(r.decided_at ?? r.created_at)}
                    </p>
                    {canEdit && r.state === "published" && r.id !== data.published_revision && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() =>
                          run(
                            `restore-${r.id}`,
                            `revisions/${r.id}/restore`,
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
        </aside>
      </div>
    </div>
  );
}
