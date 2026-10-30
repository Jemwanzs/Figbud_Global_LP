"use client";

import { cn } from "@figbud/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";

import { ActionButton } from "./action-button";
import {
  BLOCKS,
  type BlockType,
  type SharedItem,
  blockLabel,
  newSection,
  sectionContent,
} from "./page-types";

/** Block types a library item can be (images belong to one website; no nesting). */
const TYPES = BLOCKS.filter((b) => b.type !== "image" && b.type !== "shared");

/** The content library (P7-D1): every shared item, where it's used, and a way to add one. */
export function ContentLibrary({ items, canEdit }: { items: SharedItem[]; canEdit: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState("");
  const [type, setType] = useState<BlockType>("text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const live = items.filter((i) => !i.archived_at);
  const archived = items.filter((i) => i.archived_at);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const content = sectionContent(newSection(type));
      const created = await adminFetch<{ id: string }>("shared", { name, content });
      router.push(`/admin/content/${created.id}`);
    } catch (err) {
      setError(err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      {canEdit && (
        <section aria-labelledby={`${uid}-new`} className="fb-panel rounded-[var(--radius-panel)] p-6 sm:p-8">
          <h2 id={`${uid}-new`} className="font-semibold text-text">
            New shared content
          </h2>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create();
            }}
            className="mt-5 grid gap-4 sm:grid-cols-[1fr_16rem_auto] sm:items-end"
          >
            <label className="block text-sm font-medium text-text">
              Name
              <input
                value={name}
                maxLength={120}
                placeholder="For example: Data protection promise"
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 font-normal"
              />
            </label>
            <label className="block text-sm font-medium text-text">
              Kind of section
              <select
                value={type}
                onChange={(e) => setType(e.target.value as BlockType)}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-normal"
              >
                {TYPES.map((b) => (
                  <option key={b.type} value={b.type}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <ActionButton
              type="submit"
              ready={Boolean(name.trim())}
              busy={busy}
              hint="Name it first"
              icon={<Plus aria-hidden className="size-4" />}
            >
              Create
            </ActionButton>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby={`${uid}-list`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id={`${uid}-list`} className="font-semibold text-text">
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
            Nothing shared yet. Create a section once, then add it to pages on any website.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {(showArchived ? [...live, ...archived] : live).map((item) => {
              const pages = new Set(item.used_on.map((u) => u.page)).size;
              const sites = new Set(item.used_on.map((u) => u.site)).size;
              const kind = typeof item.draft.type === "string" ? blockLabel(item.draft.type) : "";
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                  <Link
                    href={`/admin/content/${item.id}`}
                    className="min-w-0 flex-1 font-medium text-text hover:text-accent"
                  >
                    {item.name}
                  </Link>
                  <span className="text-sm text-subtle">{kind}</span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs",
                      item.archived_at
                        ? "border border-line text-subtle"
                        : item.published_number
                          ? "bg-success/15 text-success"
                          : "bg-surface-2 text-muted",
                    )}
                  >
                    {item.archived_at
                      ? "Archived"
                      : item.published_number
                        ? `Version ${item.published_number}${item.draft_differs ? " · draft changes" : ""}`
                        : "Not published"}
                  </span>
                  <span className="w-full text-sm text-muted sm:w-auto">
                    {pages
                      ? `On ${pages} page${pages > 1 ? "s" : ""} · ${sites} website${sites > 1 ? "s" : ""}`
                      : "Not used yet"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
