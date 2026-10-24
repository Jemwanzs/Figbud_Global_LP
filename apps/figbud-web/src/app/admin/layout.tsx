import { brandIcons } from "@figbud/site-kit";
import { themeInitScript } from "@figbud/ui";
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import type { ReactNode } from "react";

import { getBrands } from "@/lib/products";

import "../globals.css";

const outfit = Outfit({ subsets: ["latin", "latin-ext"], variable: "--font-outfit", display: "swap" });

// The admin area is private: never indexed, never followed.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { default: "Admin", template: "%s · FigBud Admin" },
    robots: { index: false, follow: false },
    icons: brandIcons((await getBrands()).figbud),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#15120f" },
    { media: "(prefers-color-scheme: light)", color: "#fbf7f1" },
  ],
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={outfit.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
