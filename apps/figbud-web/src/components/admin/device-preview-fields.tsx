"use client";

import type { DeviceKind, DevicePreviewConfig } from "@figbud/site-kit";
import { useId } from "react";

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

/**
 * The self-service device preview (owner's brief, 19 Nov 2026, P14-W6): which
 * devices, a screenshot for each (taken at that device's size, never a
 * desktop image scaled down), the device shown first, frame style, tablet
 * orientation, browser address and transitions.
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
  const on = Boolean(value);
  const v: DevicePreviewConfig = value ?? {
    devices: ["desktop", "tablet", "phone"],
    default_device: "visitor",
    frame: "realistic",
    tablet_orientation: "landscape",
    transitions: true,
    duration_ms: 380,
  };
  const set = (patch: Partial<DevicePreviewConfig> & Record<string, unknown>) =>
    onChange({ ...v, ...patch } as DevicePreviewConfig);
  const image = (d: DeviceKind) =>
    (v as unknown as Record<string, string | null | undefined>)[`${d}_image_id`] ?? null;
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
          {DEVICES.map(([d, label, hint]) => {
            const shown = v.devices.includes(d);
            return (
              <div key={d} className="grid gap-2 rounded-xl bg-surface-2/60 p-3">
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
                {shown && (
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
            <label htmlFor={`${uid}-default`} className="block text-sm font-medium text-text">
              Shown first
              <select
                id={`${uid}-default`}
                value={v.default_device ?? "visitor"}
                disabled={disabled}
                onChange={(e) =>
                  set({ default_device: e.target.value as DevicePreviewConfig["default_device"] })
                }
                className={input}
              >
                <option value="visitor">The visitor&apos;s own device</option>
                {DEVICES.filter(([d]) => v.devices.includes(d)).map(([d, label]) => (
                  <option key={d} value={d}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${uid}-frame`} className="block text-sm font-medium text-text">
              Frames
              <select
                id={`${uid}-frame`}
                value={v.frame ?? "realistic"}
                disabled={disabled}
                onChange={(e) => set({ frame: e.target.value as DevicePreviewConfig["frame"] })}
                className={input}
              >
                <option value="realistic">Realistic laptop, tablet and phone</option>
                <option value="minimal">Minimal outlines</option>
              </select>
            </label>
            {v.devices.includes("tablet") && (
              <label htmlFor={`${uid}-orientation`} className="block text-sm font-medium text-text">
                Tablet
                <select
                  id={`${uid}-orientation`}
                  value={v.tablet_orientation ?? "landscape"}
                  disabled={disabled}
                  onChange={(e) =>
                    set({ tablet_orientation: e.target.value as DevicePreviewConfig["tablet_orientation"] })
                  }
                  className={input}
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </label>
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
            {v.transitions !== false && (
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
            visitors from clickjacking. Visitors who prefer less motion see the change without fading.
          </p>
        </div>
      )}
    </fieldset>
  );
}
