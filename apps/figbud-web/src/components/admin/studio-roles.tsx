"use client";

import { cn, useConfirm } from "@figbud/ui";
import { Layers } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AREA_LABELS, AdminError, type StudioArea, adminFetch } from "@/lib/admin-client";
import { sameValue } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { type Areas, AreasPicker, type StudioRoleOption, tidy } from "./areas-editor";

/** "Pricing, Pages and SEO": the areas a role opens. */
const areaList = (areas: Areas) =>
  Object.keys(areas)
    .map((a) => AREA_LABELS[a as StudioArea] ?? a)
    .join(", ");

function RoleRow({ initial, onDeleted }: { initial: StudioRoleOption; onDeleted: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [areas, setAreas] = useState<Areas | null>(initial.modules);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const changed = name.trim() !== saved.name || !sameValue(tidy(areas ?? {}), tidy(saved.modules));
  const empty = !areas || Object.keys(tidy(areas)).length === 0;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminFetch<{ name: string; modules: Areas; people_updated: number }>(
        `studio-roles/${saved.id}`,
        { name, modules: tidy(areas ?? {}) },
      );
      setSaved({ ...saved, name: result.name, modules: result.modules });
      setName(result.name);
      setAreas(result.modules);
      setMessage({
        tone: "ok",
        text: result.people_updated
          ? `Saved. ${result.people_updated} ${result.people_updated === 1 ? "person has" : "people have"} the new areas from their next click.`
          : "Saved.",
      });
      router.refresh();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const who = saved.members
      ? `The ${saved.members === 1 ? "person who has it keeps" : `${saved.members} people who have it keep`} their areas.`
      : "No one has this role.";
    const ok = await confirm({
      title: `Delete the role "${saved.name}"?`,
      body: who,
      confirmLabel: "Delete role",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await adminFetch(`studio-roles/${saved.id}/delete`, {});
      onDeleted();
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof AdminError ? err.message : "Something went wrong." });
      setBusy(false);
    }
  }

  return (
    <li aria-label={saved.name} className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text">{saved.name}</p>
          <p className="text-sm text-muted">
            {areaList(saved.modules)} ·{" "}
            {saved.members ? `${saved.members} ${saved.members === 1 ? "person" : "people"}` : "Nobody yet"}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="min-h-11 rounded-xl px-3 text-sm font-medium text-accent hover:bg-accent-soft/60"
        >
          {open ? "Close" : "Edit"}
          <span className="sr-only"> the role {saved.name}</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className="min-h-11 rounded-xl px-3 text-sm font-medium text-danger hover:bg-surface-2 disabled:opacity-50"
        >
          Delete<span className="sr-only"> the role {saved.name}</span>
        </button>
      </div>
      {open && (
        <div className="mt-4 border-t border-line pt-4">
          <label className="grid max-w-sm gap-1 text-xs text-muted">
            Name
            <input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text"
            />
          </label>
          <AreasPicker
            name={saved.name}
            role="reviewer"
            value={areas}
            onChange={(next) => setAreas(next ?? {})}
            selectedFrom={saved.modules}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ActionButton
              ready={changed && !empty && name.trim().length >= 2}
              busy={busy}
              hint={empty ? "Tick at least one area" : changed ? undefined : "No changes"}
              onClick={save}
            >
              Save role<span className="sr-only"> {saved.name}</span>
            </ActionButton>
          </div>
        </div>
      )}
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("mt-2 text-sm", message.tone === "error" ? "text-danger" : "text-success")}
        >
          {message.text}
        </p>
      )}
    </li>
  );
}

/**
 * Named Studio roles (P13-B3): saved sets of areas and actions. They're made
 * from someone's areas (Change access → Save these areas as a named role) and
 * given from the same place; changing one here updates everyone who has it.
 */
export function StudioRoles({ roles }: { roles: StudioRoleOption[] }) {
  const [list, setList] = useState(roles);
  return (
    <section aria-labelledby="studio-roles" className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong"
        >
          <Layers className="size-5" />
        </span>
        <div>
          <h2 id="studio-roles" className="font-display text-xl font-semibold text-text">
            Studio roles
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Saved sets of Studio areas and actions, to give to people in one step. Changing a role updates
            everyone who has it; deleting one keeps their areas as they are. Their Studio role (owner,
            reviewer, editor or viewer) still applies on top.
          </p>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="mt-4 text-sm text-subtle">
          No saved roles yet. Choose selected areas for someone under Change access, then save them as a named
          role.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3">
          {list.map((r) => (
            <RoleRow
              key={r.id}
              initial={r}
              onDeleted={() => setList((l) => l.filter((x) => x.id !== r.id))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
