import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "./security";

describe("security headers", () => {
  it("locks scripts and connections to first-party origins plus the API", () => {
    const csp = contentSecurityPolicy({
      apiOrigin: "https://api.example.com/",
      siteUrl: "https://example.com",
      isDev: false,
    });
    expect(csp).toContain("connect-src 'self' https://api.example.com;");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp.endsWith("upgrade-insecure-requests")).toBe(true);
  });

  it("never upgrades requests on plain-HTTP sites (WebKit applies it to localhost)", () => {
    const csp = contentSecurityPolicy({
      apiOrigin: "http://localhost:8080",
      siteUrl: "http://localhost:3000",
      isDev: false,
    });
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("allows eval and the dev websocket only in development", () => {
    const csp = contentSecurityPolicy({ apiOrigin: "http://localhost:8080", siteUrl: "", isDev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws: wss:");
  });

  it("sends HSTS, nosniff, frame denial and a strict referrer policy", () => {
    const keys = securityHeaders({ apiOrigin: "https://a", siteUrl: "https://b", isDev: false }).map(
      (h) => h.key,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
      ]),
    );
  });
});
