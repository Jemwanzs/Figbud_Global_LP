import path from "node:path";

import { brandAssetHeaderRule, heroPreviewHeaderRule, securityHeaders } from "@figbud/site-kit/server";
import type { NextConfig } from "next";

// The monorepo root (apps/figbud-web → repo root), for tracing shared packages.
const monorepoRoot = path.join(process.cwd(), "..", "..");

const isDev = process.env.NODE_ENV !== "production";

/** CSP and the other security headers are shared by every FigBud site. */
const security = {
  apiOrigin: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  isDev,
};
const headers = securityHeaders(security);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image; `next start` is used locally.
  output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@figbud/brand", "@figbud/i18n", "@figbud/site-kit", "@figbud/ui"],
  experimental: {
    globalNotFound: true,
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  turbopack: {
    root: monorepoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    // Later rules win: the Studio may frame its own hero previews (same origin only).
    return [{ source: "/:path*", headers }, brandAssetHeaderRule, heroPreviewHeaderRule(security)];
  },
};

export default nextConfig;
