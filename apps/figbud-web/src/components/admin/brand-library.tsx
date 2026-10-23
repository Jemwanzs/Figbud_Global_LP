"use client";

import { buttonClasses, cn } from "@figbud/ui";
import { Archive, ArchiveRestore, ImageUp, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { AdminError, type FieldError, adminFetch, uploadBrandAsset } from "@/lib/admin-client";

import { ADMIN_ASSET_PATH, type LibraryAsset, ORIGIN_LABELS, fileSize, placementText } from "./brand-types";

const ACCEPT = ["image/svg+xml", "image/png", "image/webp"];
const MAX_BYTES = { "image/svg+xml": 512 * 1024, default: 2 * 1024 * 1024 };

/** Thumbnail of a library file on the background it was made for. */
export function AssetThumb({ asset, className }: { asset: LibraryAsset; className?: string }) {
  const used = [...asset.used_in.draft, ...asset.used_in.published, ...asset.used_in.pending];
  const light =
    /light/i.test(asset.label) ||
    (used.some((p) => p.theme === "light") && !used.some((p) => p.theme === "dark"));
  const src =
    asset.content_type === "image/svg+xml" || asset.widths.length === 0
      ? `${ADMIN_ASSET_PATH}${asset.id}`
      : `${ADMIN_ASSET_PATH}${asset.id}?w=${asset.widths.find((w) => w >= 160) ?? asset.widths.at(-1)}`;
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-lg border border-line p-2",
        light ? "bg-[#fbf7f1]" : "bg-[#120f0d]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of an uploaded file */}
      <img src={src} alt={asset.alt_text} className="max-h-full max-w-full object-contain" />
    </span>
  );
}

export function BrandLibrary({
  slug,
  assets,
  canEdit,
  onChange,
}: {
  slug: string;
  assets: LibraryAsset[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Local preview before anything is uploaded; object URLs are released when replaced or on leaving.
  const previewUrl = useRef<string | null>(null);
  const showPreview = (next: File | null) => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = next ? URL.createObjectURL(next) : null;
    setPreview(previewUrl.current);
  };
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const errorFor = (field: string) => fields.find((f) => f.field === field)?.message;

  function choose(next: File | undefined) {
    setFields([]);
    setMessage(null);
    setDimensions(null);
    if (!next) return;
    if (!ACCEPT.includes(next.type)) {
      setFields([{ field: "file", code: "type", message: "Choose an SVG, PNG or WebP file." }]);
      return;
    }
    const max = next.type === "image/svg+xml" ? MAX_BYTES["image/svg+xml"] : MAX_BYTES.default;
    if (next.size > max) {
      setFields([{ field: "file", code: "size", message: "Files can be up to 2 MB (SVG up to 512 KB)." }]);
      return;
    }
    setFile(next);
    showPreview(next);
    if (!label) setLabel(next.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
  }

  async function upload() {
    if (!file) return;
    setBusy("upload");
    setFields([]);
    setMessage(null);
    try {
      await uploadBrandAsset<LibraryAsset>(slug, file, label, alt);
      setMessage({ tone: "ok", text: "File added to the library. Choose where to use it above." });
      setFile(null);
      showPreview(null);
      setLabel("");
      setAlt("");
      if (input.current) input.current.value = "";
      onChange();
    } catch (err) {
      if (err instanceof AdminError) setFields(err.fields);
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setBusy(null);
    }
  }

  async function act(asset: LibraryAsset, action: "archive" | "restore") {
    setBusy(asset.id);
    setMessage(null);
    try {
      await adminFetch(`sites/${slug}/brand/assets/${asset.id}/${action}`, {});
      setMessage({ tone: "ok", text: action === "archive" ? "File archived." : "File restored." });
      onChange();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  const visible = assets.filter((a) => showArchived || !a.archived_at);
  const archivedCount = assets.filter((a) => a.archived_at).length;
  const inputClass =
    "mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-text disabled:opacity-60";

  return (
    <div className="space-y-6">
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            upload();
          }}
          className="rounded-2xl border border-dashed border-line-strong p-5"
          noValidate
        >
          <div className="grid gap-5 md:grid-cols-[12rem_minmax(0,1fr)]">
            <div>
              <label
                htmlFor={`${uid}-file`}
                className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 p-3 text-center text-sm text-muted hover:border-line-strong"
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
                  <img
                    src={preview}
                    alt="Preview of the chosen file"
                    className="max-h-full max-w-full object-contain"
                    onLoad={(e) =>
                      setDimensions(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} px`)
                    }
                  />
                ) : (
                  <>
                    <ImageUp aria-hidden className="size-6" />
                    Choose a logo file
                  </>
                )}
              </label>
              <input
                ref={input}
                id={`${uid}-file`}
                type="file"
                accept={ACCEPT.join(",")}
                className="sr-only"
                aria-describedby={`${uid}-file-hint`}
                onChange={(e) => choose(e.target.files?.[0])}
              />
              <p
                id={`${uid}-file-hint`}
                className={cn("mt-2 text-xs", errorFor("file") ? "text-danger" : "text-subtle")}
              >
                {errorFor("file") ??
                  (file
                    ? `${file.name} · ${fileSize(file.size)}${dimensions ? ` · ${dimensions}` : ""}`
                    : "SVG, PNG or WebP · transparent backgrounds welcome")}
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor={`${uid}-label`} className="block text-sm font-medium text-text">
                  File name in the library
                </label>
                <input
                  id={`${uid}-label`}
                  value={label}
                  maxLength={120}
                  onChange={(e) => setLabel(e.target.value)}
                  aria-invalid={errorFor("label") ? true : undefined}
                  className={inputClass}
                />
                {errorFor("label") && <p className="mt-1.5 text-sm text-danger">{errorFor("label")}</p>}
              </div>
              <div>
                <label htmlFor={`${uid}-alt`} className="block text-sm font-medium text-text">
                  Alternative text
                </label>
                <input
                  id={`${uid}-alt`}
                  value={alt}
                  maxLength={200}
                  onChange={(e) => setAlt(e.target.value)}
                  aria-invalid={errorFor("alt_text") ? true : undefined}
                  aria-describedby={`${uid}-alt-hint`}
                  className={inputClass}
                />
                <p
                  id={`${uid}-alt-hint`}
                  className={cn("mt-1.5 text-sm", errorFor("alt_text") ? "text-danger" : "text-subtle")}
                >
                  {errorFor("alt_text") ?? "Read by screen readers. Usually the product name."}
                </p>
              </div>
              <p className="text-xs text-subtle">
                Logos for light backgrounds: include “light” in the file name to preview them on a light
                background. Uploading never changes the website; choose where to use the file, then submit the
                draft.
              </p>
              <button type="submit" disabled={!file || !!busy} className={buttonClasses("secondary", "md")}>
                {busy === "upload" && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                Upload to library
              </button>
            </div>
          </div>
        </form>
      )}

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}
        >
          {message.text}
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2" aria-label="Brand files">
        {visible.map((asset) => {
          const uses = [
            ...asset.used_in.published.map((p) => `Live: ${placementText(p)}`),
            ...asset.used_in.pending.map((p) => `Awaiting approval: ${placementText(p)}`),
            ...asset.used_in.draft.map((p) => `Draft: ${placementText(p)}`),
          ];
          return (
            <li
              key={asset.id}
              className={cn(
                "rounded-2xl border border-line bg-surface p-4",
                asset.archived_at && "opacity-70",
              )}
            >
              <AssetThumb asset={asset} className="h-24" />
              <div className="mt-3 flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-text">{asset.label}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-xs",
                    asset.origin === "official" && "border-success/30 text-success",
                    asset.origin === "proposed" && "border-warning/40 text-warning",
                    asset.origin === "upload" && "border-line text-muted",
                  )}
                >
                  {asset.archived_at ? "Archived" : ORIGIN_LABELS[asset.origin]}
                </span>
              </div>
              <p className="mt-1 text-xs text-subtle">
                {asset.content_type.replace("image/", "").replace("+xml", "").toUpperCase()} · {asset.width} ×{" "}
                {asset.height} px · {fileSize(asset.byte_size)}
                {asset.has_alpha && " · transparent"}
              </p>
              <p className="mt-2 text-xs text-muted">{uses.length ? uses.join(" · ") : "Not used"}</p>
              {canEdit && (
                <button
                  type="button"
                  disabled={!!busy || (!asset.archived_at && uses.length > 0)}
                  title={
                    !asset.archived_at && uses.length > 0 ? "In use: replace it everywhere first" : undefined
                  }
                  onClick={() => act(asset, asset.archived_at ? "restore" : "archive")}
                  className={buttonClasses("ghost", "md", "-ms-3 mt-2")}
                >
                  {busy === asset.id ? (
                    <LoaderCircle aria-hidden className="size-4 animate-spin" />
                  ) : asset.archived_at ? (
                    <ArchiveRestore aria-hidden className="size-4" />
                  ) : (
                    <Archive aria-hidden className="size-4" />
                  )}
                  {asset.archived_at ? "Restore" : "Archive"}
                  <span className="sr-only"> {asset.label}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {archivedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-sm text-accent hover:underline"
        >
          {showArchived ? "Hide archived files" : `Show archived files (${archivedCount})`}
        </button>
      )}
    </div>
  );
}
