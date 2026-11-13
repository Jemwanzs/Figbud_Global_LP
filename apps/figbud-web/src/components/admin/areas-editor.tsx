"use client";

import { cn } from "@figbud/ui";
import { useId, useState } from "react";

import {
  ACTION_LABELS,
  AREA_LABELS,
  AdminError,
  type AdminUser,
  STUDIO_ACTIONS,
  STUDIO_AREAS,
  type StudioAction,
  type StudioArea,
  adminFetch,
} from "@/lib/admin-client";
import { sameValue } from "@/lib/form-state";

import { ActionButton } from "./action-button";

export type Areas = Partial<Record<StudioArea, StudioAction[]>>;

/** A named Studio role (P13-B3): saved areas, given to people and kept in step. */
export interface StudioRoleOption {
  id: string;
  name: string;
  modules: Areas;
  members?: number;
}

const work: StudioAction[] = ["view", "edit", "submit"];
/** Starting points for the roles in the owner's brief; every box can then be changed. */
const PRESETS: { label: string; areas: Areas }[] = [
  {
    label: "Website admin",
    areas: Object.fromEntries(
      STUDIO_AREAS.filter((a) => a !== "websites").map((a) => [a, ["view", "edit", "submit", "publish"]]),
    ),
  },
  { label: "Content manager", areas: { pages: work, hero: work, content: work, branding: work, seo: work } },
  {
    label: "Marketing manager",
    areas: { campaigns: work, proof: work, content: work, enquiries: ["view", "export"] },
  },
  { label: "Pricing manager", areas: { pricing: work } },
  {
    label: "Publisher / approver",
    areas: Object.fromEntries(
      STUDIO_AREAS.map((a) => [a, a === "websites" ? ["view"] : ["view", "publish"]]),
    ),
  },
  { label: "Viewer / auditor", areas: Object.fromEntries(STUDIO_AREAS.map((a) => [a, ["view"]])) },
];

export const tidy = (areas: Areas): Areas =>
  Object.fromEntries(
    Object.entries(areas)
      .map(([a, actions]) => {
        const list = STUDIO_ACTIONS.filter((x) => actions?.includes(x));
        // Viewing comes with any grant (as the API does).
        return [a, list.length && !list.includes("view") ? ["view", ...list] : list];
      })
      .filter(([, list]) => (list as StudioAction[]).length),
  );

function summary(before: Areas | null, after: Areas | null): string[] {
  if (before === null && after === null) return [];
  if (after === null) return ["Every area within their role, as before limits were set."];
  const lines: string[] = [];
  if (before === null) lines.push("Limits them to the areas below (they had every area).");
  for (const area of STUDIO_AREAS) {
    const was = before === null ? null : (before[area] ?? []);
    const now = after[area] ?? [];
    if (was === null) continue;
    const added = now.filter((a) => !was.includes(a));
    const removed = was.filter((a) => !now.includes(a));
    if (added.length)
      lines.push(`${AREA_LABELS[area]}: adds ${added.map((a) => ACTION_LABELS[a]).join(", ")}`);
    if (removed.length)
      lines.push(`${AREA_LABELS[area]}: removes ${removed.map((a) => ACTION_LABELS[a]).join(", ")}`);
  }
  return lines;
}

/**
 * Studio areas for one person (P13-B3): every area within their role, or
 * selected areas with their actions. The role still applies (a viewer can't
 * edit whatever is ticked); the API enforces both.
 */
export function AreasEditor({
  id,
  name,
  role,
  initial,
  initialRole = null,
  roles: initialRoles = [],
}: {
  id: string;
  name: string;
  role: AdminUser["role"];
  initial: Areas | null;
  /** The named role their areas come from, if any. */
  initialRole?: string | null;
  /** Saved Studio roles to choose from. */
  roles?: StudioRoleOption[];
}) {
  const [saved, setSaved] = useState<Areas | null>(initial ? tidy(initial) : null);
  const [value, setValue] = useState<Areas | null>(saved);
  // A named role keeps their areas in step with it; editing boxes by hand unlinks it.
  const [savedRole, setSavedRole] = useState<string | null>(initialRole);
  const [linked, setLinked] = useState<string | null>(initialRole);
  const [roles, setRoles] = useState<StudioRoleOption[]>(initialRoles);
  const [roleName, setRoleName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const changes = summary(saved, value === null ? null : tidy(value));
  const changed = !sameValue(saved, value === null ? null : tidy(value)) || linked !== savedRole;
  const empty = value !== null && Object.keys(tidy(value)).length === 0;
  const linkedName = roles.find((r) => r.id === linked)?.name;

  async function saveAsRole() {
    if (value === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const created = await adminFetch<StudioRoleOption>("studio-roles", {
        name: roleName,
        modules: tidy(value),
      });
      setRoles((r) => [...r, created].sort((a, b) => a.name.localeCompare(b.name)));
      setValue(created.modules);
      setLinked(created.id);
      setRoleName("");
      setMessage({ tone: "ok", text: `Role "${created.name}" saved. Save areas to give it to ${name}.` });
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const next = value === null ? null : tidy(value);
      const result = await adminFetch<{ modules: Areas | null; studio_role_id: string | null }>(
        `team/${id}/modules`,
        linked ? { modules: null, role_id: linked } : { modules: next },
      );
      setSaved(result.modules);
      setValue(result.modules);
      setSavedRole(result.studio_role_id);
      setLinked(result.studio_role_id);
      setMessage({ tone: "ok", text: "Areas saved. They apply from their next click." });
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="mt-5 border-t border-line pt-5">
      <legend className="text-sm font-medium text-text">
        Studio areas<span className="sr-only"> for {name}</span>
      </legend>
      <AreasPicker
        name={name}
        role={role}
        value={value}
        onChange={(next) => {
          setValue(next);
          setLinked(null);
        }}
        selectedFrom={saved}
        roles={roles}
        onRole={(picked) => {
          setValue(structuredClone(picked.modules));
          setLinked(picked.id);
        }}
      />
      {linkedName && (
        <p className="mt-3 text-sm text-muted" data-linked-role="">
          {`Uses the saved role "${linkedName}": changes to that role apply to ${name} too. Ticking a box here unlinks it.`}
        </p>
      )}
      {value !== null && !linked && !empty && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-muted">
            Save these areas as a named role
            <input
              value={roleName}
              maxLength={60}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="e.g. Regional content editor"
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text"
            />
          </label>
          <ActionButton
            variant="secondary"
            ready={roleName.trim().length >= 2}
            busy={busy}
            onClick={saveAsRole}
          >
            Save role<span className="sr-only"> from {name}&apos;s areas</span>
          </ActionButton>
        </div>
      )}
      {changed && changes.length > 0 && (
        <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm" aria-live="polite">
          <p className="font-medium text-text">Changes to apply</p>
          <ul className="mt-1 list-disc ps-5 text-muted">
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ActionButton
          ready={changed && !empty}
          busy={busy}
          hint={empty ? "Tick at least one area, or choose every area" : changed ? undefined : "No changes"}
          onClick={save}
        >
          Save areas<span className="sr-only"> for {name}</span>
        </ActionButton>
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={cn("text-sm", message.tone === "error" ? "text-danger" : "text-success")}
          >
            {message.text}
          </p>
        )}
      </div>
    </fieldset>
  );
}

/**
 * The areas grid on its own: every area within the role, or selected areas
 * with their actions, from presets or one by one. Used for a person's areas
 * and when inviting someone.
 */
export function AreasPicker({
  name,
  role,
  value,
  onChange,
  selectedFrom,
  roles = [],
  onRole,
}: {
  name: string;
  role: AdminUser["role"];
  value: Areas | null;
  onChange: (next: Areas | null) => void;
  /** What "Selected areas" starts from. */
  selectedFrom?: Areas | null;
  /** Saved Studio roles, offered with the presets. */
  roles?: StudioRoleOption[];
  /** A saved role was chosen (otherwise its areas are copied, as a preset). */
  onRole?: (role: StudioRoleOption) => void;
}) {
  const uid = useId();
  const toggle = (area: StudioArea, action: StudioAction, on: boolean) => {
    const current = value?.[area] ?? [];
    const next = on ? [...current, action] : current.filter((a) => a !== action && !(action === "view"));
    onChange({ ...value, [area]: next });
  };
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`${uid}-mode`}
            checked={value === null}
            onChange={() => onChange(null)}
            className="size-4 accent-[var(--accent)]"
          />
          Every area their role allows
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`${uid}-mode`}
            checked={value !== null}
            onChange={() => onChange(selectedFrom ?? {})}
            className="size-4 accent-[var(--accent)]"
          />
          Selected areas
        </label>
      </div>
      {value !== null && (
        <>
          <label className="mt-4 grid w-fit gap-1 text-xs text-muted">
            Start from
            <select
              value=""
              onChange={(e) => {
                const saved = roles.find((r) => `role:${r.id}` === e.target.value);
                if (saved) {
                  if (onRole) onRole(saved);
                  else onChange(structuredClone(saved.modules));
                  return;
                }
                const preset = PRESETS.find((p) => p.label === e.target.value);
                if (preset) onChange(structuredClone(preset.areas));
              }}
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text"
            >
              <option value="">A preset…</option>
              {roles.length > 0 && (
                <optgroup label="Saved roles">
                  {roles.map((r) => (
                    <option key={r.id} value={`role:${r.id}`}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Presets">
                {PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">What {name} may do in each area</caption>
              <thead>
                <tr className="text-start text-xs text-subtle">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">
                    Area
                  </th>
                  {STUDIO_ACTIONS.map((a) => (
                    <th key={a} scope="col" className="px-2 py-2 font-medium">
                      {ACTION_LABELS[a]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {STUDIO_AREAS.map((area) => (
                  <tr key={area}>
                    <th scope="row" className="py-2 pe-3 text-start font-normal text-text">
                      {AREA_LABELS[area]}
                    </th>
                    {STUDIO_ACTIONS.map((action) => (
                      <td key={action} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${AREA_LABELS[area]}: ${ACTION_LABELS[action]}`}
                          checked={Boolean(value[area]?.includes(action))}
                          onChange={(e) => toggle(area, action, e.target.checked)}
                          className="size-4 accent-[var(--accent)]"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-subtle">
            {`Their Studio role (${role}) still applies: a viewer can't edit and an editor can't approve, whatever is ticked.`}
          </p>
        </>
      )}
    </>
  );
}
