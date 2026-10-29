import { themeBackground } from "@figbud/brand";
import { ImageResponse } from "next/og";

import { getBrandPng, getSite, parseSiteParam } from "@/lib/sites";

export const alt = "Preview of this FigBud Global platform website";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEX = /^#[0-9a-f]{6}$/i;
const colour = (value: string | undefined, fallback: string) => (value && HEX.test(value) ? value : fallback);

/**
 * A product website's sharing image (P7-BR11): the social image uploaded in
 * its Branding, or a card generated from its published brand (symbol, name,
 * tagline and colours), so every website shares well before any upload.
 */
export default async function OpengraphImage({ params }: { params: Promise<{ site: string }> }) {
  const { slug } = parseSiteParam((await params).site);
  const site = await getSite(slug);
  const brand = site?.brand;
  if (brand?.social_image) {
    const uploaded = await getBrandPng(brand.social_image.id, "social");
    if (uploaded) {
      return new Response(uploaded.slice().buffer, {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=300, stale-while-revalidate=3600",
        },
      });
    }
  }
  const mark = brand?.logos.symbol.on_dark ?? brand?.app_icon ?? brand?.favicon;
  const png = mark ? await getBrandPng(mark.id, 512) : null;
  const symbol = png ? `data:image/png;base64,${Buffer.from(png).toString("base64")}` : null;
  const primary = colour(brand?.colors.primary, "#22c55e");
  const secondary = colour(brand?.colors.secondary, "#3b82f6");
  const name = site?.name ?? "FigBud Global";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: `radial-gradient(circle at 88% 8%, ${primary}55, transparent 55%), radial-gradient(circle at 8% 100%, ${secondary}40, transparent 50%), ${themeBackground.dark}`,
        color: "#f8fafc",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {symbol && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={symbol} width={112} height={112} alt="" style={{ objectFit: "contain" }} />
        )}
        <span style={{ fontSize: 64, fontWeight: 600, letterSpacing: -1.5 }}>{name}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {site?.tagline && (
          <span style={{ fontSize: 58, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 980 }}>
            {site.tagline}
          </span>
        )}
        <span style={{ display: "flex", height: 8, width: 220, borderRadius: 8, background: primary }} />
      </div>
      <span style={{ fontSize: 26, color: "#94a3b8" }}>A FigBud Global platform</span>
    </div>,
    size,
  );
}
