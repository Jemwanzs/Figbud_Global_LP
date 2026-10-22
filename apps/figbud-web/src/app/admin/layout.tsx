import { themeInitScript } from "@figbud/ui";
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import type { ReactNode } from "react";

import "../globals.css";

const outfit = Outfit({ subsets: ["latin", "latin-ext"], variable: "--font-outfit", display: "swap" });

// The admin area is private: never indexed, never followed.
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · FigBud Admin" },
  robots: { index: false, follow: false },
};

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
