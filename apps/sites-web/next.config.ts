import path from "node:path";

import { brandAssetHeaderRule, securityHeaders } from "@figbud/site-kit/server";
import type { NextConfig } from "next";

// The monorepo root (apps/sites-web → repo root), for tracing shared packages.
const monorepoRoot = path.join(process.cwd(), "..", "..");

/** CSP and the other security headers are shared by every FigBud site. */
const headers = securityHeaders({
  apiOrigin: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  isDev: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactStrictMode: true,
  poweredByHeader: false,
  output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@figbud/brand", "@figbud/i18n", "@figbud/site-kit", "@figbud/ui"],
  experimental: {
    globalNotFound: true,
    optimizePackageImports: ["lucide-react"],
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
    return [{ source: "/:path*", headers }, brandAssetHeaderRule];
  },
};

export default nextConfig;
