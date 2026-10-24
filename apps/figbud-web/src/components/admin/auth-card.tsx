import type { ReactNode } from "react";

import { FigBudBrand } from "@/components/figbud-brand";

/** Centred card for the sign-in and invite pages. */
export function AuthCard({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center px-5 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute start-1/2 top-0 h-[32rem] w-[48rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)]" />
      </div>
      <div className="w-full max-w-md">
        <FigBudBrand />
        <div className="fb-panel mt-8 rounded-[var(--radius-panel)] p-7 sm:p-9">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-text">{title}</h1>
          <p className="mt-2 leading-relaxed text-muted">{lead}</p>
          <div className="mt-8">{children}</div>
        </div>
        <p className="mt-6 text-center text-sm text-subtle">FigBud Global · Admin</p>
      </div>
    </main>
  );
}
