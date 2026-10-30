"use client";

import {
  type BrandProfile,
  type CampaignAction,
  type CampaignPlacement,
  CampaignPreview,
  type LiveCampaign,
} from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import { Monitor, Moon, Plus, Smartphone, Sun, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useMemo, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { sameValue, useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import {
  ACTION_LABELS,
  type CampaignDetail,
  type CampaignDoc,
  KIND_LABELS,
  PLACEMENT_LABELS,
  REWARD_KINDS,
  type Reward,
  STATUS_LABELS,
  ctr,
} from "./campaign-types";
import { LocalTime, fromLocalInput } from "./local-time";
import { type MediaItem, STUDIO_MEDIA_BASE } from "./page-types";

const inputClass =
  "mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text disabled:opacity-60";

/** ISO instant → `datetime-local` value in the admin's time zone. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Plain paragraphs for the preview (websites get the API's rendered Markdown). */
const paragraphs = (text?: string | null) =>
  text?.trim()
    ? text
        .trim()
        .split(/\n{2,}/)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join("")
    : null;

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-text">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-subtle">{hint}</span>}
    </label>
  );
}

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6">
      <h2 id={id} className="font-semibold text-text">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={inputClass}
      >
        {(Object.keys(options) as T[]).map((k) => (
          <option key={k} value={k}>
            {options[k]}
          </option>
        ))}
      </select>
    </Field>
  );
}

type Draft = { name: string; objective: string; description: string; document: CampaignDoc };

/** Marketing → Campaigns & Promotions → a campaign: build, preview, publish, measure. */
export function CampaignBuilder({
  initial,
  brand,
  media,
  userId,
  isOwner,
}: {
  initial: CampaignDetail;
  brand: BrandProfile | null;
  media: MediaItem[];
  userId: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const id = initial.id;
  const editable = initial.can_edit;
  const start: Draft = {
    name: initial.name,
    objective: initial.objective,
    description: initial.description,
    document: initial.draft,
  };
  const [draft, setDraft] = useState<Draft>(start);
  const { baseline, dirty, markSaved } = useSavedBaseline(draft, start);
  const [version, setVersion] = useState(initial.draft_version);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState("");
  const [placement, setPlacement] = useState<CampaignPlacement>(
    initial.draft.display.placements[0] ?? "home_hero",
  );
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useUnsavedChangesWarning(dirty);
  // The server's draft moved on (a version restored here or by someone else): reload it,
  // adjusting state while rendering rather than in an effect.
  if (initial.draft_version > version) {
    const next = {
      name: initial.name,
      objective: initial.objective,
      description: initial.description,
      document: initial.draft,
    };
    setVersion(initial.draft_version);
    setDraft(next);
    markSaved(next);
  }

  const doc = draft.document;
  const set = (document: CampaignDoc) => setDraft({ ...draft, document });
  const content = (patch: Partial<CampaignDoc["content"]>) =>
    set({ ...doc, content: { ...doc.content, ...patch } });
  const design = (patch: Partial<CampaignDoc["design"]>) =>
    set({ ...doc, design: { ...doc.design, ...patch } });
  const display = (patch: Partial<CampaignDoc["display"]>) =>
    set({ ...doc, display: { ...doc.display, ...patch } });
  const schedule = (patch: Partial<CampaignDoc["schedule"]>) =>
    set({ ...doc, schedule: { ...doc.schedule, ...patch } });
  const rewards = (patch: Partial<NonNullable<CampaignDoc["rewards"]>>) =>
    set({ ...doc, rewards: { ...doc.rewards!, ...patch } });

  const pending = initial.revisions.find((r) => r.state === "pending");
  const published = initial.revisions.filter((r) => r.state === "published");

  async function run(
    label: string,
    path: string,
    body: unknown,
    success: string,
    after?: (r: unknown) => void,
  ) {
    setBusy(label);
    setMessage(null);
    try {
      const result = await adminFetch(path, body);
      setMessage({ tone: "ok", text: success });
      if (after) after(result);
      else router.refresh();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", `campaigns/${id}/draft`, { ...draft, version }, "Draft saved.", (r) => {
      setVersion((r as { draft_version: number }).draft_version);
      markSaved(draft);
      router.refresh();
    });

  // The draft as websites would receive it, for the live preview.
  const image = media.find((m) => m.id === doc.content.image_id);
  const preview: LiveCampaign = useMemo(() => {
    const open = (doc.rewards?.rewards ?? []).filter((r) => r.weight > 0 && r.quantity !== 0);
    const total = open.reduce((n, r) => n + r.weight, 0);
    return {
      id,
      reference: initial.reference,
      kind: initial.kind,
      priority: doc.schedule.priority,
      content: {
        ...doc.content,
        body_html: paragraphs(doc.content.body),
        terms_html: paragraphs(doc.content.terms),
        media: image
          ? {
              id: image.id,
              alt: image.alt_text,
              width: image.width,
              height: image.height,
              content_type: image.content_type,
              widths: [],
            }
          : null,
      },
      design: doc.design,
      display: doc.display,
      schedule: doc.schedule,
      rewards: doc.rewards
        ? {
            ...doc.rewards,
            rewards: doc.rewards.rewards.map((r) => {
              const available = r.weight > 0 && r.quantity !== 0;
              return {
                ...r,
                available,
                odds: available && total ? Math.round((r.weight * 1000) / total) / 10 : 0,
              };
            }),
          }
        : null,
    };
  }, [doc, id, image, initial.kind, initial.reference]);

  const submitBlocker = dirty
    ? "Save the draft first"
    : !initial.draft_differs
      ? "The draft matches the published campaign"
      : pending
        ? "A change is already awaiting approval"
        : !note.trim()
          ? "Say what changed"
          : null;
  const ownPending = Boolean(pending) && (pending?.requested_by_id === userId || isOwner);
  const isRewards = initial.kind === "rewards";
  const canApprove = initial.can_review && (!isRewards || initial.can_approve_rewards);

  const cta = (key: "primary" | "secondary") => {
    const value = doc.content[key];
    return (
      <div className="rounded-xl border border-line p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-text">
            {key === "primary" ? "Main button" : "Second button"}
          </p>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={Boolean(value)}
              disabled={!editable}
              onChange={(e) =>
                content({
                  [key]: e.target.checked
                    ? {
                        label: key === "primary" ? "Request a demo" : "Learn more",
                        action: key === "primary" ? "demo" : "link",
                        href: key === "primary" ? null : "/",
                      }
                    : null,
                })
              }
              className="size-4 accent-[var(--color-accent)]"
            />
            Show
          </label>
        </div>
        {value && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Label">
              <input
                value={value.label}
                maxLength={40}
                disabled={!editable}
                onChange={(e) => content({ [key]: { ...value, label: e.target.value } })}
                className={inputClass}
              />
            </Field>
            <Choice<CampaignAction>
              label="What it does"
              value={value.action}
              options={ACTION_LABELS}
              disabled={!editable}
              onChange={(action) =>
                content({ [key]: { ...value, action, href: action === "link" ? (value.href ?? "/") : null } })
              }
            />
            {value.action === "link" && (
              <Field label="Link" hint="A page on this website (starting with /) or an https:// address.">
                <input
                  value={value.href ?? ""}
                  disabled={!editable}
                  onChange={(e) => content({ [key]: { ...value, href: e.target.value } })}
                  className={inputClass}
                />
              </Field>
            )}
          </div>
        )}
      </div>
    );
  };

  const updateReward = (i: number, patch: Partial<Reward>) =>
    rewards({ rewards: doc.rewards!.rewards.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Section title="Campaign identity" id={`${uid}-identity`}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs", STATUS_LABELS[initial.status].tone)}>
              {STATUS_LABELS[initial.status].label}
            </span>
            {pending && (
              <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs text-text">
                Awaiting approval
              </span>
            )}
            <span className="text-muted">
              {initial.site_name} · {KIND_LABELS[initial.kind]?.label ?? initial.kind} ·{" "}
              <span className="font-mono">{initial.reference}</span>
              {initial.owner_name && <> · owner {initial.owner_name}</>}
            </span>
          </div>
          <Field label="Name">
            <input
              value={draft.name}
              maxLength={120}
              disabled={!editable}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Objective" hint="Internal: what success looks like.">
            <input
              value={draft.objective}
              maxLength={200}
              disabled={!editable}
              onChange={(e) => setDraft({ ...draft, objective: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Internal description">
            <textarea
              value={draft.description}
              maxLength={1000}
              rows={2}
              disabled={!editable}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className={cn(inputClass, "py-2")}
            />
          </Field>
        </Section>

        <Section title="Banner content" id={`${uid}-content`}>
          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <Field label="Badge (optional)">
              <input
                value={doc.content.badge ?? ""}
                maxLength={40}
                disabled={!editable}
                onChange={(e) => content({ badge: e.target.value || null })}
                className={inputClass}
              />
            </Field>
            <Field label="Headline">
              <input
                value={doc.content.headline}
                maxLength={120}
                disabled={!editable}
                onChange={(e) => content({ headline: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Supporting headline (optional)">
            <input
              value={doc.content.subheadline ?? ""}
              maxLength={160}
              disabled={!editable}
              onChange={(e) => content({ subheadline: e.target.value || null })}
              className={inputClass}
            />
          </Field>
          <Field
            label="Description (optional, Markdown)"
            hint="Links, bold and lists are allowed; scripts and HTML are removed."
          >
            <textarea
              value={doc.content.body ?? ""}
              maxLength={1200}
              rows={3}
              disabled={!editable}
              onChange={(e) => content({ body: e.target.value || null })}
              className={cn(inputClass, "py-2")}
            />
          </Field>
          {initial.kind !== "rewards" && cta("primary")}
          {initial.kind !== "rewards" && cta("secondary")}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Promotional code (optional)"
              hint="Shown with a copy button. Only offer codes that are configured."
            >
              <input
                value={doc.content.promo_code ?? ""}
                maxLength={32}
                disabled={!editable}
                onChange={(e) => content({ promo_code: e.target.value.toUpperCase() || null })}
                className={cn(inputClass, "font-mono")}
              />
            </Field>
            <Field label="Image (optional)" hint="From this website's media library.">
              <select
                value={doc.content.image_id ?? ""}
                disabled={!editable}
                onChange={(e) => content({ image_id: e.target.value || null })}
                className={inputClass}
              >
                <option value="">No image</option>
                {media
                  .filter((m) => !m.archived_at)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={Boolean(doc.content.countdown)}
              disabled={!editable}
              onChange={(e) => content({ countdown: e.target.checked })}
              className="size-5 accent-[var(--color-accent)]"
            />
            Show a live countdown to the end
          </label>
          <Field
            label={
              isRewards
                ? "Terms and conditions (required, Markdown)"
                : "Terms and conditions (optional, Markdown)"
            }
          >
            <textarea
              value={doc.content.terms ?? ""}
              maxLength={4000}
              rows={3}
              disabled={!editable}
              onChange={(e) => content({ terms: e.target.value || null })}
              className={cn(inputClass, "py-2")}
            />
          </Field>
        </Section>

        <Section title="Visual design" id={`${uid}-design`}>
          <p className="text-sm text-muted">
            Colours, logo and type come from {initial.site_name}&apos;s published brand; these choices arrange
            them.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Choice
              label="Template"
              value={doc.design.template}
              options={{ spotlight: "Spotlight", split: "Split with image", minimal: "Minimal" }}
              disabled={!editable}
              onChange={(template) => design({ template })}
            />
            <Choice
              label="Alignment"
              value={doc.design.align}
              options={{ start: "Start", center: "Centre" }}
              disabled={!editable}
              onChange={(align) => design({ align })}
            />
            <Choice
              label="Background"
              value={doc.design.background}
              options={{
                brand: "Brand colour",
                gradient: "Brand gradient",
                soft: "Soft tint",
                surface: "Card",
              }}
              disabled={!editable}
              onChange={(background) => design({ background })}
            />
            <Choice
              label="Corners"
              value={doc.design.radius}
              options={{ rounded: "Rounded", soft: "Soft", square: "Square" }}
              disabled={!editable}
              onChange={(radius) => design({ radius })}
            />
            <Choice
              label="Animation"
              value={doc.design.animation}
              options={{ rise: "Rise in", fade: "Fade in", none: "None" }}
              disabled={!editable}
              onChange={(animation) => design({ animation })}
            />
            <Choice
              label="Buttons"
              value={doc.design.button}
              options={{ solid: "Solid", outline: "Outline" }}
              disabled={!editable}
              onChange={(button) => design({ button })}
            />
            <Choice
              label="Image position"
              value={doc.design.image_position}
              options={{ end: "End", start: "Start", background: "Background" }}
              disabled={!editable}
              onChange={(image_position) => design({ image_position })}
            />
            <Choice
              label="Text size"
              value={doc.design.scale}
              options={{ standard: "Standard", compact: "Compact", large: "Large" }}
              disabled={!editable}
              onChange={(scale) => design({ scale })}
            />
            <label className="flex min-h-11 items-end gap-3 pb-2 text-sm text-text">
              <input
                type="checkbox"
                checked={doc.design.show_logo}
                disabled={!editable}
                onChange={(e) => design({ show_logo: e.target.checked })}
                className="size-5 accent-[var(--color-accent)]"
              />
              Show the logo
            </label>
          </div>
        </Section>

        <Section title="Display settings" id={`${uid}-display`}>
          <fieldset>
            <legend className="text-sm font-medium text-text">Where it appears (up to three)</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(Object.keys(PLACEMENT_LABELS) as CampaignPlacement[]).map((p) => {
                const on = doc.display.placements.includes(p);
                return (
                  <label
                    key={p}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-xl border px-3 text-sm",
                      on ? "border-accent bg-accent-soft/60 text-text" : "border-line text-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!editable || (!on && doc.display.placements.length >= 3)}
                      onChange={(e) => {
                        const placements = e.target.checked
                          ? [...doc.display.placements, p]
                          : doc.display.placements.filter((x) => x !== p);
                        display({ placements });
                        if (e.target.checked) setPlacement(p);
                      }}
                      className="size-4 accent-[var(--color-accent)]"
                    />
                    {PLACEMENT_LABELS[p]}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Choice
              label="Pages"
              value={doc.display.pages}
              options={{
                all: "Every page",
                home: "Home page",
                products: "Products",
                blog: "Blog and insights",
                contact: "Contact",
                custom: "Chosen pages",
              }}
              disabled={!editable}
              onChange={(pages) => display({ pages })}
            />
            <Choice
              label="Devices"
              value={doc.display.devices}
              options={{ all: "All devices", desktop: "Desktop and tablet", mobile: "Phones" }}
              disabled={!editable}
              onChange={(devices) => display({ devices })}
            />
            <Choice
              label="How often"
              value={doc.display.frequency}
              options={{
                always: "Every page view",
                session: "Once per visit",
                daily: "Once a day",
                weekly: "Once a week",
                once: "Only once",
              }}
              disabled={!editable}
              onChange={(frequency) => display({ frequency })}
            />
          </div>
          {doc.display.pages === "custom" && (
            <Field
              label="Page paths"
              hint="One per line, starting with / (each includes the pages below it)."
            >
              <textarea
                value={doc.display.paths.join("\n")}
                rows={3}
                disabled={!editable}
                onChange={(e) =>
                  display({
                    paths: e.target.value
                      .split("\n")
                      .map((p) => p.trim())
                      .filter(Boolean),
                  })
                }
                className={cn(inputClass, "py-2 font-mono")}
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Choice
              label="When it appears"
              value={doc.display.trigger}
              options={{
                immediate: "Straight away",
                delay: "After a delay",
                scroll: "After scrolling",
                exit_intent: "When leaving (desktop)",
              }}
              disabled={!editable}
              onChange={(trigger) =>
                display({ trigger, trigger_value: trigger === "delay" ? 8 : trigger === "scroll" ? 40 : 0 })
              }
            />
            {(doc.display.trigger === "delay" || doc.display.trigger === "scroll") && (
              <Field label={doc.display.trigger === "delay" ? "Seconds" : "Percent of the page"}>
                <input
                  type="number"
                  min={1}
                  max={doc.display.trigger === "delay" ? 120 : 100}
                  value={doc.display.trigger_value}
                  disabled={!editable}
                  onChange={(e) => display({ trigger_value: Number(e.target.value) })}
                  className={inputClass}
                />
              </Field>
            )}
            <label className="flex min-h-11 items-end gap-3 pb-2 text-sm text-text">
              <input
                type="checkbox"
                checked={doc.display.dismissible}
                disabled={!editable}
                onChange={(e) => display({ dismissible: e.target.checked })}
                className="size-5 accent-[var(--color-accent)]"
              />
              Visitors can dismiss it
            </label>
          </div>
          <p className="text-xs text-subtle">
            One campaign per placement (highest priority wins), one dialog per page, never over the cookie
            banner.
          </p>
        </Section>

        <Section title="Schedule" id={`${uid}-schedule`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts (your time zone)" hint="Empty: as soon as it's approved.">
              <input
                type="datetime-local"
                value={toLocalInput(doc.schedule.starts_at)}
                disabled={!editable}
                onChange={(e) => schedule({ starts_at: fromLocalInput(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <Field label="Ends (your time zone)" hint="It disappears from websites automatically.">
              <input
                type="datetime-local"
                value={toLocalInput(doc.schedule.ends_at)}
                disabled={!editable}
                onChange={(e) => schedule({ ends_at: fromLocalInput(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <Field label="Priority" hint="-100 to 100; higher wins when campaigns share a placement.">
              <input
                type="number"
                min={-100}
                max={100}
                value={doc.schedule.priority}
                disabled={!editable}
                onChange={(e) => schedule({ priority: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <Choice
              label="Repeats"
              value={doc.schedule.recurrence}
              options={{ none: "Once", yearly: "Every year on these dates" }}
              disabled={!editable}
              onChange={(recurrence) => schedule({ recurrence })}
            />
          </div>
          <p className="text-xs text-subtle">
            Times are stored as exact moments; the time zone is {doc.schedule.timezone}.
          </p>
        </Section>

        {isRewards && doc.rewards && (
          <Section title="Rewards (spin to win)" id={`${uid}-rewards`}>
            <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-text">
              Rewards are chosen by the API, never by the animation. Entry is free (no payment or purchase).
              Before submitting, record the legal review of promotion, consumer-protection and gambling rules
              for each market; an owner must approve.
            </p>
            <ul className="space-y-3" aria-label="Rewards">
              {doc.rewards.rewards.map((r, i) => {
                const stock = initial.stock.find((s) => s.id === r.id);
                return (
                  <li key={r.id} className="rounded-xl border border-line p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Reward">
                        <input
                          value={r.label}
                          maxLength={40}
                          disabled={!editable}
                          onChange={(e) => updateReward(i, { label: e.target.value })}
                          className={inputClass}
                        />
                      </Field>
                      <Choice
                        label="Type"
                        value={r.kind}
                        options={REWARD_KINDS}
                        disabled={!editable}
                        onChange={(kind) => updateReward(i, { kind })}
                      />
                      <Field
                        label="Quantity"
                        hint={
                          stock ? `${stock.awarded} awarded so far. Empty: unlimited.` : "Empty: unlimited."
                        }
                      >
                        <input
                          type="number"
                          min={0}
                          value={r.quantity ?? ""}
                          disabled={!editable}
                          onChange={(e) =>
                            updateReward(i, {
                              quantity: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Chance (weight)" hint="Relative to the others; visitors see the odds.">
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          value={r.weight}
                          disabled={!editable}
                          onChange={(e) => updateReward(i, { weight: Number(e.target.value) })}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <Field label="How to redeem it">
                      <textarea
                        value={r.instructions}
                        maxLength={400}
                        rows={2}
                        disabled={!editable}
                        onChange={(e) => updateReward(i, { instructions: e.target.value })}
                        className={cn(inputClass, "py-2")}
                      />
                    </Field>
                    {editable && doc.rewards!.rewards.length > 1 && (
                      <button
                        type="button"
                        onClick={() => rewards({ rewards: doc.rewards!.rewards.filter((_, j) => j !== i) })}
                        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-danger"
                      >
                        <Trash2 aria-hidden className="size-4" /> Remove
                        <span className="sr-only"> {r.label}</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {editable && doc.rewards.rewards.length < 12 && (
              <button
                type="button"
                onClick={() =>
                  rewards({
                    rewards: [
                      ...doc.rewards!.rewards,
                      {
                        id: `reward-${crypto.randomUUID().slice(0, 8)}`,
                        label: "New reward",
                        kind: "discount",
                        quantity: 10,
                        weight: 100,
                        instructions: "Replace with how to redeem it.",
                      },
                    ],
                  })
                }
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm text-text hover:border-line-strong"
              >
                <Plus aria-hidden className="size-4" /> Add a reward
              </button>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Attempts per person (email)">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={doc.rewards.max_attempts}
                  disabled={!editable}
                  onChange={(e) => rewards({ max_attempts: Number(e.target.value) })}
                  className={inputClass}
                />
              </Field>
              <Field label="Days to redeem">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={doc.rewards.redeem_days}
                  disabled={!editable}
                  onChange={(e) => rewards({ redeem_days: Number(e.target.value) })}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Who can take part">
              <textarea
                value={doc.rewards.eligibility}
                maxLength={400}
                rows={2}
                disabled={!editable}
                onChange={(e) => rewards({ eligibility: e.target.value })}
                className={cn(inputClass, "py-2")}
              />
            </Field>
            <Field label="Applies to (products or plans, optional)">
              <input
                value={doc.rewards.applicable ?? ""}
                maxLength={200}
                disabled={!editable}
                onChange={(e) => rewards({ applicable: e.target.value || null })}
                className={inputClass}
              />
            </Field>
            <Field label="Restrictions (markets, exclusions; optional)">
              <input
                value={doc.rewards.restrictions ?? ""}
                maxLength={400}
                disabled={!editable}
                onChange={(e) => rewards({ restrictions: e.target.value || null })}
                className={inputClass}
              />
            </Field>
            <Field
              label="Legal review (required to submit)"
              hint="Who reviewed which rules, for which markets, and when."
            >
              <textarea
                value={doc.rewards.legal_review}
                rows={2}
                disabled={!editable}
                onChange={(e) => rewards({ legal_review: e.target.value })}
                className={cn(inputClass, "py-2")}
              />
            </Field>
          </Section>
        )}
      </div>

      <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <section aria-labelledby={`${uid}-preview`} className="fb-panel rounded-[var(--radius-panel)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={`${uid}-preview`} className="font-semibold text-text">
              Live preview
            </h2>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Placement"
                value={placement}
                onChange={(e) => setPlacement(e.target.value as CampaignPlacement)}
                className="min-h-9 rounded-full border border-line bg-surface px-3 text-sm"
              >
                {(doc.display.placements.length
                  ? doc.display.placements
                  : (["home_hero"] as CampaignPlacement[])
                ).map((p) => (
                  <option key={p} value={p}>
                    {PLACEMENT_LABELS[p]}
                  </option>
                ))}
              </select>
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
                      "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm",
                      device === value ? "bg-surface-2 text-text" : "text-muted",
                    )}
                  >
                    <Icon aria-hidden className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <div
                role="group"
                aria-label="Preview theme"
                className="flex gap-1 rounded-full border border-line p-1"
              >
                {(
                  [
                    ["dark", "Dark", Moon],
                    ["light", "Light", Sun],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={theme === value}
                    onClick={() => setTheme(value)}
                    className={cn(
                      "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm",
                      theme === value ? "bg-surface-2 text-text" : "text-muted",
                    )}
                  >
                    <Icon aria-hidden className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div
            data-theme={theme}
            data-product={
              initial.site_slug === "figbud" ||
              !["zirahr", "jasiri", "expense_now", "ziwa"].includes(initial.site_slug)
                ? "figbud"
                : initial.site_slug
            }
            style={
              brand
                ? ({
                    "--product": brand.colors.primary,
                    "--product-2": brand.colors.secondary,
                  } as React.CSSProperties)
                : undefined
            }
            className={cn(
              "mt-4 overflow-hidden rounded-2xl border border-line bg-bg p-4 text-text",
              device === "mobile" && "mx-auto max-w-[24rem]",
            )}
            role="group"
            aria-label="Campaign preview"
          >
            <CampaignPreview
              campaign={preview}
              placement={placement}
              apiOrigin=""
              enquiryUrl="#"
              pathPrefix=""
              brand={brand}
              product={initial.site_slug}
              mediaBase={STUDIO_MEDIA_BASE}
            />
          </div>
          <p className="mt-2 text-xs text-subtle">
            The preview shows the unsaved draft. Spinning is disabled here.
          </p>
        </section>

        <section aria-labelledby={`${uid}-publish`} className="fb-panel rounded-[var(--radius-panel)] p-5">
          <h2 id={`${uid}-publish`} className="font-semibold text-text">
            Publishing
          </h2>
          {editable && (
            <div className="mt-4">
              <ActionButton ready={dirty} busy={busy === "save"} hint="No changes to save" onClick={save}>
                Save draft
              </ActionButton>
            </div>
          )}
          {pending ? (
            <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-4">
              <p className="text-sm font-medium text-text">Version {pending.number} is awaiting approval</p>
              <p className="mt-1 text-sm text-muted">{pending.note}</p>
              <p className="mt-1 text-xs text-subtle">
                Submitted by {pending.requested_by ?? "a former admin"} ·{" "}
                <LocalTime iso={pending.created_at} />
              </p>
              {canApprove && (
                <Field label="Decision note (optional)">
                  <input
                    value={decision}
                    maxLength={300}
                    onChange={(e) => setDecision(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {canApprove && (
                  <>
                    <ActionButton
                      ready={!busy}
                      busy={busy === "approve"}
                      onClick={() =>
                        run(
                          "approve",
                          `campaigns/${id}/revisions/${pending.id}/approve`,
                          { note: decision || null },
                          "Approved and published.",
                        )
                      }
                    >
                      Approve and publish
                    </ActionButton>
                    <ActionButton
                      variant="secondary"
                      ready={!busy}
                      busy={busy === "reject"}
                      onClick={() =>
                        run(
                          "reject",
                          `campaigns/${id}/revisions/${pending.id}/reject`,
                          { note: decision || null },
                          "Change rejected.",
                        )
                      }
                    >
                      Reject
                    </ActionButton>
                  </>
                )}
                {ownPending && (
                  <ActionButton
                    variant="ghost"
                    ready={!busy}
                    busy={busy === "cancel"}
                    onClick={() =>
                      run(
                        "cancel",
                        `campaigns/${id}/revisions/${pending.id}/cancel`,
                        {},
                        "Submission withdrawn.",
                      )
                    }
                  >
                    Withdraw
                  </ActionButton>
                )}
              </div>
              {isRewards && initial.can_review && !initial.can_approve_rewards && (
                <p className="mt-2 text-xs text-subtle">
                  Interactive reward campaigns need an owner&apos;s approval.
                </p>
              )}
            </div>
          ) : (
            editable && (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (submitBlocker === null && !busy)
                    void run("submit", `campaigns/${id}/submit`, { note }, "Sent for approval.", () => {
                      setNote("");
                      router.refresh();
                    });
                }}
              >
                <Field label="What changed?">
                  <textarea
                    value={note}
                    maxLength={300}
                    rows={2}
                    onChange={(e) => setNote(e.target.value)}
                    className={cn(inputClass, "py-2")}
                  />
                </Field>
                <ActionButton
                  type="submit"
                  ready={submitBlocker === null && !busy}
                  busy={busy === "submit"}
                  hint={submitBlocker ?? undefined}
                >
                  Submit for approval
                </ActionButton>
              </form>
            )
          )}
          {initial.can_review && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              {initial.published &&
                !initial.archived_at &&
                (initial.paused_at ? (
                  <ActionButton
                    variant="secondary"
                    ready={!busy}
                    busy={busy === "resume"}
                    onClick={() => run("resume", `campaigns/${id}/resume`, {}, "Campaign resumed.")}
                  >
                    Resume
                  </ActionButton>
                ) : (
                  <ActionButton
                    variant="secondary"
                    ready={!busy}
                    busy={busy === "pause"}
                    onClick={() =>
                      run(
                        "pause",
                        `campaigns/${id}/pause`,
                        {},
                        "Campaign paused: it's off every website now.",
                      )
                    }
                  >
                    Pause
                  </ActionButton>
                ))}
              {initial.archived_at ? (
                <ActionButton
                  variant="secondary"
                  ready={!busy}
                  busy={busy === "restore"}
                  onClick={() =>
                    run("restore", `campaigns/${id}/restore`, {}, "Restored (paused). Resume it when ready.")
                  }
                >
                  Restore
                </ActionButton>
              ) : (
                <ActionButton
                  variant="ghost"
                  ready={!busy}
                  busy={busy === "archive"}
                  onClick={() =>
                    window.confirm(`Archive "${draft.name}"? It's taken off every website.`) &&
                    run("archive", `campaigns/${id}/archive`, {}, "Campaign archived.")
                  }
                >
                  Archive
                </ActionButton>
              )}
            </div>
          )}
          {editable && (
            <div className="mt-3">
              <ActionButton
                variant="ghost"
                ready={!busy && !dirty}
                hint={dirty ? "Save first" : undefined}
                busy={busy === "duplicate"}
                onClick={() =>
                  run("duplicate", `campaigns/${id}/duplicate`, {}, "Copy created.", (r) =>
                    router.push(`/admin/marketing/${(r as { id: string }).id}`),
                  )
                }
              >
                Duplicate
              </ActionButton>
            </div>
          )}
          {message && (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={cn("mt-4 text-sm", message.tone === "error" ? "text-danger" : "text-success")}
            >
              {message.text}
            </p>
          )}
          {!sameValue(draft, baseline) && <p className="mt-2 text-xs text-subtle">Unsaved changes.</p>}
        </section>

        <section aria-labelledby={`${uid}-results`} className="fb-panel rounded-[var(--radius-panel)] p-5">
          <h2 id={`${uid}-results`} className="font-semibold text-text">
            Results
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(
              [
                ["Impressions", initial.stats.impressions],
                ["Clicks", initial.stats.clicks],
                ["Click-through", ctr(initial.stats)],
                ["Conversions", initial.stats.conversions],
                ...(isRewards
                  ? ([
                      ["Reward claims", initial.stats.entries],
                      ["Redeemed", initial.redeemed],
                    ] as const)
                  : []),
                ["Dismissals", initial.stats.dismissals],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line p-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold text-text tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-subtle">
            Recorded events from websites (daily counts, no personal data). Conversions are enquiries sent
            from this campaign and reward claims; nothing here is estimated.
          </p>
          {isRewards && initial.stock.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <caption className="mb-2 text-start text-xs font-medium tracking-wide text-subtle uppercase">
                Reward stock
              </caption>
              <tbody className="divide-y divide-line">
                {initial.stock.map((s) => (
                  <tr key={s.id} className={cn(!s.active && "opacity-60")}>
                    <th scope="row" className="py-2 text-start font-normal text-text">
                      {s.label}
                    </th>
                    <td className="py-2 text-end text-muted tabular-nums">
                      {s.awarded} / {s.quantity ?? "∞"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-labelledby={`${uid}-history`} className="fb-panel rounded-[var(--radius-panel)] p-5">
          <h2 id={`${uid}-history`} className="font-semibold text-text">
            Version history
          </h2>
          {published.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing published yet.</p>
          ) : (
            <ol className="mt-3 divide-y divide-line">
              {published.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>
                    <span className="font-medium text-text">Version {r.number}</span>
                    <span className="text-muted"> · {r.note}</span>
                    <span className="block text-xs text-subtle">
                      Approved by {r.decided_by ?? "a former admin"}
                      {r.decided_at && (
                        <>
                          {" · "}
                          <LocalTime iso={r.decided_at} />
                        </>
                      )}
                    </span>
                  </span>
                  {editable && (
                    <button
                      type="button"
                      disabled={Boolean(busy) || dirty}
                      onClick={() =>
                        run(
                          "restore-version",
                          `campaigns/${id}/revisions/${r.id}/restore`,
                          {},
                          `Version ${r.number} copied into the draft.`,
                        )
                      }
                      className="min-h-11 text-sm text-accent hover:underline disabled:opacity-50"
                    >
                      Restore to draft<span className="sr-only"> version {r.number}</span>
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
