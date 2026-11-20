"use client";

import {
  DEFAULT_DEMO_IDENTITIES,
  type DemoIdentities,
  type DemoIdentity,
  DemoAvatar,
  DemoName,
  DemoPeopleProvider,
  demoPeople,
} from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { LocalTime } from "./local-time";
import type { WebsiteSettingsAdmin } from "./website-settings";

const input = "mt-1 min-h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text";
type Message = { tone: "ok" | "error"; text: string } | null;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A key from a name, unique among the others ("Libbie Sonia" → "libbie-sonia"). */
function keyFor(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 20) || "person";
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}-${i}`;
  return key;
}

/**
 * Marketing → Sample identities (owner's brief, 20 Nov 2026, P14-W10): the
 * fictional people every website's illustrations use, in order, with each
 * website's lead. Saved with FigBud Global's settings: draft, preview,
 * publish, restore, audited.
 */
export function IdentitiesStudio({
  data,
  sites,
}: {
  data: WebsiteSettingsAdmin;
  sites: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const uid = useId();
  const canEdit = data.can_edit;
  const [base, setBase] = useState(data.settings);
  const [version, setVersion] = useState(data.version);
  const saved = base.demo_identities_draft ?? base.demo_identities ?? DEFAULT_DEMO_IDENTITIES;
  const [d, setD] = useState<DemoIdentities>(saved);
  const [previewSite, setPreviewSite] = useState(
    sites.find((s) => s.slug === "zirahr")?.slug ?? sites[0]?.slug,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  useUnsavedChangesWarning(canEdit && !same(d, saved));

  const people = d.people;
  const setPeople = (next: DemoIdentity[]) => setD({ ...d, people: next });
  const update = (i: number, patch: Partial<DemoIdentity>) =>
    setPeople(people.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, by: number) => {
    const next = [...people];
    const [p] = next.splice(i, 1);
    next.splice(i + by, 0, p!);
    setPeople(next);
  };
  const published = new Set((base.demo_identities?.people ?? []).map((p) => p.id));

  async function save(label: string, patch: Partial<typeof base>, done: string) {
    setBusy(label);
    setMessage(null);
    try {
      const result = await adminFetch<WebsiteSettingsAdmin>("sites/figbud/settings", {
        settings: { ...base, ...patch },
        version,
      });
      setBase(result.settings);
      setVersion(result.version);
      setMessage({ tone: "ok", text: done });
      router.refresh();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  }

  const previewPeople = demoPeople(d, previewSite);

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]" data-identities-studio="">
      <div className="fb-panel space-y-4 rounded-[var(--radius-panel)] p-5">
        {!canEdit && (
          <p className="rounded-xl border border-line bg-surface-2 p-4 text-sm text-muted">
            Reviewers and owners change sample identities. You can see what the websites show.
          </p>
        )}
        <p className="text-sm text-muted" data-identities-status="">
          {base.demo_identities
            ? "Published: the websites use these identities."
            : "Not published yet: the websites use the approved defaults shown here until you publish."}
          {base.demo_identities_draft && " A draft is saved."}
        </p>
        <ol className="space-y-3" aria-label="Sample identities">
          {people.map((p, i) => (
            <li
              key={p.id}
              data-identity={p.id}
              className={cn("rounded-xl border border-line p-3", p.active === false && "opacity-60")}
            >
              <div className="flex items-center gap-3">
                <DemoAvatar person={demoPeople({ people: [p] })[0]!} />
                <p className="min-w-0 flex-1 truncate font-medium text-text">{p.name || "New identity"}</p>
                <button
                  type="button"
                  aria-label={`Move ${p.name} up`}
                  disabled={!canEdit || i === 0}
                  onClick={() => move(i, -1)}
                  className="grid size-9 place-items-center rounded-full text-muted hover:text-text disabled:opacity-40"
                >
                  <ArrowUp aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${p.name} down`}
                  disabled={!canEdit || i === people.length - 1}
                  onClick={() => move(i, 1)}
                  className="grid size-9 place-items-center rounded-full text-muted hover:text-text disabled:opacity-40"
                >
                  <ArrowDown aria-hidden className="size-4" />
                </button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-medium text-muted">
                  Display name
                  <input
                    value={p.name}
                    maxLength={40}
                    disabled={!canEdit}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className={input}
                  />
                </label>
                <label className="block text-xs font-medium text-muted">
                  First name (optional)
                  <input
                    value={p.first_name ?? ""}
                    maxLength={20}
                    disabled={!canEdit}
                    placeholder={p.name.split(" ")[0]}
                    onChange={(e) => update(i, { first_name: e.target.value || null })}
                    className={input}
                  />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Initials (optional)
                  <input
                    value={p.initials ?? ""}
                    maxLength={3}
                    disabled={!canEdit}
                    placeholder={demoPeople({ people: [p] })[0]!.initials}
                    onChange={(e) => update(i, { initials: e.target.value.toUpperCase() || null })}
                    className={input}
                  />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Fictional role (optional)
                  <input
                    value={p.role ?? ""}
                    maxLength={48}
                    disabled={!canEdit}
                    onChange={(e) => update(i, { role: e.target.value || null })}
                    className={input}
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <label className="flex min-h-10 items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={p.active !== false}
                    disabled={!canEdit}
                    onChange={(e) => update(i, { active: e.target.checked })}
                    className="size-5 accent-[var(--color-accent)]"
                  />
                  Active
                </label>
                {/* Published identities are deactivated, not removed, so a restore can bring them back. */}
                {canEdit && !published.has(p.id) && people.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setPeople(people.filter((_, j) => j !== i))}
                    className="text-sm text-muted hover:text-danger"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
        {canEdit && people.length < 20 && (
          <button
            type="button"
            onClick={() =>
              setPeople([
                ...people,
                {
                  id: keyFor(
                    "person",
                    people.map((p) => p.id),
                  ),
                  name: "",
                  active: true,
                },
              ])
            }
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-3.5 text-sm text-text hover:border-line-strong"
          >
            <Plus aria-hidden className="size-4" />
            Add identity
          </button>
        )}

        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-xs font-medium text-muted">Lead identity per website</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {sites.map((site) => (
              <div key={site.slug} className="block text-xs font-medium text-muted">
                <label htmlFor={`${uid}-lead-${site.slug}`}>{site.name}</label>
                <select
                  id={`${uid}-lead-${site.slug}`}
                  value={d.leads?.[site.slug] ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const leads = { ...(d.leads ?? {}) };
                    if (e.target.value) leads[site.slug] = e.target.value;
                    else delete leads[site.slug];
                    setD({ ...d, leads });
                  }}
                  className={input}
                >
                  <option value="">The first in the list</option>
                  {people
                    .filter((p) => p.active !== false && p.name)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>
        </fieldset>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <ActionButton
              variant="secondary"
              ready={!same(d, base.demo_identities_draft ?? base.demo_identities)}
              busy={busy === "draft"}
              hint="Nothing new to save"
              onClick={() =>
                save(
                  "draft",
                  { demo_identities_draft: d },
                  "Draft saved. Websites still use the published identities.",
                )
              }
            >
              Save draft
            </ActionButton>
            <ActionButton
              ready={!same(d, base.demo_identities)}
              busy={busy === "publish"}
              hint="Matches what's published"
              onClick={() =>
                save(
                  "publish",
                  { demo_identities: d, demo_identities_draft: null },
                  "Published. The websites show these within a few minutes.",
                )
              }
            >
              Publish
            </ActionButton>
            {base.demo_identities_draft && (
              <button
                type="button"
                onClick={() => {
                  setD(base.demo_identities ?? DEFAULT_DEMO_IDENTITIES);
                  void save("discard", { demo_identities_draft: null }, "Draft discarded.");
                }}
                className="text-sm text-muted hover:text-text"
              >
                Discard draft
              </button>
            )}
          </div>
        )}
        {(base.demo_identities_history?.length ?? 0) > 0 && (
          <details className="rounded-xl border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium text-text">Published versions</summary>
            <ul className="mt-2 space-y-2">
              {base.demo_identities_history!.map((v) => (
                <li key={v.published_at} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">
                    <LocalTime iso={v.published_at} />
                    {v.by && ` · ${v.by}`} · {v.identities.people.map((p) => p.name).join(", ")}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setD(v.identities)}
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
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}
          >
            {message.text}
          </p>
        )}
      </div>

      <section aria-labelledby={`${uid}-preview`} className="min-w-0 space-y-3" data-identities-preview="">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${uid}-preview`} className="text-sm font-medium text-text">
            Preview: how illustrations show them
          </h2>
          <div className="flex items-center gap-2 text-sm text-muted">
            <label htmlFor={`${uid}-site`}>Website</label>
            <select
              id={`${uid}-site`}
              value={previewSite ?? ""}
              onChange={(e) => setPreviewSite(e.target.value)}
              className="min-h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text"
            >
              {sites.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* The draft, through the same provider the websites use. */}
        <DemoPeopleProvider identities={d} slug={previewSite}>
          <div className="rounded-[var(--radius-panel)] border border-line bg-bg p-5">
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
              <DemoAvatar
                person={previewPeople[0]!}
                className="grid size-11 place-items-center rounded-full bg-product text-sm font-semibold text-product-ink"
              />
              <div className="min-w-0">
                <p className="truncate font-semibold text-text" data-preview-lead="">
                  <DemoName />
                </p>
                <p className="truncate text-xs text-muted">
                  <DemoName form="role" />
                </p>
              </div>
              <span className="ms-auto shrink-0 rounded-full bg-product-soft px-2 py-0.5 text-xs text-product-text">
                One record
              </span>
            </div>
            <p className="mt-4 text-xs text-subtle">Leave requests</p>
            <ul className="mt-2 space-y-2">
              {["Annual leave · 5 days", "Sick leave · 1 day", "Study leave · 3 days"].map((what, i) => (
                <li key={what} className="flex items-center gap-2.5 text-sm">
                  <DemoAvatar person={previewPeople[i]!} />
                  <span className="min-w-0 flex-1 truncate text-text">
                    <DemoName index={i} form="short" /> · {what}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-subtle">Team calendar</p>
            <p className="mt-1 text-sm text-text">
              {previewPeople
                .slice(0, 5)
                .map((p) => p.short)
                .join(" · ")}
            </p>
          </div>
        </DemoPeopleProvider>
      </section>
    </div>
  );
}
