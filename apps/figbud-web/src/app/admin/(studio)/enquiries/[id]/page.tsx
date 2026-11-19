import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { StudioSkeleton } from "@/components/admin/studio-states";
import {
  EMAIL_STATES,
  ENQUIRY_STATUSES,
  type EnquiryStatus,
  EnquiryStatusPill,
  KIND_LABELS,
  PRODUCT_LABELS,
  TEMPLATE_LABELS,
} from "@/components/admin/enquiry-labels";
import {
  AssigneeForm,
  BOOKING_STATUSES,
  type BookingInfo,
  BookingActions,
  type BookingStatus,
  NoteForm,
} from "@/components/admin/enquiry-follow-up";
import { EnquiryStatusForm } from "@/components/admin/enquiry-status-form";
import { forSite, hasRole } from "@/lib/admin-client";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { LocalTime } from "@/components/admin/local-time";

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
    phone_secondary?: string;
    country?: string;
    company_size?: string;
    message?: string;
    locale: string;
    source_path?: string;
    status: EnquiryStatus;
    is_spam: boolean;
    created_at: string;
    assigned_to?: string | null;
  };
  booking?: BookingInfo | null;
  can_edit?: boolean;
  emails: { template: string; status: string; attempts: number; sent_at?: string; last_error?: string }[];
  history: {
    action: string;
    actor_email?: string;
    detail: { from?: string; to?: string | null; note?: string };
    created_at: string;
  }[];
}

const statusLabel = (value?: string | null) =>
  ENQUIRY_STATUSES.find((s) => s.value === value)?.label ?? value;

/** One line of the history, by what happened (P8-M8 adds assignment, notes and bookings). */
function HistoryLine({ entry }: { entry: Detail["history"][number] }) {
  const d = entry.detail;
  switch (entry.action) {
    case "enquiry.assigned":
      return <>{d.to ? `Assigned to ${d.to}` : "Unassigned"}</>;
    case "enquiry.note_added":
      return <span className="whitespace-pre-wrap">Note: {d.note}</span>;
    case "demo.status_changed":
      return (
        <>
          Demo {BOOKING_STATUSES[d.from as BookingStatus] ?? d.from} →{" "}
          {BOOKING_STATUSES[d.to as BookingStatus] ?? d.to}
        </>
      );
    case "demo.rescheduled":
      return (
        <>
          Demo moved from {d.from ? <LocalTime iso={d.from} /> : "?"} to{" "}
          {d.to ? <LocalTime iso={d.to} /> : "?"}
        </>
      );
    default:
      return (
        <>
          {statusLabel(d.from)} → {statusLabel(d.to)}
        </>
      );
  }
}

export default function EnquiryPage({ params }: PageProps<"/admin/enquiries/[id]">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
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
  const editor = hasRole(forSite(user, e.product), "editor");
  const people = editor
    ? ((await adminGet<{ items: { id: string; name: string }[] }>("enquiries/assignees")).data?.items ?? [])
    : [];

  return (
    <>
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
        <LocalTime iso={e.created_at} />
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
              {[e.phone, e.phone_secondary].filter(Boolean).map((phone) => (
                <a
                  key={phone}
                  href={`tel:${phone}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm text-text hover:border-line-strong"
                >
                  <Phone aria-hidden className="size-4" />
                  {phone}
                </a>
              ))}
            </div>
            <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="Company" value={e.company} />
              <Field label="Job title" value={e.job_title} />
              <Field label="Country" value={countryName(e.country)} />
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
          {data.booking && (
            <section aria-labelledby="demo" className="fb-panel rounded-[var(--radius-panel)] p-6">
              <h2 id="demo" className="mb-3 font-semibold text-text">
                Demo booking
              </h2>
              <BookingActions booking={data.booking} product={e.product} canEdit={editor} />
            </section>
          )}
          {editor && (
            <section className="fb-panel space-y-6 rounded-[var(--radius-panel)] p-6">
              <EnquiryStatusForm id={e.id} status={e.status} />
              <AssigneeForm id={e.id} assigned={e.assigned_to ?? null} people={people} />
              <NoteForm id={e.id} />
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
                      {m.sent_at && (
                        <>
                          {" · "}
                          <LocalTime iso={m.sent_at} />
                        </>
                      )}
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
                    <HistoryLine entry={h} />
                  </p>
                  <p className="text-subtle">
                    {h.actor_email ?? "System"} · <LocalTime iso={h.created_at} />
                  </p>
                </li>
              ))}
              <li>
                <p className="text-text">Received</p>
                <p className="text-subtle">
                  <LocalTime iso={e.created_at} />
                </p>
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </>
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

/** New enquiries store an ISO code ("KE"); earlier ones kept the text typed. */
function countryName(country?: string) {
  if (!country || !/^[A-Z]{2}$/.test(country)) return country;
  try {
    return `${new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country} (${country})`;
  } catch {
    return country;
  }
}
