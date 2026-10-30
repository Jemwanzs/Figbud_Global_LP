"use client";

import { PageBlocks, type PageSection } from "@figbud/site-kit";
import { buttonClasses, cn } from "@figbud/ui";
import { Archive, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { LocalTime } from "./local-time";
import { BlockForm } from "./page-editor";
import { type SharedItem, blockLabel, sectionContent } from "./page-types";

export interface SharedDetail extends SharedItem {
  versions: { number: number; note: string; published_by: string | null; published_at: string }[];
  can_edit: boolean;
  can_publish: boolean;
}

const asSection = (content: Record<string, unknown>) => ({ ...content, id: "content" }) as PageSection;

/**
 * One content library item (P7-D1): edit the draft, publish it everywhere it's
 * used as a new version (reviewers), restore earlier versions, see its pages.
 */
export function SharedEditor({ item }: { item: SharedDetail }) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(item.name);
  const [section, setSection] = useState<PageSection>(() => asSection(item.draft as Record<string, unknown>));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"save" | "publish" | "other" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const form = { name, section };
  const { dirty, markSaved } = useSavedBaseline(form);
  useUnsavedChangesWarning(item.can_edit && dirty);
  const pages = item.used_on.filter((u, i, all) => all.findIndex((x) => x.page === u.page) === i);
  const sites = new Set(item.used_on.map((u) => u.site)).size;

  async function run(kind: "save" | "publish" | "other", action: () => Promise<unknown>, ok: string) {
    setBusy(kind);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "ok", text: ok });
      router.refresh();
      return true;
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run(
      "save",
      async () => {
        const content = sectionContent(section);
        await adminFetch(`shared/${item.id}/draft`, { name, content, version: item.draft_version });
        markSaved();
      },
      "Draft saved. Publish it to update the websites.",
    );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <section aria-labelledby={`${uid}-edit`} className="fb-panel rounded-[var(--radius-panel)] p-6">
          <h2 id={`${uid}-edit`} className="font-semibold text-text">
            Draft · {blockLabel(section.type)}
          </h2>
          <label className="mt-4 block text-sm font-medium text-text">
            Name
            <input
              value={name}
              maxLength={120}
              disabled={!item.can_edit}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 font-normal disabled:opacity-60"
            />
          </label>
          <div className="mt-5">
            <BlockForm section={section} disabled={!item.can_edit} onChange={setSection} />
          </div>
          {item.can_edit && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <ActionButton ready={dirty} busy={busy === "save"} hint="Nothing to save" onClick={save}>
                Save draft
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
          )}
        </section>

        <section aria-labelledby={`${uid}-preview`} className="fb-panel rounded-[var(--radius-panel)] p-6">
          <h2 id={`${uid}-preview`} className="font-semibold text-text">
            Preview
          </h2>
          <div className="mt-4 rounded-2xl border border-line bg-bg p-6">
            <PageBlocks document={{ sections: [section] }} mode="preview" firstHeading={2} />
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section aria-labelledby={`${uid}-publish`} className="fb-panel rounded-[var(--radius-panel)] p-6">
          <h2 id={`${uid}-publish`} className="font-semibold text-text">
            Publishing
          </h2>
          <p className="mt-2 text-sm text-muted">
            {item.published_number
              ? `Version ${item.published_number} is live.`
              : "Not published: pages using it don't show it yet."}{" "}
            {item.draft_differs && item.published_number ? "The draft has changes." : ""}
          </p>
          {item.can_publish ? (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-text">
                What changed
                <input
                  value={note}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-normal"
                />
              </label>
              <ActionButton
                ready={Boolean(note.trim()) && item.draft_differs && !dirty}
                busy={busy === "publish"}
                hint={
                  dirty
                    ? "Save the draft first"
                    : !item.draft_differs
                      ? "Nothing new to publish"
                      : "Say what changed"
                }
                icon={<Send aria-hidden className="size-4" />}
                onClick={async () => {
                  if (
                    await run(
                      "publish",
                      () => adminFetch(`shared/${item.id}/publish`, { note }),
                      "Published everywhere it's used.",
                    )
                  )
                    setNote("");
                }}
              >
                Publish to {sites || "no"} website{sites === 1 ? "" : "s"}
              </ActionButton>
            </div>
          ) : (
            <p className="mt-3 text-sm text-subtle">
              Reviewers publish shared content, because it changes every page using it.
            </p>
          )}
        </section>

        <section aria-labelledby={`${uid}-used`} className="fb-panel rounded-[var(--radius-panel)] p-6">
          <h2 id={`${uid}-used`} className="font-semibold text-text">
            Used on
          </h2>
          {pages.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {pages.map((u) => (
                <li key={u.page}>
                  <Link
                    href={`/admin/sites/${u.site}/pages/${u.page}`}
                    className="text-accent underline underline-offset-2"
                  >
                    {u.site_name} · {u.title}
                  </Link>{" "}
                  <span className="font-mono text-xs text-subtle">{u.path}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-subtle">No pages yet. Add it with the Shared content section.</p>
          )}
        </section>

        <section aria-labelledby={`${uid}-versions`} className="fb-panel rounded-[var(--radius-panel)] p-6">
          <h2 id={`${uid}-versions`} className="font-semibold text-text">
            Versions
          </h2>
          {item.versions.length ? (
            <ol className="mt-3 space-y-3">
              {item.versions.map((v) => (
                <li key={v.number} className="rounded-xl border border-line p-3 text-sm">
                  <p className="font-medium text-text">
                    Version {v.number}
                    {v.number === item.published_number && (
                      <span className="ms-2 text-xs text-success">Live</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-muted">{v.note}</p>
                  <p className="mt-0.5 text-xs text-subtle">
                    {v.published_by ?? "A former admin"} · <LocalTime iso={v.published_at} />
                  </p>
                  {item.can_edit && v.number !== item.published_number && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={async () => {
                        if (
                          await run(
                            "other",
                            () => adminFetch(`shared/${item.id}/versions/${v.number}/restore`, {}),
                            `Version ${v.number} is in the draft. Publish it to make it live.`,
                          )
                        )
                          window.location.reload();
                      }}
                      className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm text-accent hover:underline"
                    >
                      <RotateCcw aria-hidden className="size-3.5" />
                      Restore into draft<span className="sr-only"> (version {v.number})</span>
                    </button>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-subtle">Each publish is kept here.</p>
          )}
        </section>

        {item.can_edit || item.archived_at ? (
          <button
            type="button"
            disabled={busy !== null || (!item.archived_at && pages.length > 0)}
            title={!item.archived_at && pages.length ? "Remove it from its pages first" : undefined}
            onClick={() =>
              run(
                "other",
                () => adminFetch(`shared/${item.id}/${item.archived_at ? "unarchive" : "archive"}`, {}),
                item.archived_at ? "Restored." : "Archived.",
              )
            }
            className={buttonClasses("ghost", "md", "disabled:opacity-50")}
          >
            <Archive aria-hidden className="size-4" />
            {item.archived_at ? "Restore from archive" : "Archive"}
          </button>
        ) : null}
      </aside>
    </div>
  );
}
