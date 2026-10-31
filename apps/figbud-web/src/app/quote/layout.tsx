import { themeColorViewport } from "@figbud/brand";
import { themeInitScript } from "@figbud/ui";
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import type { ReactNode } from "react";

import "../globals.css";

const outfit = Outfit({ subsets: ["latin", "latin-ext"], variable: "--font-outfit", display: "swap" });

// Customer quotations: private links, never indexed or followed.
export const metadata: Metadata = {
  title: "Your quotation · FigBud Global",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: themeColorViewport,
};

export default function QuoteLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={outfit.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-bg">{children}</body>
    </html>
  );
}
