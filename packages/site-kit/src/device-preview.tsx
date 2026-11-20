"use client";

import { cn } from "@figbud/ui";
import { Lock, Monitor, Smartphone, Tablet } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import type { MediaInfo } from "./blocks";

/**
 * The website on desktop, tablet and phone (owner's briefs, 19 and 20 Nov
 * 2026, P14-W6 and P14-W8). Each device shows an approved screenshot taken
 * at that device's size, in a frame from the library (desktop: browser,
 * laptop or monitor; tablet: portrait, landscape or minimal; phone:
 * portrait, landscape or minimal), fitted and aligned as configured.
 *
 * - With visitor switching on, the device labels are buttons (one selected),
 *   the visitor's own device first unless one is chosen, with an optional
 *   short fade.
 * - With it off (the approved setting), only the configured device shows:
 *   no buttons, no handlers, no following the visitor's device, no fade.
 *
 * A website's published device settings apply to every section that
 * inherits them (`resolveDevicePreview`); the screenshots are always the
 * section's own. Frames scale to their space and never widen the page.
 */

import {
  type DeviceExperience,
  type DeviceFrames,
  type DeviceKind,
  type DevicePreviewConfig,
  type ImageAlign,
  type ImageFit,
  framesOf,
  resolveDevicePreview,
} from "./device-experience";

export type { DeviceExperience, DeviceKind, DevicePreviewConfig } from "./device-experience";

export interface DeviceWords {
  label: string;
  desktop: string;
  tablet: string;
  phone: string;
}

export const DEVICE_WORDS: DeviceWords = {
  label: "Works in the browser on",
  desktop: "Desktop",
  tablet: "Tablet",
  phone: "Phone browser",
};

const ICONS = { desktop: Monitor, tablet: Tablet, phone: Smartphone } as const;

/** Sent when a visitor picks a device, for synchronised previews on the same page. */
const SYNC_EVENT = "figbud:device";

/** The visitor's device by screen width (a phone below 640 px, a tablet below 1024 px). */
function visitorDevice(): DeviceKind {
  if (window.matchMedia("(max-width: 639px)").matches) return "phone";
  if (window.matchMedia("(max-width: 1023px)").matches) return "tablet";
  return "desktop";
}

function BrowserBar({ address, compact }: { address: string; compact?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex items-center gap-2 border-b border-black/10 bg-[#f1efec] text-[#4b4744]",
        compact ? "px-2 py-1" : "px-3 py-1.5",
      )}
    >
      {!compact && (
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-[#e0605a]" />
          <span className="size-2 rounded-full bg-[#e8b04a]" />
          <span className="size-2 rounded-full bg-[#5fb85f]" />
        </span>
      )}
      <span
        className={cn(
          "mx-auto flex min-w-0 items-center justify-center gap-1 truncate rounded-full bg-white/90",
          compact ? "w-[85%] px-2 py-0.5 text-[0.55rem]" : "w-1/2 px-3 py-0.5 text-[0.65rem]",
        )}
      >
        <Lock className="size-2.5 shrink-0" />
        <span className="truncate">{address}</span>
      </span>
    </div>
  );
}

function Screen({
  media,
  alt,
  eager,
  mediaBase,
  fit,
  align,
}: {
  media?: MediaInfo;
  alt: string;
  eager: boolean;
  mediaBase: string;
  fit: ImageFit;
  align: ImageAlign;
}) {
  if (!media) return <div className="size-full bg-[#f6f2ec]" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${mediaBase}${media.id}`}
      alt={alt || media.alt}
      width={media.width}
      height={media.height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn(
        "block size-full bg-[#f6f2ec]",
        fit === "contain" ? "object-contain" : "object-cover",
        align === "center" ? "object-center" : "object-top",
      )}
    />
  );
}

const SHELL = "shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]";

/** One device's frame from the library, sized by its width; the screen keeps the device's proportions. */
function Frame({
  device,
  frames,
  address,
  children,
}: {
  device: DeviceKind;
  frames: DeviceFrames;
  address: string;
  children: ReactNode;
}) {
  if (device === "desktop") {
    const style = frames.desktop;
    return (
      <div className="mx-auto w-full max-w-[44rem]" data-device-frame="desktop" data-frame-style={style}>
        {style === "browser" ? (
          <div className={cn("overflow-hidden rounded-xl border border-black/15 bg-white", SHELL)}>
            <BrowserBar address={address} />
            <div className="aspect-[16/10]">{children}</div>
          </div>
        ) : (
          <>
            <div
              className={cn(
                "overflow-hidden bg-[#1b1a19]",
                SHELL,
                style === "monitor" ? "rounded-[0.9rem] p-[1.4%]" : "rounded-t-[1rem] p-[1.6%] pb-[2%]",
              )}
            >
              {style === "laptop" && (
                <span aria-hidden className="mx-auto mb-[1%] block size-1.5 rounded-full bg-white/25" />
              )}
              <div className="overflow-hidden rounded-[0.35rem] bg-white">
                <BrowserBar address={address} />
                <div className="aspect-[16/10]">{children}</div>
              </div>
            </div>
            {style === "laptop" ? (
              <div
                aria-hidden
                className="relative mx-auto h-3 w-[112%] -translate-x-[5.4%] rounded-b-[1rem] bg-gradient-to-b from-[#3a3836] to-[#1f1e1d] rtl:translate-x-[5.4%]"
              >
                <span className="absolute start-1/2 top-0 h-1 w-[16%] -translate-x-1/2 rounded-b-md bg-[#141312] rtl:translate-x-1/2" />
              </div>
            ) : (
              // The monitor's stand.
              <div aria-hidden className="flex flex-col items-center">
                <span className="h-6 w-[12%] bg-gradient-to-b from-[#2a2826] to-[#1b1a19]" />
                <span className="h-2 w-[28%] rounded-full bg-[#1b1a19]" />
              </div>
            )}
          </>
        )}
      </div>
    );
  }
  if (device === "tablet") {
    const style = frames.tablet;
    const portrait = style === "portrait";
    const minimal = style === "minimal";
    return (
      <div
        className={cn("mx-auto w-full", portrait ? "max-w-[22rem]" : "max-w-[36rem]")}
        data-device-frame="tablet"
        data-frame-style={style}
      >
        <div
          className={cn(
            "relative overflow-hidden",
            SHELL,
            minimal ? "rounded-xl border border-black/15 bg-white" : "rounded-[1.6rem] bg-[#1b1a19] p-[3.2%]",
          )}
        >
          {!minimal && (
            <span
              aria-hidden
              className={cn(
                "absolute size-1.5 rounded-full bg-white/25",
                portrait ? "start-1/2 top-[1.3%] -translate-x-1/2" : "start-[1.3%] top-1/2 -translate-y-1/2",
              )}
            />
          )}
          <div className={cn("overflow-hidden bg-white", !minimal && "rounded-[0.7rem]")}>
            <BrowserBar address={address} compact />
            <div className={portrait ? "aspect-[3/4]" : "aspect-[4/3]"}>{children}</div>
          </div>
        </div>
      </div>
    );
  }
  const style = frames.phone;
  const landscape = style === "landscape";
  const minimal = style === "minimal";
  return (
    <div
      className={cn("mx-auto w-full", landscape ? "max-w-[30rem]" : "max-w-[16rem]")}
      data-device-frame="phone"
      data-frame-style={style}
    >
      <div
        className={cn(
          "relative overflow-hidden",
          SHELL,
          minimal
            ? "rounded-[1.6rem] border border-black/15 bg-white"
            : "rounded-[2.4rem] bg-[#1b1a19] p-[4.5%]",
          landscape && !minimal && "p-[2.4%]",
        )}
      >
        <div className={cn("relative overflow-hidden bg-white", !minimal && "rounded-[1.9rem]")}>
          {/* The camera cut-out. */}
          {!minimal && (
            <span
              aria-hidden
              className={cn(
                "absolute z-10 rounded-full bg-[#1b1a19]",
                landscape
                  ? "start-[1.6%] top-1/2 h-[30%] w-[3.2%] -translate-y-1/2"
                  : "start-1/2 top-[1.6%] h-[3.2%] w-[30%] -translate-x-1/2 rtl:translate-x-1/2",
              )}
            />
          )}
          <div className={landscape ? "aspect-[17.5/9]" : cn("aspect-[9/17.5]", !minimal && "pt-[9%]")}>
            {children}
          </div>
          <BrowserBar address={address} compact />
        </div>
      </div>
    </div>
  );
}

/** The device to show from the configured one: it, else the next with a screenshot (or none). */
function shownDevice(config: DevicePreviewConfig, devices: DeviceKind[]): DeviceKind | null {
  const wanted = config.default_device && config.default_device !== "visitor" ? config.default_device : null;
  if (wanted && devices.includes(wanted)) return wanted;
  if (wanted && config.fallback === "hide") return null;
  return devices[0] ?? null;
}

export function DevicePreview({
  config: section,
  website,
  words = DEVICE_WORDS,
  alt,
  mediaBase = "/media/",
}: {
  config: DevicePreviewConfig;
  /** The website's published device settings, for sections that inherit them. */
  website?: DeviceExperience | null;
  words?: DeviceWords;
  /** What the screenshots show, for screen readers (the library's alt text otherwise). */
  alt?: string;
  mediaBase?: string;
}) {
  const config = resolveDevicePreview(section, website);
  const devices = config.devices.filter((d) => config.media?.[d]);
  const switching = config.visitor_switching !== false;
  const chosen = config.default_device && config.default_device !== "visitor" ? config.default_device : null;
  const fixed = shownDevice(config, devices);
  // The server and first paint show the chosen device (desktop by default); then the visitor's own.
  const first = chosen && devices.includes(chosen) ? chosen : (devices[0] ?? null);
  const [picked, setDevice] = useState<DeviceKind | null>(switching ? first : fixed);
  // Worked out on every render, so a preview whose screenshots change (the Studio's) always
  // shows a device it has: without switching, the configured one; with it, the visitor's pick.
  const device = !switching ? fixed : picked && devices.includes(picked) ? picked : first;
  const [seen, setSeen] = useState<Set<DeviceKind>>(() => new Set(picked ? [picked] : []));
  useEffect(() => {
    // Only when visitors may switch, and only on arrival: afterwards their choice stands.
    if (!switching || chosen) return;
    const own = visitorDevice();
    if (devices.includes(own)) {
      setDevice(own);
      setSeen((s) => new Set(s).add(own));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sync = switching && config.synchronized_previews === true;
  useEffect(() => {
    if (!sync) return;
    const follow = (e: Event) => {
      const d = (e as CustomEvent<DeviceKind>).detail;
      if (!devices.includes(d)) return;
      setDevice(d);
      setSeen((s) => new Set(s).add(d));
    };
    window.addEventListener(SYNC_EVENT, follow);
    return () => window.removeEventListener(SYNC_EVENT, follow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync]);
  if (!devices.length || config.enabled === false || !device) return null;
  const frames = framesOf(config);
  const fit = config.fit ?? "cover";
  const align = config.align ?? "top";
  const address = config.address || "";
  const duration = !switching || config.transitions === false ? 0 : (config.duration_ms ?? 380);
  const limits: CSSProperties = {
    ...(config.max_width ? { maxWidth: `${config.max_width}px` } : {}),
    ...(config.max_height ? { maxHeight: `${config.max_height}px` } : {}),
  };
  const choose = (d: DeviceKind) => {
    if (d === device) return;
    setDevice(d);
    setSeen((s) => new Set(s).add(d));
    // Synchronised previews: the page's other previews follow.
    if (sync) window.dispatchEvent(new CustomEvent<DeviceKind>(SYNC_EVENT, { detail: d }));
  };
  const frame = (d: DeviceKind) => (
    <Frame device={d} frames={frames} address={address}>
      <Screen
        media={config.media?.[d]}
        alt={alt ?? ""}
        eager={d === device}
        mediaBase={mediaBase}
        fit={fit}
        align={align}
      />
    </Frame>
  );

  // Switching off: the configured device alone, no controls, no motion (P14-W8).
  if (!switching)
    return (
      <div
        data-device-preview=""
        data-device={device}
        data-switching="off"
        className="mx-auto w-full min-w-0 @3xl:col-span-3"
        style={limits}
      >
        {frame(device)}
      </div>
    );

  return (
    <div data-device-preview="" data-device={device} className="min-w-0 @3xl:col-span-3">
      <div role="group" aria-label={words.label} className="flex flex-wrap gap-2">
        {devices.map((d) => {
          const Icon = ICONS[d];
          const on = d === device;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => choose(d)}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors",
                on
                  ? "border-product bg-product font-medium text-product-ink"
                  : "border-line text-muted hover:border-line-strong hover:text-text",
              )}
            >
              <Icon aria-hidden className={cn("size-4", on ? "text-current" : "text-product-text")} />
              {words[d]}
            </button>
          );
        })}
      </div>
      {/* A stage that keeps its height while devices change (no layout shift). */}
      <div
        className="relative mx-auto mt-5 grid min-h-[min(34rem,95vw)] place-items-center overflow-hidden"
        style={{ "--device-duration": `${duration}ms`, ...limits } as CSSProperties}
      >
        {devices.map((d) => (
          <div
            key={d}
            aria-hidden={d !== device}
            inert={d !== device}
            className={cn(
              "col-start-1 row-start-1 w-full px-1 transition-[opacity,transform] ease-out motion-reduce:transition-none",
              d === device ? "opacity-100" : "pointer-events-none scale-[0.97] opacity-0",
            )}
            style={{ transitionDuration: "var(--device-duration)" }}
          >
            {/* Each screenshot loads once its device is first shown. */}
            {(seen.has(d) || d === device) && frame(d)}
          </div>
        ))}
      </div>
    </div>
  );
}
