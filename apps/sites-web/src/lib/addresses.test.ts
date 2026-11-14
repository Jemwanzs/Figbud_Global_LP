import { describe, expect, it } from "vitest";

import {
  languageHref,
  pageUrls,
  splitLocale,
  canonicalUrl,
  enquiryHref,
  hrefResolver,
  pageHref,
  parseSiteParam,
  rendererOrigin,
  siteLinkHref,
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

  it("sends Studio links to this website's pages, or to their https address", () => {
    expect(siteLinkHref("ziwa", false, "/platform")).toBe("/ziwa/platform");
    expect(siteLinkHref("ziwa", true, "/platform")).toBe("/platform");
    expect(siteLinkHref("ziwa", false, "/")).toBe("/ziwa");
    expect(siteLinkHref("ziwa", false, "https://docs.example.com")).toBe("https://docs.example.com");
  });

  it("writes and reads addresses in other languages (P7-L2b)", () => {
    expect(pageHref("zirahr", false, "platform", "sw")).toBe("/zirahr/sw/platform");
    expect(pageHref("zirahr", false, "", "sw")).toBe("/zirahr/sw");
    expect(pageHref("zirahr", true, "platform", "fr")).toBe("/fr/platform");
    expect(pageHref("zirahr", false, "platform", "en")).toBe("/zirahr/platform");
    expect(splitLocale(["sw", "platform"], ["en", "sw"])).toEqual({ locale: "sw", path: "platform" });
    // A language the website doesn't show is just a page path.
    expect(splitLocale(["fr", "platform"], ["en", "sw"])).toEqual({ locale: "en", path: "fr/platform" });
    expect(splitLocale([], ["en", "sw"])).toEqual({ locale: "en", path: "" });
  });

  it("finds each language's version of a page: the page, else that language's home, else none", () => {
    const pages = [
      { path: "", locales: ["sw"] },
      { path: "platform", locales: ["sw", "fr"] },
      { path: "about", locales: [] },
    ];
    expect(languageHref("zirahr", false, pages, "platform", "fr")).toBe("/zirahr/fr/platform");
    expect(languageHref("zirahr", false, pages, "about", "sw")).toBe("/zirahr/sw");
    expect(languageHref("zirahr", false, pages, "about", "fr")).toBeNull();
    expect(languageHref("zirahr", false, pages, "about", "en")).toBe("/zirahr/about");
  });

  it("lists a page's translated addresses in the sitemap, only in languages the website shows", () => {
    const page = { path: "platform", locales: ["sw", "fr"] };
    expect(pageUrls(ziwa, true, page, ["en", "sw"])).toEqual([
      "https://ziwa.example.com/platform",
      "https://ziwa.example.com/sw/platform",
    ]);
    expect(pageUrls(ziwa, false, { path: "about" }, ["en", "sw"])).toEqual([`${rendererOrigin}/ziwa/about`]);
  });

  it("keeps links on a translated page in its language where the target is translated", () => {
    const site = { slug: "zirahr", cta: "demo" } as const;
    const pages = [{ path: "platform", locales: ["sw"] }, { path: "about" }];
    const resolve = hrefResolver(site, false, pages, "sw");
    expect(resolve("/platform#modules")).toBe("/zirahr/sw/platform#modules");
    expect(resolve("/about")).toBe("/zirahr/about");
  });
});
