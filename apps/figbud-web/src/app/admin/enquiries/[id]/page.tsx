import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import {
  EMAIL_STATES,
  ENQUIRY_STATUSES,
  type EnquiryStatus,
  EnquiryStatusPill,
  KIND_LABELS,
  PRODUCT_LABELS,
  TEMPLATE_LABELS,
} from "@/components/admin/enquiry-labels";
import { EnquiryStatusForm } from "@/components/admin/enquiry-status-form";
import { hasRole } from "@/lib/admin-client";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Enquiry" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Detail {
  enquiry: {
    id: string;
    reference: string;
    kind: string;
    product: string;
    name: string;
    email: string;
    company?: string;
    job_title?: string;
    phone?: string;
    country?: string;
    company_size?: string;
    message?: string;
    locale: string;
    source_path?: string;
    status: EnquiryStatus;
    is_spam: boolean;
    created_at: string;
  };
  emails: { template: string; status: string; attempts: number; sent_at?: string; last_error?: string }[];
  history: {
    action: string;
    actor_email?: string;
    detail: { from?: string; to?: string };
    created_at: string;
  }[];
}

const statusLabel = (value?: string) => ENQUIRY_STATUSES.find((s) => s.value === value)?.label ?? value;
const when = (iso: string) => `${new Date(iso).toUTCString().slice(5, 22)} UTC`;

export default function EnquiryPage({ params }: PageProps<"/admin/enquiries/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Enquiry params={params} />
    </Suspense>
  );
}

async function Enquiry({ params }: Pick<PageProps<"/admin/enquiries/[id]">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { status, data } = await adminGet<Detail>(`enquiries/${id}`);
  if (status === 404) notFound();
  if (!data) return <AdminUnavailable />;
  const e = data.enquiry;

  return (
    <AdminShell user={user} active="/admin/enquiries">
      <p className="text-sm text-subtle">
        <Link href="/admin/enquiries" className="hover:text-text">
          Enquiries
        </Link>{" "}
        / <span className="font-mono">{e.reference}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text">{e.name}</h1>
        <EnquiryStatusPill status={e.status} />
      </div>
      <p className="mt-2 text-muted">
        {KIND_LABELS[e.kind] ?? e.kind} · {PRODUCT_LABELS[e.product] ?? e.product} · received{" "}
        {when(e.created_at)}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section aria-labelledby="contact" className="fb-panel rounded-[var(--radius-panel)] p-6">
            <h2 id="contact" className="font-semibold text-text">
              Contact
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={`mailto:${e.email}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm text-text hover:border-line-strong"
              >
                <Mail aria-hidden className="size-4" />
                {e.email}
              </a>
              {e.phone && (
                <a
                  href={`tel:${e.phone}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm text-text hover:border-line-strong"
                >
                  <Phone aria-hidden className="size-4" />
                  {e.phone}
                </a>
              )}
            </div>
            <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="Company" value={e.company} />
              <Field label="Job title" value={e.job_title} />
              <Field label="Country" value={e.country} />
              <Field label="Company size" value={e.company_size} />
              <Field label="Language" value={e.locale} />
              <Field label="Sent from" value={e.source_path} />
            </dl>
          </section>

          <section aria-labelledby="message" className="fb-panel rounded-[var(--radius-panel)] p-6">
            <h2 id="message" className="font-semibold text-text">
              Message
            </h2>
            {e.message ? (
              <p className="mt-3 leading-relaxed whitespace-pre-wrap text-muted">{e.message}</p>
            ) : (
              <p className="mt-3 text-subtle">No message was included.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6" aria-label="Follow-up">
          {hasRole(user, "editor") && (
            <section className="fb-panel rounded-[var(--radius-panel)] p-6">
              <EnquiryStatusForm id={e.id} status={e.status} />
            </section>
          )}
          <section aria-labelledby="emails" className="fb-panel rounded-[var(--radius-panel)] p-6">
            <h2 id="emails" className="font-semibold text-text">
              Emails
            </h2>
            {data.emails.length === 0 ? (
              <p className="mt-3 text-sm text-subtle">None: automated submissions are never emailed.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {data.emails.map((m) => (
                  <li key={m.template}>
                    <p className="text-text">{TEMPLATE_LABELS[m.template] ?? m.template}</p>
                    <p className="text-subtle">
                      {EMAIL_STATES[m.status] ?? m.status}
                      {m.sent_at && ` · ${when(m.sent_at)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="history" className="fb-panel rounded-[var(--radius-panel)] p-6">
            <h2 id="history" className="font-semibold text-text">
              History
            </h2>
            <ol className="mt-3 space-y-3 text-sm">
              {data.history.map((h) => (
                <li key={h.created_at + h.action}>
                  <p className="text-text">
                    {statusLabel(h.detail.from)} → {statusLabel(h.detail.to)}
                  </p>
                  <p className="text-subtle">
                    {h.actor_email ?? "System"} · {when(h.created_at)}
                  </p>
                </li>
              ))}
              <li>
                <p className="text-text">Received</p>
                <p className="text-subtle">{when(e.created_at)}</p>
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </AdminShell>
  );
}

function Field({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div>
      <dt className="text-subtle">{label}</dt>
      <dd className="mt-0.5 text-text">{value || "—"}</dd>
    </div>
  );
}
