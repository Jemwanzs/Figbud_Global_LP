"use client";

import { BrandLogo } from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import { Monitor, Smartphone } from "lucide-react";
import { type CSSProperties, useState } from "react";

import {
  ADMIN_ASSET_PATH,
  type BrandConfig,
  type LibraryAsset,
  resolvePair,
  toBrandAsset,
} from "./brand-types";

/**
 * How the draft looks where it's used: the website header, a product card and
 * a browser tab, on both themes. Built from the unsaved draft, so changes show
 * immediately; nothing here is public.
 */
export function BrandPreview({
  config,
  assets,
  name,
  tagline,
}: {
  config: BrandConfig;
  assets: Map<string, LibraryAsset>;
  name: string;
  tagline?: string | null;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const horizontal = resolvePair(config.logos.horizontal, assets);
  const symbol = resolvePair(config.logos.symbol, assets);
  const faviconAsset = config.favicon ? assets.get(config.favicon) : undefined;
  const favicon = faviconAsset
    ? { on_dark: toBrandAsset(faviconAsset), on_light: toBrandAsset(faviconAsset) }
    : symbol;
  const colours = {
    "--product": config.colors.primary,
    "--product-2": config.colors.secondary,
  } as CSSProperties;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-text">Live preview</h2>
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
                "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm",
                device === value ? "bg-surface-2 text-text" : "text-muted hover:text-text",
              )}
            >
              <Icon aria-hidden className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4">
        {(["dark", "light"] as const).map((theme) => (
          <figure
            key={theme}
            data-theme={theme}
            style={colours}
            className={cn(
              "overflow-hidden rounded-2xl border border-line bg-bg text-text",
              device === "mobile" && "mx-auto w-full max-w-[22rem]",
            )}
          >
            <figcaption className="border-b border-line bg-surface-2 px-4 py-2 text-xs text-muted">
              {theme === "dark" ? "Dark theme (default)" : "Light theme"}
            </figcaption>
            {/* Browser tab */}
            <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
              <span className="inline-flex size-4 items-center justify-center overflow-hidden rounded-sm">
                <BrandLogo
                  pair={favicon}
                  height={16}
                  maxWidth={16}
                  alt=""
                  basePath={ADMIN_ASSET_PATH}
                  fallback={<span className="size-3 rounded-sm bg-[var(--product)]" />}
                />
              </span>
              <span className="truncate text-xs text-muted">{name}</span>
            </div>
            {/* Header */}
            <div className="flex items-center gap-4 border-b border-line px-4 py-3">
              <BrandLogo
                pair={horizontal}
                height={device === "mobile" ? Math.min(config.logo_height, 28) : config.logo_height}
                maxWidth={device === "mobile" ? 150 : 220}
                alt={name}
                basePath={ADMIN_ASSET_PATH}
                fallback={<span className="font-semibold">{name}</span>}
              />

              <span
                className={cn(
                  "ms-auto shrink-0 rounded-full bg-[var(--product)] px-3 py-1.5 text-xs font-medium text-fb-ink",
                )}
              >
                Book a demo
              </span>
            </div>
            {/* Product card */}
            <div className="p-4">
              <div className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center gap-3">
                  <BrandLogo
                    pair={symbol}
                    height={36}
                    maxWidth={36}
                    alt=""
                    basePath={ADMIN_ASSET_PATH}
                    fallback={
                      <span className="size-9 rounded-[10px] bg-gradient-to-br from-[var(--product)] to-[var(--product-2)]" />
                    }
                  />
                  <span className="font-semibold">{name}</span>
                </div>
                {tagline && <p className="mt-3 text-sm text-muted">{tagline}</p>}
                <p className="mt-3 flex items-center gap-2 text-sm font-medium">
                  <span
                    aria-hidden
                    className="h-1 w-6 rounded-full"
                    style={{ background: config.colors.accent }}
                  />
                  Learn more
                </p>
              </div>
            </div>
          </figure>
        ))}
      </div>
    </div>
  );
}
