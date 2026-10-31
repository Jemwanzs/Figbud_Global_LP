"use client";

import { QuoteDocument } from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import { Check, Copy, Link2, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";

import { ActionButton } from "../action-button";
import { QUOTE_STATUS, type QuoteDetail, type QuoteSummary } from "./pricing-types";

/**
 * One quotation: the customer's document (frozen figures) and its workflow.
 * Internal notes stay here; customer links show the document only.
 */
export function QuotePanel({
  initial,
  isOwner,
  brand,
}: {
  initial: QuoteDetail;
  isOwner: boolean;
  brand?: React.ReactNode;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function act(action: string, done: string, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(action);
    setMessage(null);
    try {
      const result = await adminFetch<QuoteSummary & { token?: string }>(
        `pricing/quotes/${quote.id}/${action}`,
        {},
      );
      setQuote((q) => ({
        ...q,
        ...result,
        shared: action === "unshare" ? false : action === "share" ? true : q.shared,
      }));
      if (result.token) setLink(`${window.location.origin}/quote#t=${result.token}`);
      if (action === "unshare") setLink(null);
      setMessage({ tone: "ok", text: done });
      router.refresh();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  }

  const status = QUOTE_STATUS[quote.status];
  const canDecide = quote.can_review && (!quote.own_submission || isOwner);
  const view = {
    reference: quote.reference,
    product: quote.site.name,
    customer_name: quote.customer_name,
    status: quote.status,
    issue_date: quote.issue_date,
    expiry_date: quote.expiry_date,
    calculation: quote.snapshot.calculation,
    model: quote.snapshot.model,
    tax_name: quote.snapshot.tax_name,
    terms: quote.terms,
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-6 sm:p-8 print:border-0 print:p-0">
        <QuoteDocument quote={view} brand={brand} />
      </div>
      <aside className="space-y-4 print:hidden">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold text-text">Status</h2>
          <p className={cn("mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-xs", status.tone)}>
            {status.label}
          </p>
          <p className="mt-2 text-xs text-subtle">
            {`Priced from published version ${quote.book_version}. Later price changes never alter this quotation.`}
          </p>
          {message && (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={cn("mt-3 text-sm", message.tone === "error" ? "text-danger" : "text-accent-strong")}
            >
              {message.text}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {quote.status === "draft" && quote.can_edit && (
              <ActionButton
                ready
                busy={busy === "submit"}
                onClick={() => act("submit", "Sent for approval.")}
              >
                Ask for approval
              </ActionButton>
            )}
            {quote.status === "pending_approval" && quote.can_review && (
              <>
                <ActionButton
                  ready={canDecide}
                  busy={busy === "approve"}
                  hint={!canDecide ? "Another reviewer approves your own quotation." : undefined}
                  onClick={() => act("approve", "Approved. Share it with the customer or mark it as sent.")}
                >
                  Approve
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  ready
                  busy={busy === "reject"}
                  onClick={() => act("reject", "Returned to draft.")}
                >
                  Return to draft
                </ActionButton>
              </>
            )}
            {["approved", "sent", "accepted"].includes(quote.status) && quote.can_edit && (
              <ActionButton
                variant="secondary"
                ready
                busy={busy === "share"}
                icon={<Link2 aria-hidden className="size-4" />}
                onClick={() =>
                  act(
                    "share",
                    "Customer link created. It's shown once: copy it now.",
                    quote.shared ? "Create a new link? The previous link stops working." : undefined,
                  )
                }
              >
                {quote.shared ? "Create a new customer link" : "Create customer link"}
              </ActionButton>
            )}
            {quote.status === "approved" && quote.can_edit && (
              <ActionButton
                variant="ghost"
                ready
                busy={busy === "mark_sent"}
                onClick={() => act("mark_sent", "Marked as sent.")}
              >
                Mark as sent
              </ActionButton>
            )}
            {["approved", "sent"].includes(quote.status) && quote.can_review && (
              <div className="grid grid-cols-2 gap-2">
                <ActionButton
                  variant="secondary"
                  ready
                  busy={busy === "accept"}
                  onClick={() => act("accept", "Recorded as accepted.", "Record that the customer accepted?")}
                >
                  Accepted
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  ready
                  busy={busy === "decline"}
                  onClick={() =>
                    act("decline", "Recorded as declined.", "Record that the customer declined?")
                  }
                >
                  Declined
                </ActionButton>
              </div>
            )}
            <ActionButton
              variant="ghost"
              ready
              icon={<Printer aria-hidden className="size-4" />}
              onClick={() => window.print()}
            >
              Print or save as PDF
            </ActionButton>
          </div>
          {link && (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent-soft/40 p-3">
              <p className="text-xs font-medium text-text">Customer link (shown once)</p>
              <p className="mt-1 font-mono text-xs break-all text-muted">{link}</p>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }}
                className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-accent hover:bg-accent-soft"
              >
                {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
          {quote.shared && !link && (
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-subtle">
              <span>A customer link is active until the quotation expires.</span>
              <button
                type="button"
                onClick={() => act("unshare", "The customer link no longer works.")}
                className="text-danger hover:underline"
              >
                Stop sharing
              </button>
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold text-text">Internal</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <div>
              <dt className="text-xs text-subtle">Contact</dt>
              <dd className="text-text">{quote.customer_contact || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Notes (never shown to the customer)</dt>
              <dd className="whitespace-pre-line text-text">{quote.internal_notes || "—"}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  );
}
