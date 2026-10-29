"use client";

import { buttonClasses, cn } from "@figbud/ui";
import { Archive, ImagePlus, Pencil, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { AdminError, type FieldError, adminFetch, uploadMedia } from "@/lib/admin-client";

import { ActionButton } from "./action-button";
import { type MediaItem, STUDIO_MEDIA_BASE } from "./page-types";

const ACCEPT = "image/jpeg,image/png,image/webp,image/svg+xml";
const size = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * A website's media library (P7-D2): upload images with required alt text,
 * see where each is used, edit names and alt text, archive unused images.
 */
export function MediaLibrary({
  slug,
  items,
  canEdit,
}: {
  slug: string;
  items: MediaItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const errorFor = (field: string) => fields.find((f) => f.field === field)?.message;
  const live = items.filter((m) => !m.archived_at);
  const archived = items.filter((m) => m.archived_at);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setFields([]);
    setMessage(null);
    try {
      const result = await uploadMedia<{ id: string; duplicate: boolean }>(slug, file, label, alt);
      setMessage({
        tone: "ok",
        text: result.duplicate
          ? "That image is already in the library."
          : "Uploaded. It's ready to use on pages.",
      });
      setFile(null);
      setLabel("");
      setAlt("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      if (err instanceof AdminError) {
        setFields(err.fields);
        setMessage({ tone: "error", text: err.fields.length ? "The upload needs attention." : err.message });
      } else {
        setMessage({ tone: "error", text: "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-text disabled:opacity-60";

  return (
    <div className="space-y-10">
      {canEdit && (
        <section
          aria-labelledby={`${uid}-upload`}
          className="fb-panel rounded-[var(--radius-panel)] p-6 sm:p-8"
        >
          <h2 id={`${uid}-upload`} className="font-semibold text-text">
            Upload an image
          </h2>
          <p className="mt-1 text-sm text-muted">
            JPEG, PNG, WebP or SVG, up to 8 MB. Photos are resized for the web and their camera details (such
            as location) are removed.
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              upload();
            }}
            className="mt-6 grid gap-5 lg:grid-cols-2"
          >
            <div className="lg:col-span-2">
              <label htmlFor={`${uid}-file`} className="block text-sm font-medium text-text">
                File
              </label>
              <input
                ref={fileRef}
                id={`${uid}-file`}
                type="file"
                accept={ACCEPT}
                disabled={busy}
                aria-describedby={errorFor("file") ? `${uid}-file-error` : undefined}
                onChange={(e) => {
                  const chosen = e.target.files?.[0] ?? null;
                  setFile(chosen);
                  if (chosen && !label)
                    setLabel(chosen.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
                }}
                className="mt-2 block w-full text-sm text-muted file:me-4 file:min-h-11 file:cursor-pointer file:rounded-full file:border file:border-line-strong file:bg-surface file:px-4 file:text-text"
              />
              {errorFor("file") && (
                <p id={`${uid}-file-error`} className="mt-1.5 text-sm text-danger">
                  {errorFor("file")}
                </p>
              )}
            </div>
            <div>
              <label htmlFor={`${uid}-label`} className="block text-sm font-medium text-text">
                Name
              </label>
              <input
                id={`${uid}-label`}
                value={label}
                maxLength={120}
                disabled={busy}
                onChange={(e) => setLabel(e.target.value)}
                className={inputClass}
              />
              {errorFor("label") && <p className="mt-1.5 text-sm text-danger">{errorFor("label")}</p>}
            </div>
            <div>
              <label htmlFor={`${uid}-alt`} className="block text-sm font-medium text-text">
                Alt text
              </label>
              <input
                id={`${uid}-alt`}
                value={alt}
                maxLength={250}
                disabled={busy}
                aria-describedby={`${uid}-alt-hint`}
                onChange={(e) => setAlt(e.target.value)}
                className={inputClass}
              />
              <p
                id={`${uid}-alt-hint`}
                className={cn("mt-1.5 text-sm", errorFor("alt_text") ? "text-danger" : "text-subtle")}
              >
                {errorFor("alt_text") ?? "What the image shows, for people who can't see it. Required."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 lg:col-span-2">
              <ActionButton
                type="submit"
                ready={Boolean(file && label.trim() && alt.trim())}
                busy={busy}
                hint="Choose a file, then name and describe it"
                icon={<ImagePlus aria-hidden className="size-4" />}
              >
                Upload image
              </ActionButton>
              {message && (
                <p
                  role="status"
                  className={cn("text-sm", message.tone === "ok" ? "text-success" : "text-danger")}
                >
                  {message.text}
                </p>
              )}
            </div>
          </form>
        </section>
      )}

      <section aria-labelledby={`${uid}-library`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id={`${uid}-library`} className="font-semibold text-text">
            Library <span className="font-normal text-subtle">· {live.length}</span>
          </h2>
          {archived.length > 0 && (
            <button
              type="button"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((v) => !v)}
              className="min-h-11 text-sm text-muted hover:text-text"
            >
              {showArchived ? "Hide archived" : `Show archived (${archived.length})`}
            </button>
          )}
        </div>
        {live.length === 0 && !showArchived ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line-strong p-10 text-center text-muted">
            No images yet. Upload one to use it on this website&apos;s pages.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(showArchived ? [...live, ...archived] : live).map((item) => (
              <MediaCard key={item.id} slug={slug} item={item} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MediaCard({ slug, item, canEdit }: { slug: string; item: MediaItem; canEdit: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [alt, setAlt] = useState(item.alt_text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const used = item.used_on.length > 0;

  async function run(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(path, body ?? {});
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      aria-label={item.label}
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-surface",
        item.archived_at && "opacity-70",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${STUDIO_MEDIA_BASE}${item.id}?w=480`}
        alt={item.alt_text}
        loading="lazy"
        width={item.width}
        height={item.height}
        className="aspect-[16/10] w-full bg-surface-2 object-cover"
      />
      <div className="space-y-3 p-4">
        {editing ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              run(`media/${item.id}`, { label, alt_text: alt });
            }}
            className="space-y-3"
          >
            <label className="block text-sm font-medium text-text">
              Name
              <input
                value={label}
                maxLength={120}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-normal"
              />
            </label>
            <label className="block text-sm font-medium text-text">
              Alt text
              <textarea
                value={alt}
                rows={2}
                maxLength={250}
                onChange={(e) => setAlt(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 font-normal"
              />
            </label>
            <div className="flex gap-2">
              <ActionButton
                type="submit"
                ready={Boolean(label.trim() && alt.trim()) && (label !== item.label || alt !== item.alt_text)}
                busy={busy}
              >
                Save
              </ActionButton>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setLabel(item.label);
                  setAlt(item.alt_text);
                }}
                className={buttonClasses("ghost", "md")}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div>
              <p id={`${uid}-name`} className="truncate font-medium text-text">
                {item.label}
                {item.archived_at && <span className="ms-2 text-xs font-normal text-subtle">Archived</span>}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{item.alt_text}</p>
              <p className="mt-1 text-xs text-subtle">
                {item.width} × {item.height} · {size(item.byte_size)} ·{" "}
                {item.content_type.replace("image/", "").toUpperCase()}
              </p>
            </div>
            <div className="text-sm">
              {used ? (
                <p className="text-muted">
                  Used on{" "}
                  {item.used_on.map((u, i) => (
                    <span key={`${u.page}-${u.state}`}>
                      {i > 0 && ", "}
                      <Link
                        href={`/admin/sites/${slug}/pages/${u.page}`}
                        className="text-accent underline underline-offset-2"
                      >
                        {u.title}
                      </Link>{" "}
                      <span className="text-subtle">({u.state})</span>
                    </span>
                  ))}
                </p>
              ) : (
                <p className="text-subtle">Not used on any page</p>
              )}
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {!item.archived_at && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-text hover:border-line-strong"
                  >
                    <Pencil aria-hidden className="size-3.5" />
                    Edit<span className="sr-only"> {item.label}</span>
                  </button>
                )}
                {item.archived_at ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(`media/${item.id}/restore`)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-text hover:border-line-strong"
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    Restore<span className="sr-only"> {item.label}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || used}
                    title={used ? "Remove it from its pages first" : undefined}
                    onClick={() => run(`media/${item.id}/archive`)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-text hover:border-line-strong disabled:opacity-50"
                  >
                    <Archive aria-hidden className="size-3.5" />
                    Archive<span className="sr-only"> {item.label}</span>
                  </button>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}
