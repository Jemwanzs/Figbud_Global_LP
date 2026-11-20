"use client";

import {
  type DeviceExperience,
  type DeviceKind,
  type DevicePreviewConfig,
  DEFAULT_DEVICE_EXPERIENCE,
  framesOf,
} from "@figbud/site-kit";
import { createContext, useContext, useId } from "react";

import { MediaPicker } from "./media-picker";
import type { MediaItem } from "./page-types";

const input = "mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text";

const DEVICES: [DeviceKind, string, string][] = [
  ["desktop", "Desktop", "A screenshot taken at desktop width (about 1440 px wide, 16:10)."],
  [
    "tablet",
    "Tablet",
    "A screenshot taken at tablet width (about 1024 × 768 landscape, or 768 × 1024 portrait).",
  ],
  ["phone", "Phone browser", "A screenshot taken at phone width (about 390 px wide, portrait)."],
];

export const FRAME_CHOICES = {
  desktop: { browser: "Browser window", laptop: "Laptop", monitor: "Desktop monitor" },
  tablet: { landscape: "Tablet, landscape", portrait: "Tablet, portrait", minimal: "Minimal tablet" },
  phone: { portrait: "Phone, portrait", landscape: "Phone, landscape", minimal: "Minimal phone" },
} as const;
export const FIT_CHOICES = {
  cover: "Fill the screen (top kept)",
  contain: "Show the whole screenshot",
} as const;
export const ALIGN_CHOICES = { top: "Top", center: "Centre" } as const;
export const FALLBACK_CHOICES = {
  next_device: "Show the next device with a screenshot",
  hide: "Show nothing",
} as const;

/** The website's published device settings, for sections that inherit them (P14-W8). */
export const WebsiteDevicesContext = createContext<DeviceExperience | null>(null);

/** A labelled select over a record of choices. */
export function Choice<T extends string>({
  label,
  value,
  choices,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  choices: Record<T, string>;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="block text-sm font-medium text-text">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={input}
      >
        {(Object.entries(choices) as [T, string][]).map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A size limit in pixels (240 to 1,400), or none. */
function Limit({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block text-sm font-medium text-text">
      {label}
      <input
        id={id}
        type="number"
        min={240}
        max={1400}
        step={10}
        value={value ?? ""}
        placeholder="No limit"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value ? Math.round(Number(e.target.value)) : null)}
        className={input}
      />
    </label>
  );
}

/**
 * A section's device preview (owner's briefs, 19 and 20 Nov 2026, P14-W6 and
 * P14-W8): a screenshot for each device (taken at that device's size, never
 * a desktop image scaled down) and the browser address, always the
 * section's own; then either the website's device settings (inherit, the
 * default) or this section's own: the devices, the one shown, whether
 * visitors may switch, frames, fit, alignment, fallback and size limits.
 */
export function DevicePreviewFields({
  value,
  library,
  address,
  disabled,
  onChange,
  required = false,
}: {
  value: DevicePreviewConfig | null | undefined;
  library: MediaItem[];
  /** The website's name, for the browser bar by default. */
  address: string;
  /** A device showcase section: always on (no switch). */
  required?: boolean;
  disabled: boolean;
  onChange: (value: DevicePreviewConfig | null) => void;
}) {
  const uid = useId();
  const website = useContext(WebsiteDevicesContext);
  const on = Boolean(value);
  // A new preview starts from the approved settings (Phone, no switching, no fades).
  const v: DevicePreviewConfig = value ?? {
    devices: ["desktop", "tablet", "phone"],
    default_device: "phone",
    inherit: true,
    visitor_switching: false,
    transitions: false,
    duration_ms: 380,
    frames: DEFAULT_DEVICE_EXPERIENCE.frames,
  };
  const set = (patch: Partial<DevicePreviewConfig> & Record<string, unknown>) =>
    onChange({ ...v, ...patch } as DevicePreviewConfig);
  const image = (d: DeviceKind) =>
    (v as unknown as Record<string, string | null | undefined>)[`${d}_image_id`] ?? null;
  const inherits = v.inherit !== false;
  // Inheriting only takes effect once the website has published device settings.
  const own = !inherits || !website;
  const devices = inherits && website ? website.devices : v.devices;
  const switching = v.visitor_switching !== false;
  const frames = framesOf(v);
  return (
    <fieldset className="rounded-xl border border-line p-3" data-device-settings="">
      <legend className="px-1 text-xs font-medium text-muted">Device preview</legend>
      {!required && (
        <label className="flex min-h-11 items-center gap-3 text-sm text-text">
          <input
            type="checkbox"
            checked={on}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? { ...v, address: v.address ?? address } : null)}
            className="size-5 accent-[var(--color-accent)]"
          />
          Turn the device labels into a preview on desktop, tablet and phone
        </label>
      )}
      {on && (
        <div className="mt-2 grid gap-4">
          <div role="radiogroup" aria-label="Device settings" className="grid gap-1.5" data-device-inherit="">
            {(
              [
                [true, "Inherit website settings"],
                [false, "Override for this section"],
              ] as const
            ).map(([choice, label]) => (
              <label key={label} className="flex min-h-11 items-center gap-3 text-sm text-text">
                <input
                  type="radio"
                  name={`${uid}-inherit`}
                  checked={inherits === choice}
                  disabled={disabled}
                  onChange={() => set({ inherit: choice })}
                  className="size-5 accent-[var(--color-accent)]"
                />
                {label}
              </label>
            ))}
            <p className="text-xs text-subtle">
              {inherits
                ? website
                  ? "This section follows the website's published device settings (Websites → this website → Device experience). Its screenshots stay its own."
                  : "This website hasn't published device settings yet, so the settings below apply until it does."
                : "This section keeps the settings below, whatever the website's."}
            </p>
          </div>
          {DEVICES.map(([d, label, hint]) => {
            const shown = devices.includes(d);
            return (
              <div key={d} className="grid gap-2 rounded-xl bg-surface-2/60 p-3">
                {own ? (
                  <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-text">
                    <input
                      type="checkbox"
                      checked={shown}
                      disabled={disabled || (shown && v.devices.length === 1)}
                      onChange={(e) =>
                        set({
                          devices: e.target.checked
                            ? DEVICES.map(([x]) => x).filter((x) => x === d || v.devices.includes(x))
                            : v.devices.filter((x) => x !== d),
                        })
                      }
                      className="size-5 accent-[var(--color-accent)]"
                    />
                    {label}
                  </label>
                ) : (
                  <p className="text-sm font-medium text-text">
                    {label}
                    {!shown && <span className="ms-2 font-normal text-muted">(off for this website)</span>}
                  </p>
                )}
                {(shown || !own) && (
                  <MediaPicker
                    label={`${label} screenshot`}
                    hint={hint}
                    value={image(d)}
                    media={library}
                    disabled={disabled}
                    onChange={(id) => set({ [`${d}_image_id`]: id })}
                  />
                )}
              </div>
            );
          })}
          <div className="grid gap-3 sm:grid-cols-2">
            {own && (
              <>
                <div className="block text-sm font-medium text-text">
                  <label htmlFor={`${uid}-default`}>Device shown</label>
                  <select
                    id={`${uid}-default`}
                    value={v.default_device ?? "visitor"}
                    disabled={disabled}
                    onChange={(e) =>
                      set({ default_device: e.target.value as DevicePreviewConfig["default_device"] })
                    }
                    className={input}
                  >
                    {switching && <option value="visitor">The visitor&apos;s own device</option>}
                    {DEVICES.filter(([d]) => v.devices.includes(d)).map(([d, label]) => (
                      <option key={d} value={d}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <Choice
                  label="If that device has no screenshot"
                  value={v.fallback ?? "next_device"}
                  choices={FALLBACK_CHOICES}
                  disabled={disabled}
                  onChange={(fallback) => set({ fallback })}
                />
                {DEVICES.filter(([d]) => v.devices.includes(d)).map(([d, label]) => (
                  <Choice
                    key={d}
                    label={`${label} frame`}
                    value={frames[d]}
                    choices={FRAME_CHOICES[d] as Record<string, string>}
                    disabled={disabled}
                    onChange={(style) => set({ frames: { ...frames, [d]: style } })}
                  />
                ))}
                <Choice
                  label="Screenshot fit"
                  value={v.fit ?? "cover"}
                  choices={FIT_CHOICES}
                  disabled={disabled}
                  onChange={(fit) => set({ fit })}
                />
                <Choice
                  label="Screenshot alignment"
                  value={v.align ?? "top"}
                  choices={ALIGN_CHOICES}
                  disabled={disabled}
                  onChange={(align) => set({ align })}
                />
              </>
            )}
            <label className="block text-sm font-medium text-text">
              Browser address
              <input
                value={v.address ?? ""}
                maxLength={60}
                disabled={disabled}
                placeholder={address}
                onChange={(e) => set({ address: e.target.value || null })}
                className={input}
              />
            </label>
            <Limit
              label="Largest width (px)"
              value={v.max_width}
              disabled={disabled}
              onChange={(max_width) => set({ max_width })}
            />
            <Limit
              label="Largest height (px)"
              value={v.max_height}
              disabled={disabled}
              onChange={(max_height) => set({ max_height })}
            />
            {own && (
              <label className="flex min-h-11 items-center gap-3 text-sm text-text sm:col-span-2">
                <input
                  type="checkbox"
                  checked={switching}
                  disabled={disabled}
                  onChange={(e) =>
                    set({
                      visitor_switching: e.target.checked,
                      // Without switching a device must be chosen; the visitor's own isn't followed.
                      ...(!e.target.checked && (!v.default_device || v.default_device === "visitor")
                        ? { default_device: v.devices.includes("phone") ? "phone" : v.devices[0] }
                        : {}),
                    })
                  }
                  className="size-5 accent-[var(--color-accent)]"
                />
                Visitors may switch devices (device buttons)
              </label>
            )}
            {own && switching && (
              <label className="flex min-h-11 items-center gap-3 text-sm text-text">
                <input
                  type="checkbox"
                  checked={v.transitions !== false}
                  disabled={disabled}
                  onChange={(e) => set({ transitions: e.target.checked })}
                  className="size-5 accent-[var(--color-accent)]"
                />
                Fade between devices
              </label>
            )}
            {own && switching && v.transitions !== false && (
              <label className="block text-sm font-medium text-text">
                Fade takes (seconds)
                <input
                  type="number"
                  min={0.3}
                  max={0.45}
                  step={0.01}
                  value={(v.duration_ms ?? 380) / 1000}
                  disabled={disabled}
                  onChange={(e) => set({ duration_ms: Math.round(Number(e.target.value) * 1000) })}
                  className={input}
                />
              </label>
            )}
          </div>
          <p className="text-xs text-subtle">
            Only approved screenshots from this website&apos;s media library, with no real customer data. A
            live page inside the frames isn&apos;t offered: the websites refuse to be framed, which protects
            visitors from clickjacking. Frames scale to the space they have and never widen the page.
          </p>
        </div>
      )}
    </fieldset>
  );
}
