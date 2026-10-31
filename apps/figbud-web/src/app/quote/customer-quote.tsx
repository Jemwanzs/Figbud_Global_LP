"use client";

import { QuoteDocument, type QuoteView } from "@figbud/site-kit";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Reads the link's token from the fragment (browsers never send fragments to
 * servers or logs) and loads the customer's view through this website.
 */
export function CustomerQuote() {
  const [state, setState] = useState<{ quote?: QuoteView; error?: string }>({});
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "";
    fetch("/quote/api", { headers: { "x-quote-token": token }, cache: "no-store" })
      .then(async (r) =>
        r.ok ? setState({ quote: (await r.json()) as QuoteView }) : setState({ error: "missing" }),
      )
      .catch(() => setState({ error: "unavailable" }));
  }, []);
  if (state.error)
    return (
      <main className="mx-auto max-w-xl px-5 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold text-text">
          This quotation link isn&apos;t available
        </h1>
        <p className="mt-3 text-muted">
          It may have been replaced or withdrawn. Please ask your FigBud contact for a new link.
        </p>
      </main>
    );
  if (!state.quote) return <main aria-busy="true" className="min-h-dvh" />;
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 print:max-w-none print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm text-text hover:border-line-strong"
        >
          <Printer aria-hidden className="size-4" />
          Print or save as PDF
        </button>
      </div>
      <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-6 sm:p-10 print:border-0 print:p-0">
        <QuoteDocument quote={state.quote} />
      </div>
    </main>
  );
}
