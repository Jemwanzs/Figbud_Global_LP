import { afterEach, describe, expect, it, vi } from "vitest";

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string);
  return import("./cross-site");
}

afterEach(() => vi.unstubAllEnvs());

describe("cross-site links", () => {
  it("links back to the corporate site in the visitor's language", async () => {
    const { figbudLink, linkProps } = await load({ NEXT_PUBLIC_FIGBUD_URL: "https://figbudglobal.com/" });
    expect(figbudLink("sw", "/about")).toEqual({ href: "https://figbudglobal.com/sw/about", external: true });
    expect(linkProps(figbudLink("en"))).toEqual({
      href: "https://figbudglobal.com/en",
      target: "_blank",
      rel: "noopener",
    });
  });

  it("falls back to the corporate Products page until a product site is deployed", async () => {
    const { productSiteLink } = await load({
      NEXT_PUBLIC_FIGBUD_URL: "https://figbudglobal.com",
      NEXT_PUBLIC_JASIRI_URL: "",
    });
    expect(productSiteLink("jasiri", "en").href).toBe("https://figbudglobal.com/en/products#jasiri");
  });

  it("uses a configured product origin", async () => {
    const { productSiteLink } = await load({ NEXT_PUBLIC_ZIRAHR_URL: "https://zirahr.figbudglobal.com/" });
    expect(productSiteLink("zirahr", "fr").href).toBe("https://zirahr.figbudglobal.com/fr");
  });

  it("sends demo and waitlist requests to the corporate enquiry form", async () => {
    const { enquiryLink } = await load({ NEXT_PUBLIC_FIGBUD_URL: "https://figbudglobal.com" });
    expect(enquiryLink("zirahr", "en").href).toBe(
      "https://figbudglobal.com/en/contact?kind=demo_request&product=zirahr",
    );
    expect(enquiryLink("expense_now", "en").href).toBe(
      "https://figbudglobal.com/en/contact?kind=waitlist&product=expense_now",
    );
  });
});
