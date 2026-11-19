"use client";

import { cn } from "@figbud/ui";
import { Lock, Monitor, Smartphone, Tablet } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import type { MediaInfo } from "./blocks";

/**
 * The website on desktop, tablet and phone (owner's brief, 19 Nov 2026,
 * P14-W6). The self-service highlight's device labels become buttons, one
 * selected at a time, each showing an approved screenshot taken at that
 * device's size in a realistic frame: a laptop with a browser bar, a tablet
 * (landscape or portrait), a phone with its camera cut-out and browser bar.
 * The visitor's own device is selected first (unless the Studio chose one);
 * any can be explored without reloading. Frames scale to the space they're
 * given and never widen the page. Only the shown screenshot loads first.
 */

export type DeviceKind = "desktop" | "tablet" | "phone";

export interface DevicePreviewConfig {
  enabled?: boolean;
  devices: DeviceKind[];
  /** Approved screenshots from the media library, one per device. */
  desktop_image_id?: string | null;
  tablet_image_id?: string | null;
  phone_image_id?: string | null;
  default_device?: "visitor" | DeviceKind;
  frame?: "realistic" | "minimal";
  tablet_orientation?: "landscape" | "portrait";
  address?: string | null;
  transitions?: boolean;
  duration_ms?: number;
  /** The screenshots' file details, by device (from the media library). */
  media?: Partial<Record<DeviceKind, MediaInfo>>;
}

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
}: {
  media?: MediaInfo;
  alt: string;
  eager: boolean;
  mediaBase: string;
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
      className="block size-full bg-[#f6f2ec] object-cover object-top"
    />
  );
}

/** One device's frame, sized by its width; the screen keeps the device's proportions. */
function Frame({
  device,
  config,
  children,
}: {
  device: DeviceKind;
  config: DevicePreviewConfig;
  children: ReactNode;
}) {
  const real = config.frame !== "minimal";
  const address = config.address || "";
  if (device === "desktop")
    return (
      <div className="mx-auto w-full max-w-[44rem]" data-device-frame="desktop">
        <div
          className={cn(
            "overflow-hidden bg-[#1b1a19] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]",
            real ? "rounded-t-[1rem] p-[1.6%] pb-[2%]" : "rounded-xl border border-line p-0",
          )}
        >
          {real && <span aria-hidden className="mx-auto mb-[1%] block size-1.5 rounded-full bg-white/25" />}
          <div className="overflow-hidden rounded-[0.35rem] bg-white">
            <BrowserBar address={address} />
            <div className="aspect-[16/10]">{children}</div>
          </div>
        </div>
        {real && (
          <div
            aria-hidden
            className="relative mx-auto h-3 w-[112%] -translate-x-[5.4%] rounded-b-[1rem] bg-gradient-to-b from-[#3a3836] to-[#1f1e1d] rtl:translate-x-[5.4%]"
          >
            <span className="absolute start-1/2 top-0 h-1 w-[16%] -translate-x-1/2 rounded-b-md bg-[#141312] rtl:translate-x-1/2" />
          </div>
        )}
      </div>
    );
  if (device === "tablet") {
    const portrait = config.tablet_orientation === "portrait";
    return (
      <div
        className={cn("mx-auto w-full", portrait ? "max-w-[22rem]" : "max-w-[36rem]")}
        data-device-frame="tablet"
      >
        <div
          className={cn(
            "relative overflow-hidden bg-[#1b1a19] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]",
            real ? "rounded-[1.6rem] p-[3.2%]" : "rounded-xl border border-line",
          )}
        >
          {real && (
            <span
              aria-hidden
              className={cn(
                "absolute size-1.5 rounded-full bg-white/25",
                portrait ? "start-1/2 top-[1.3%] -translate-x-1/2" : "start-[1.3%] top-1/2 -translate-y-1/2",
              )}
            />
          )}
          <div className="overflow-hidden rounded-[0.7rem] bg-white">
            <BrowserBar address={address} compact />
            <div className={portrait ? "aspect-[3/4]" : "aspect-[4/3]"}>{children}</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-[16rem]" data-device-frame="phone">
      <div
        className={cn(
          "relative overflow-hidden bg-[#1b1a19] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]",
          real ? "rounded-[2.4rem] p-[4.5%]" : "rounded-[1.6rem] border border-line",
        )}
      >
        <div className="relative overflow-hidden rounded-[1.9rem] bg-white">
          {/* The camera cut-out. */}
          {real && (
            <span
              aria-hidden
              className="absolute start-1/2 top-[1.6%] z-10 h-[3.2%] w-[30%] -translate-x-1/2 rounded-full bg-[#1b1a19] rtl:translate-x-1/2"
            />
          )}
          <div className="aspect-[9/17.5] pt-[9%]">{children}</div>
          <BrowserBar address={address} compact />
        </div>
      </div>
    </div>
  );
}

export function DevicePreview({
  config,
  words = DEVICE_WORDS,
  alt,
  mediaBase = "/media/",
}: {
  config: DevicePreviewConfig;
  words?: DeviceWords;
  mediaBase?: string;
  /** What the screenshots show, for screen readers (the library's alt text otherwise). */
  alt?: string;
}) {
  const devices = config.devices.filter((d) => config.media?.[d]);
  const chosen = config.default_device && config.default_device !== "visitor" ? config.default_device : null;
  // The server and first paint show the chosen device (desktop by default); then the visitor's own.
  const [device, setDevice] = useState<DeviceKind>(
    chosen && devices.includes(chosen) ? chosen : (devices[0] ?? "desktop"),
  );
  const [seen, setSeen] = useState<Set<DeviceKind>>(() => new Set([device]));
  useEffect(() => {
    if (chosen) return;
    const own = visitorDevice();
    if (devices.includes(own)) {
      setDevice(own);
      setSeen((s) => new Set(s).add(own));
    }
    // Only on arrival: afterwards the visitor's choice stands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!devices.length || config.enabled === false) return null;
  const duration = config.transitions === false ? 0 : (config.duration_ms ?? 380);
  const choose = (d: DeviceKind) => {
    if (d === device) return;
    setDevice(d);
    setSeen((s) => new Set(s).add(d));
  };

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
        className="relative mt-5 grid min-h-[min(34rem,95vw)] place-items-center overflow-hidden"
        style={{ "--device-duration": `${duration}ms` } as CSSProperties}
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
            {seen.has(d) && (
              <Frame device={d} config={config}>
                <Screen
                  media={config.media?.[d]}
                  alt={alt ?? ""}
                  eager={d === device}
                  mediaBase={mediaBase}
                />
              </Frame>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
