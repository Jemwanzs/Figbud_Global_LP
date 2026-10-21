import { ImageResponse } from "next/og";

export const alt = "FigBud Global — Built for complexity. Designed for progress.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "radial-gradient(circle at 85% 10%, rgba(240,166,93,0.35), transparent 55%), #120f0d",
        color: "#f6ece0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(135deg, #F6BD82, #F0A65D 55%, #A66538)",
          }}
        />
        <span style={{ fontWeight: 600 }}>FigBud</span>
        <span style={{ color: "#c2b2a1" }}>Global</span>
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
        <span style={{ color: "#f0a65d" }}>Designed for progress.</span>
      </div>
      <div style={{ display: "flex", gap: 28, fontSize: 26, color: "#c2b2a1" }}>
        <span>ZiraHR</span>
        <span>·</span>
        <span>Jasiri LMS</span>
        <span>·</span>
        <span>Expense Now</span>
      </div>
    </div>,
    size,
  );
}
