import { FigBudWordmark, buttonClasses, themeInitScript } from "@figbud/ui";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import Link from "next/link";

import en from "@/i18n/dictionaries/en";

import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: "Page not found · FigBud Global",
  robots: { index: false, follow: false },
};

/** Served for URLs that match no route at all. Bypasses the locale layout. */
export default function GlobalNotFound() {
  const copy = en.pages.notFound;
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={outfit.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-5 py-16 sm:px-8">
          <Link href="/en" aria-label="FigBud Global">
            <FigBudWordmark />
          </Link>
          <p className="mt-16 font-mono text-sm text-accent">404</p>
          <h1 className="mt-4 font-display text-headline font-semibold text-text">{copy.title}</h1>
          <p className="mt-4 text-lead text-muted">{copy.body}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/en" className={buttonClasses("primary")}>
              {copy.home}
            </Link>
            <Link href="/en/products" className={buttonClasses("secondary")}>
              {copy.products}
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
