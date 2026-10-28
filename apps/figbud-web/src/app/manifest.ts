import { themeBackground } from "@figbud/brand";
import { brandManifestIcons } from "@figbud/site-kit";
import type { MetadataRoute } from "next";

import { getBrands } from "@/lib/products";

/** Installable-app icons come from FigBud Global's published app icon (built-in files until one exists). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  return {
    name: "FigBud Global",
    short_name: "FigBud",
    description: "Enterprise software built for complexity, designed for progress.",
    start_url: "/",
    display: "standalone",
    background_color: themeBackground.dark,
    theme_color: themeBackground.dark,
    icons: brandManifestIcons((await getBrands()).figbud) ?? [
      { src: "/icon.png", type: "image/png", sizes: "64x64" },
      { src: "/apple-icon.png", type: "image/png", sizes: "180x180" },
    ],
  };
}
