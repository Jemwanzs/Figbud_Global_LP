import { publicProducts, themeBackground } from "@figbud/brand";
import { ImageResponse } from "next/og";

import { getSocialImage } from "@/lib/products";

export const alt = "FigBud Global — Built for complexity. Designed for progress.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The sharing image uploaded in the Studio (Branding), else this generated card. */
export default async function OpengraphImage() {
  const uploaded = await getSocialImage();
  if (uploaded) {
    return new Response(uploaded.slice().buffer, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      },
    });
  }
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: `radial-gradient(circle at 85% 10%, rgba(34,197,94,0.28), transparent 55%), radial-gradient(circle at 10% 95%, rgba(59,130,246,0.22), transparent 50%), ${themeBackground.dark}`,
        color: "#f8fafc",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34 }}>
        <span style={{ fontWeight: 600 }}>FigBud</span>
        <span style={{ color: "#94a3b8" }}>Global</span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 76,
          lineHeight: 1.05,
          letterSpacing: -2,
        }}
      >
        <span>Built for complexity.</span>
        <span style={{ color: "#22c55e" }}>Designed for progress.</span>
      </div>
      <div style={{ display: "flex", gap: 28, fontSize: 26, color: "#94a3b8" }}>
        {/* Every product in the registry, so a new product is never left out. */}
        {publicProducts.map((product, i) => (
          <span key={product.slug} style={{ display: "flex", gap: 28 }}>
            {i > 0 && <span>·</span>}
            <span>{product.name}</span>
          </span>
        ))}
      </div>
    </div>,
    size,
  );
}
