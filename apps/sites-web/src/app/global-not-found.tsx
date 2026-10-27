import { brandIcons } from "@figbud/site-kit";
import { buttonClasses, themeInitScript } from "@figbud/ui";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";

import { figbudOrigin } from "@/lib/sites";

import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: "Page not found · FigBud Global",
  robots: { index: false, follow: false },
  icons: brandIcons(),
};

/** Addresses that match no website at all. */
export default function GlobalNotFound() {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={outfit.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-5 py-16 sm:px-8">
          <p className="font-mono text-sm text-accent">404</p>
          <h1 className="mt-4 font-display text-headline font-semibold text-text">
            This page doesn&apos;t exist.
          </h1>
          <p className="mt-4 text-lead text-muted">
            The address may be mistyped, or the page may have moved. FigBud Global lists every product
            website.
          </p>
          <div className="mt-8">
            <a href={`${figbudOrigin}/en/products`} className={buttonClasses("primary")}>
              See FigBud products
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
