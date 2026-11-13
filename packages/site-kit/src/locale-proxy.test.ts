import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { localeProxy, websiteLocaleProxy } from "./locale-proxy";

const request = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, "https://figbud.test"), { headers });
const location = async (path: string, languages?: Parameters<typeof websiteLocaleProxy>[1], h = {}) =>
  (languages === undefined
    ? localeProxy(request(path, h))
    : websiteLocaleProxy(request(path, h), languages)
  )?.headers.get("location") ?? null;

describe("websiteLocaleProxy (P7-L1)", () => {
  it("leaves the plain proxy safe to export directly (Next.js passes it an event too)", () => {
    const event = { waitUntil: () => {} } as unknown as never;
    const proxy = localeProxy as (r: NextRequest, e: never) => ReturnType<typeof localeProxy>;
    expect(proxy(request("/zh/about"), event)).toBeUndefined();
    expect(proxy(request("/about"), event)?.headers.get("location")).toBe("https://figbud.test/en/about");
  });

  const languages = { enabled: ["en", "sw", "fr"] as const, default: "en", fallback: "en" } as const;
  const own = { ...languages, enabled: [...languages.enabled] };

  it("serves languages the website offers, and sends switched-off ones to the same page in its default", async () => {
    expect(await location("/fr/about", own)).toBeNull();
    expect(await location("/zh/about", own)).toBe("https://figbud.test/en/about");
    expect(await location("/zh", own)).toBe("https://figbud.test/en");
    // Without the website's settings, every language routes, as before.
    expect(await location("/zh/about")).toBeNull();
  });

  it("opens in a saved choice it still offers, else the default", async () => {
    expect(await location("/about", own, { cookie: "fb-locale=sw" })).toBe("https://figbud.test/sw/about");
    expect(await location("/about", own, { cookie: "fb-locale=zh" })).toBe("https://figbud.test/en/about");
    expect(await location("/", own)).toBe("https://figbud.test/en");
  });
});
