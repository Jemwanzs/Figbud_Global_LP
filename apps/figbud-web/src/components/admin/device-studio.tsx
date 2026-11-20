"use client";

import {
  DEFAULT_DEVICE_EXPERIENCE,
  type DeviceExperience,
  type DeviceKind,
  DevicePreview,
} from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { ALIGN_CHOICES, Choice, FALLBACK_CHOICES, FIT_CHOICES, FRAME_CHOICES } from "./device-preview-fields";
import { LocalTime } from "./local-time";
import { type MediaItem, STUDIO_MEDIA_BASE } from "./page-types";
import type { WebsiteSettingsAdmin } from "./website-settings";

type Tab = "general" | "frames" | "media";
type Message = { tone: "ok" | "error"; text: string } | null;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const LABELS: Record<DeviceKind, string> = { desktop: "Desktop", tablet: "Tablet", phone: "Phone" };
const ORDER: DeviceKind[] = ["desktop", "tablet", "phone"];

/**
 * Whether an image suits a device's screen: its shape and width, as a
 * screenshot taken at that device's size would have (P14-W8). Returns what
 * is wrong, or null.
 */
export function screenshotProblem(
  device: DeviceKind,
  item: Pick<MediaItem, "width" | "height">,
): string | null {
  const { width, height } = item;
  if (!width || !height) return "Its size is unknown.";
  const ratio = width / height;
  if (device === "desktop") {
    if (ratio < 1.2) return "A desktop screenshot is wider than it is tall (about 16:10).";
    if (width < 1024) return "Take it at desktop width (1,024 px or more).";
  } else if (device === "tablet") {
    if (ratio < 0.6 || ratio > 1.6) return "A tablet screenshot is about 4:3 or 3:4.";
    if (width < 600) return "Take it at tablet width (600 px or more).";
  } else {
    if (ratio > 0.75 && ratio < 1.6)
      return "A phone screenshot is tall (portrait) or wide (landscape), not square.";
    if (Math.min(width, height) < 300) return "Take it at phone size (300 px or more across).";
  }
  return null;
}

/**
 * Websites → a website → Device experience (owner's brief, 20 Nov 2026,
 * P14-W8): how the website shows its product in device frames. General
 * settings, the frame library and the screenshots in the media library, with
 * three independent previews. Saved as a draft, published, kept for
 * rollback and audited, all through the website's own settings, so no other
 * website changes. Sections that inherit these settings follow them once
 * published; until then every section keeps its own.
 */
export function DeviceStudio({
  slug,
  name,
  data,
  media,
}: {
  slug: string;
  name: string;
  data: WebsiteSettingsAdmin;
  media: MediaItem[];
}) {
  const router = useRouter();
  const uid = useId();
  const canEdit = data.can_edit;
  const [base, setBase] = useState(data.settings);
  const [version, setVersion] = useState(data.version);
  const [tab, setTab] = useState<Tab>("general");
  const saved = base.devices_draft ?? base.devices ?? DEFAULT_DEVICE_EXPERIENCE;
  const [d, setD] = useState<DeviceExperience>(saved);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const images = media.filter((m) => !m.archived_at && m.content_type.startsWith("image/"));
  // The screenshots the previews use: the first that suits each device, or the one chosen.
  const [samples, setSamples] = useState<Partial<Record<DeviceKind, string>>>(() =>
    Object.fromEntries(
      ORDER.map((k) => [k, images.find((m) => !screenshotProblem(k, m))?.id]).filter(([, id]) => id),
    ),
  );
  useUnsavedChangesWarning(canEdit && !same(d, saved));
  const set = (patch: Partial<DeviceExperience>) => setD({ ...d, ...patch });

  async function save(label: string, patch: Partial<typeof base>, done: string) {
    setBusy(label);
    setMessage(null);
    try {
      const result = await adminFetch<WebsiteSettingsAdmin>(`sites/${slug}/settings`, {
        // The rest of the document goes back unchanged; the API keeps the history.
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

  const toggleDevice = (k: DeviceKind, on: boolean) => {
    const devices = ORDER.filter((x) => (x === k ? on : d.devices.includes(x)));
    if (!devices.length) return;
    set({ devices, default_device: devices.includes(d.default_device) ? d.default_device : devices[0]! });
  };
  const item = (id?: string) => images.find((m) => m.id === id);
  const mediaInfo = (k: DeviceKind) => {
    const m = item(samples[k]);
    return m ? { id: m.id, width: m.width, height: m.height, alt: m.alt_text } : undefined;
  };
  const tabs: [Tab, string][] = [
    ["general", "General settings"],
    ["frames", "Frame library"],
    ["media", "Media library"],
  ];

  return (
    <div className="mt-8 space-y-6" data-device-studio={slug}>
      {!canEdit && (
        <p className="rounded-xl border border-line bg-surface-2 p-4 text-sm text-muted">
          Reviewers and owners change these settings. You can see what the website shows.
        </p>
      )}
      <p className="text-sm text-muted" data-device-status="">
        {base.devices
          ? base.devices.enabled
            ? `Published: sections that inherit show ${LABELS[base.devices.default_device].toLowerCase()} frames${base.devices.visitor_switching ? ", and visitors may switch" : ", with no switching"}.`
            : "Published, but turned off: every section keeps its own settings."
          : "Not published yet: every section keeps its own settings until you publish."}
        {base.devices_draft && " A draft is saved."}
      </p>
      <div role="tablist" aria-label="Device experience settings" className="flex flex-wrap gap-2">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${uid}-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`${uid}-panel`}
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm transition-colors",
              tab === value
                ? "bg-accent font-medium text-accent-ink"
                : "border border-line text-muted hover:border-line-strong hover:text-text",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${tab}`}
        className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
      >
        <div className="fb-panel space-y-4 rounded-[var(--radius-panel)] p-5">
          {tab === "general" && (
            <>
              <label className="flex min-h-11 items-center gap-3 text-sm text-text">
                <input
                  type="checkbox"
                  checked={d.enabled !== false}
                  disabled={!canEdit}
                  onChange={(e) => set({ enabled: e.target.checked })}
                  className="size-5 accent-[var(--color-accent)]"
                />
                Use these settings for sections that inherit them
              </label>
              <fieldset className="rounded-xl border border-line p-3">
                <legend className="px-1 text-xs font-medium text-muted">Devices</legend>
                {ORDER.map((k) => (
                  <label key={k} className="flex min-h-11 items-center gap-3 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={d.devices.includes(k)}
                      disabled={!canEdit || (d.devices.includes(k) && d.devices.length === 1)}
                      onChange={(e) => toggleDevice(k, e.target.checked)}
                      className="size-5 accent-[var(--color-accent)]"
                    />
                    {LABELS[k]}
                  </label>
                ))}
              </fieldset>
              <Choice
                label="Device shown"
                value={d.default_device}
                choices={
                  Object.fromEntries(d.devices.map((k) => [k, LABELS[k]])) as Record<DeviceKind, string>
                }
                disabled={!canEdit}
                onChange={(default_device) => set({ default_device })}
              />
              <label className="flex min-h-11 items-center gap-3 text-sm text-text">
                <input
                  type="checkbox"
                  checked={d.visitor_switching}
                  disabled={!canEdit}
                  onChange={(e) =>
                    set({
                      visitor_switching: e.target.checked,
                      ...(e.target.checked ? {} : { transitions: false, synchronized_previews: false }),
                    })
                  }
                  className="size-5 accent-[var(--color-accent)]"
                />
                Visitors may switch devices
              </label>
              <p className="-mt-2 text-xs text-subtle">
                Off: visitors see the device shown, with no buttons, and the website never switches to the
                visitor&apos;s own device.
              </p>
              {(
                [
                  ["transitions", "Fade between devices"],
                  [
                    "synchronized_previews",
                    "Synchronised previews: on a page, every device preview follows the visitor's choice",
                  ],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex min-h-11 items-center gap-3 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={Boolean(d[key])}
                    disabled={!canEdit || !d.visitor_switching}
                    onChange={(e) => set({ [key]: e.target.checked })}
                    className="size-5 accent-[var(--color-accent)]"
                  />
                  {label}
                </label>
              ))}
              <Choice
                label="Screenshot fit"
                value={d.fit}
                choices={FIT_CHOICES}
                disabled={!canEdit}
                onChange={(fit) => set({ fit })}
              />
              <Choice
                label="Screenshot alignment"
                value={d.align}
                choices={ALIGN_CHOICES}
                disabled={!canEdit}
                onChange={(align) => set({ align })}
              />
              <Choice
                label="When that device has no screenshot"
                value={d.fallback}
                choices={FALLBACK_CHOICES}
                disabled={!canEdit}
                onChange={(fallback) => set({ fallback })}
              />
            </>
          )}

          {tab === "frames" && (
            <>
              <p className="text-sm text-muted">
                The frame each device appears in. Frames scale to the space they have, keep the device&apos;s
                proportions and never widen the page.
              </p>
              {ORDER.map((k) => (
                <Choice
                  key={k}
                  label={`${LABELS[k]} frame`}
                  value={d.frames[k]}
                  choices={FRAME_CHOICES[k] as Record<string, string>}
                  disabled={!canEdit}
                  onChange={(style) =>
                    set({ frames: { ...d.frames, [k]: style } as DeviceExperience["frames"] })
                  }
                />
              ))}
            </>
          )}

          {tab === "media" && (
            <>
              <p className="text-sm text-muted">
                Screenshots come from {name}&apos;s{" "}
                <Link
                  href={`/admin/sites/${slug}/media`}
                  className="font-medium text-accent-strong underline"
                >
                  media library
                </Link>
                , where they are uploaded, checked and given alt text. Each section chooses its own; pick one
                per device here to preview the frames. Only approved screenshots with no real customer data.
              </p>
              {ORDER.map((k) => (
                <fieldset key={k} className="rounded-xl border border-line p-3" data-device-media={k}>
                  <legend className="px-1 text-xs font-medium text-muted">
                    {LABELS[k]} preview screenshot
                  </legend>
                  {images.length === 0 ? (
                    <p className="text-sm text-subtle">No images in the media library yet.</p>
                  ) : (
                    <ul className="grid max-h-72 gap-2 overflow-y-auto">
                      {images.map((m) => {
                        const problem = screenshotProblem(k, m);
                        return (
                          <li key={m.id}>
                            <label
                              className={cn(
                                "flex cursor-pointer items-center gap-3 rounded-lg border p-2 text-sm",
                                samples[k] === m.id ? "border-accent" : "border-line",
                              )}
                            >
                              <input
                                type="radio"
                                name={`${uid}-${k}`}
                                checked={samples[k] === m.id}
                                onChange={() => setSamples({ ...samples, [k]: m.id })}
                                className="size-4 accent-[var(--color-accent)]"
                              />
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`${STUDIO_MEDIA_BASE}${m.id}`}
                                alt=""
                                width={48}
                                height={48}
                                loading="lazy"
                                className="size-12 shrink-0 rounded-md bg-surface-2 object-cover object-top"
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-text">{m.label}</span>
                                <span className="block text-xs text-subtle">
                                  {m.width} × {m.height} px
                                  {m.alt_text ? ` · ${m.alt_text}` : " · no alt text"}
                                </span>
                                {problem && <span className="block text-xs text-warning">{problem}</span>}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </fieldset>
              ))}
            </>
          )}

          {canEdit && (
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <ActionButton
                variant="secondary"
                ready={!same(d, base.devices_draft ?? base.devices)}
                busy={busy === "draft"}
                hint="Nothing new to save"
                onClick={() =>
                  save(
                    "draft",
                    { devices_draft: d },
                    "Draft saved. Visitors still see the published version.",
                  )
                }
              >
                Save draft
              </ActionButton>
              <ActionButton
                ready={!same(d, base.devices)}
                busy={busy === "publish"}
                hint="Matches what's published"
                onClick={() =>
                  save(
                    "publish",
                    { devices: d, devices_draft: null },
                    `Published. ${name} shows this within a few minutes.`,
                  )
                }
              >
                Publish
              </ActionButton>
              {base.devices_draft && (
                <button
                  type="button"
                  onClick={() => {
                    setD(base.devices ?? DEFAULT_DEVICE_EXPERIENCE);
                    void save("discard", { devices_draft: null }, "Draft discarded.");
                  }}
                  className="text-sm text-muted hover:text-text"
                >
                  Discard draft
                </button>
              )}
            </div>
          )}
          {(base.devices_history?.length ?? 0) > 0 && (
            <details className="rounded-xl border border-line p-3 text-sm">
              <summary className="cursor-pointer font-medium text-text">Published versions</summary>
              <ul className="mt-2 space-y-2">
                {base.devices_history!.map((v) => (
                  <li key={v.published_at} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted">
                      <LocalTime iso={v.published_at} />
                      {v.by && ` · ${v.by}`} · {LABELS[v.devices.default_device]}
                      {v.devices.visitor_switching ? ", switching" : ""}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setD(v.devices)}
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

        <section aria-label="Previews" className="min-w-0 space-y-6">
          <div>
            <p className="text-sm font-medium text-text">What visitors see</p>
            <p className="text-xs text-subtle">With these settings and the preview screenshots.</p>
            <div
              className="mt-3 rounded-[var(--radius-panel)] border border-line bg-bg p-5"
              data-device-visitor-preview=""
            >
              <DevicePreview
                key={JSON.stringify(d)}
                config={{
                  devices: ORDER,
                  media: Object.fromEntries(ORDER.map((k) => [k, mediaInfo(k)]).filter(([, m]) => m)),
                  address: slug,
                }}
                website={{ ...d, enabled: true }}
                mediaBase={STUDIO_MEDIA_BASE}
              />
            </div>
          </div>
          {/* Three independent previews: each device in its own frame. */}
          <div className="grid gap-5 md:grid-cols-3" data-device-previews="">
            {ORDER.map((k) => {
              const info = mediaInfo(k);
              return (
                <figure
                  key={k}
                  className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-bg p-4"
                  data-device-sample={k}
                >
                  <figcaption className="mb-3 text-xs font-medium text-muted">
                    {LABELS[k]}
                    {!d.devices.includes(k) && " (off)"}
                  </figcaption>
                  {info ? (
                    <DevicePreview
                      config={{
                        devices: [k],
                        default_device: k,
                        inherit: false,
                        visitor_switching: false,
                        frames: d.frames,
                        fit: d.fit,
                        align: d.align,
                        media: { [k]: info },
                        address: slug,
                      }}
                      mediaBase={STUDIO_MEDIA_BASE}
                    />
                  ) : (
                    <p className="text-sm text-subtle">
                      Choose a {LABELS[k].toLowerCase()} screenshot in Media library.
                    </p>
                  )}
                </figure>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
