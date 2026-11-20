/**
 * Device experience settings and how a section resolves them (P14-W8). Plain
 * data and functions, usable on the server and in the Studio; the frames
 * themselves are drawn by `device-preview.tsx`.
 */

import type { MediaInfo } from "./blocks";

export type DeviceKind = "desktop" | "tablet" | "phone";
export type DesktopFrame = "browser" | "laptop" | "monitor";
export type TabletFrame = "portrait" | "landscape" | "minimal";
export type PhoneFrame = "portrait" | "landscape" | "minimal";
export interface DeviceFrames {
  desktop: DesktopFrame;
  tablet: TabletFrame;
  phone: PhoneFrame;
}
export type ImageFit = "cover" | "contain";
export type ImageAlign = "top" | "center";
export type DeviceFallback = "next_device" | "hide";

/** A website's device experience (Studio → a website → Device experience). */
export interface DeviceExperience {
  enabled?: boolean;
  devices: DeviceKind[];
  default_device: DeviceKind;
  visitor_switching: boolean;
  transitions: boolean;
  synchronized_previews?: boolean;
  frames: DeviceFrames;
  fit: ImageFit;
  align: ImageAlign;
  fallback: DeviceFallback;
}

export const DEFAULT_DEVICE_EXPERIENCE: DeviceExperience = {
  enabled: true,
  devices: ["desktop", "tablet", "phone"],
  default_device: "phone",
  visitor_switching: false,
  transitions: false,
  synchronized_previews: false,
  frames: { desktop: "browser", tablet: "landscape", phone: "portrait" },
  fit: "cover",
  align: "top",
  fallback: "next_device",
};

export interface DevicePreviewConfig {
  enabled?: boolean;
  devices: DeviceKind[];
  /** Approved screenshots from the media library, one per device. */
  desktop_image_id?: string | null;
  tablet_image_id?: string | null;
  phone_image_id?: string | null;
  default_device?: "visitor" | DeviceKind;
  /** The original two styles (P14-W6); `frames` takes over when set. */
  frame?: "realistic" | "minimal";
  tablet_orientation?: "landscape" | "portrait";
  address?: string | null;
  transitions?: boolean;
  duration_ms?: number;
  /** Use the website's device settings when it has published some (default). */
  inherit?: boolean;
  /** Visitors may switch devices (unset: yes, as before). */
  visitor_switching?: boolean | null;
  /** From the website: the page's previews follow each other's choice. */
  synchronized_previews?: boolean;
  frames?: DeviceFrames | null;
  fit?: ImageFit | null;
  align?: ImageAlign | null;
  fallback?: DeviceFallback | null;
  max_width?: number | null;
  max_height?: number | null;
  /** The screenshots' file details, by device (from the media library). */
  media?: Partial<Record<DeviceKind, MediaInfo>>;
}

/**
 * The settings a section shows with: the website's (when it has published
 * some and the section inherits), else the section's own. The screenshots
 * and address are always the section's.
 */
export function resolveDevicePreview(
  section: DevicePreviewConfig,
  website?: DeviceExperience | null,
): DevicePreviewConfig {
  if (!website || website.enabled === false || section.inherit === false) return section;
  return {
    ...section,
    devices: website.devices,
    default_device: website.default_device,
    visitor_switching: website.visitor_switching,
    transitions: website.transitions,
    synchronized_previews: website.visitor_switching && website.synchronized_previews === true,
    frames: website.frames,
    fit: website.fit,
    align: website.align,
    fallback: website.fallback,
  };
}

/** A section's frames: chosen from the library, or from its original style. */
export function framesOf(config: DevicePreviewConfig): DeviceFrames {
  if (config.frames) return config.frames;
  const real = config.frame !== "minimal";
  return {
    desktop: real ? "laptop" : "browser",
    tablet: real ? (config.tablet_orientation === "portrait" ? "portrait" : "landscape") : "minimal",
    phone: real ? "portrait" : "minimal",
  };
}
