import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FigBud Global",
    short_name: "FigBud",
    description: "Enterprise software built for complexity, designed for progress.",
    start_url: "/",
    display: "standalone",
    background_color: "#120f0d",
    theme_color: "#120f0d",
    icons: [{ src: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
  };
}
