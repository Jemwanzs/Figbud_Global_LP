/**
 * Security headers shared by every FigBud Next.js site (used from each app's
 * next.config.ts).
 *
 * Next.js streams its RSC payload through inline scripts, so static pages
 * need `'unsafe-inline'` for scripts unless a per-request nonce is used
 * (which would make every page dynamic). Everything else is locked to
 * first-party origins plus the API.
 */
export interface SecurityOptions {
  /** API origin the browser may call (CSP `connect-src`). */
  apiOrigin: string;
  /** This site's public URL; HTTPS sites also upgrade insecure subresources. */
  siteUrl: string;
  /** `next dev`: allows eval (React refresh) and the dev websocket. */
  isDev: boolean;
}

export function contentSecurityPolicy({ apiOrigin, siteUrl, isDev }: SecurityOptions): string {
  // Only upgrade subresources when the site is served over HTTPS: WebKit applies
  // `upgrade-insecure-requests` to localhost too, which breaks plain-HTTP builds.
  const servesHttps = siteUrl.startsWith("https://");
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Article cover and body images may come from any HTTPS host chosen by editors.
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin.replace(/\/$/, "")}${isDev ? " ws: wss:" : ""}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(servesHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function securityHeaders(options: SecurityOptions): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
