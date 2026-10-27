import { describe, expect, it } from "vitest";

import {
  canonicalUrl,
  enquiryHref,
  hrefResolver,
  pageHref,
  parseSiteParam,
  rendererOrigin,
} from "./addresses";

const ziwa = { slug: "ziwa", cta: "waitlist" as const, primary_domain: "ziwa.example.com" };

describe("site addresses", () => {
  it("tells a path prefix from an own-domain request", () => {
    expect(parseSiteParam("ziwa")).toEqual({ slug: "ziwa", ownDomain: false });
    expect(parseSiteParam("~ziwa")).toEqual({ slug: "ziwa", ownDomain: true });
    expect(parseSiteParam("%7Eziwa")).toEqual({ slug: "ziwa", ownDomain: true });
  });

  it("writes page addresses for both modes", () => {
    expect(pageHref("ziwa", false, "")).toBe("/ziwa");
    expect(pageHref("ziwa", false, "solutions/banks")).toBe("/ziwa/solutions/banks");
    expect(pageHref("ziwa", true, "")).toBe("/");
    expect(pageHref("ziwa", true, "platform")).toBe("/platform");
  });

  it("uses the website's own domain for canonical URLs when served there", () => {
    expect(canonicalUrl(ziwa, true, "platform")).toBe("https://ziwa.example.com/platform");
    expect(canonicalUrl(ziwa, true, "")).toBe("https://ziwa.example.com");
    expect(canonicalUrl(ziwa, false, "platform")).toBe(`${rendererOrigin}/ziwa/platform`);
  });

  it("sends calls to action to the corporate enquiry form", () => {
    expect(enquiryHref(ziwa)).toMatch(/\/en\/contact\?kind=waitlist&product=ziwa$/);
    expect(enquiryHref({ slug: "zirahr", cta: "demo" })).toMatch(/kind=demo_request&product=zirahr$/);
    // Websites the enquiry form doesn't know yet still reach the right kind of form.
    expect(enquiryHref({ slug: "payflow", cta: "early_access" })).toMatch(/kind=early_access$/);
  });

  it("resolves block links for where the website is served", () => {
    const prefixed = hrefResolver(ziwa, false, [{ path: "" }, { path: "platform" }]);
    expect(prefixed("/platform")).toBe("/ziwa/platform");
    expect(prefixed("/platform?tab=risk#limits")).toBe("/ziwa/platform?tab=risk#limits");
    expect(prefixed("/")).toBe("/ziwa");
    expect(prefixed("https://figbud.example/x")).toBe("https://figbud.example/x");
    expect(prefixed("/contact")).toMatch(/\/en\/contact\?kind=waitlist&product=ziwa$/);
    const own = hrefResolver(ziwa, true, [{ path: "contact" }]);
    expect(own("/contact")).toBe("/contact");
    // Calls to action reach the enquiry form even when a contact page exists.
    expect(own("/enquire")).toMatch(/\/en\/contact\?kind=waitlist&product=ziwa$/);
    expect(own("/platform#top")).toBe("/platform#top");
  });
});
