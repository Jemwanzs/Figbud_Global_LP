import { cn } from "@figbud/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import {
  BOOKING_STATUSES,
  BookingActions,
  type BookingStatus,
  BookingStatusPill,
} from "@/components/admin/enquiry-follow-up";
import { PRODUCT_LABELS } from "@/components/admin/enquiry-labels";
import { LocalTime } from "@/components/admin/local-time";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { forSite, hasRole } from "@/lib/admin-client";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Demo bookings" };

interface Row {
  id: string;
  enquiry_id: string;
  reference: string;
  product: string;
  name: string;
  email: string;
  company?: string;
  company_size?: string;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  status: BookingStatus;
}

const RANGES = { upcoming: "Upcoming", past: "Past", all: "All" } as const;

export default function BookingsPage({ searchParams }: PageProps<"/admin/enquiries/bookings">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Bookings searchParams={searchParams} />
    </Suspense>
  );
}

async function Bookings({ searchParams }: Pick<PageProps<"/admin/enquiries/bookings">, "searchParams">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const query = await searchParams;
  const when = typeof query.when === "string" && query.when in RANGES ? query.when : "upcoming";
  const status = typeof query.status === "string" && query.status in BOOKING_STATUSES ? query.status : "";
  const params = new URLSearchParams({ when, ...(status ? { status } : {}) });
  const { data } = await adminGet<{ items: Row[] }>(`enquiries/bookings?${params}`);
  const href = (next: { when?: string; status?: string }) => {
    const p = new URLSearchParams({ when: next.when ?? when });
    const s = next.status ?? status;
    if (s) p.set("status", s);
    return `/admin/enquiries/bookings?${p}`;
  };
  const pill = (active: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-full px-4 text-sm transition-colors",
      active
        ? "bg-accent font-medium text-accent-ink"
        : "border border-line text-muted hover:border-line-strong hover:text-text",
    );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Demo bookings</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Demos visitors booked from the websites&apos; available times. Confirm them, move them or record
            how they went. Times show in your time zone.
          </p>
        </div>
        <Link
          href="/admin/enquiries/availability"
          className="text-sm font-medium text-accent-strong underline"
        >
          Demo availability
        </Link>
      </div>

      <nav aria-label="When" className="mt-8">
        <ul className="flex flex-wrap gap-2">
          {Object.entries(RANGES).map(([value, label]) => (
            <li key={value}>
              <Link
                href={href({ when: value })}
                aria-current={when === value ? "page" : undefined}
                className={pill(when === value)}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Filter by status" className="mt-3">
        <ul className="flex flex-wrap gap-2">
          {[["", "Any status"], ...Object.entries(BOOKING_STATUSES)].map(([value, label]) => (
            <li key={value || "any"}>
              <Link
                href={href({ status: value })}
                aria-current={status === value ? "page" : undefined}
                className={pill(status === value)}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {!data ? (
        <p className="mt-10 text-muted">Bookings could not be loaded. Please try again.</p>
      ) : data.items.length === 0 ? (
        <div className="mt-10 rounded-[var(--radius-panel)] border border-dashed border-line-strong p-10 text-center">
          <p className="text-lg font-medium text-text">No bookings here</p>
          <p className="mt-2 text-muted">
            Bookings appear once a website takes them (Demo availability) and a visitor chooses a time.
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
          {data.items.map((row) => (
            <li key={row.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:gap-8">
              <div className="min-w-0 lg:w-64 lg:shrink-0">
                <p className="font-medium text-text">
                  <LocalTime iso={row.starts_at} />
                </p>
                <p className="mt-1 text-xs text-subtle">
                  Offered in {row.time_zone} · <BookingStatusPill status={row.status} />
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/enquiries/${row.enquiry_id}`}
                  className="font-medium text-text hover:underline"
                >
                  {row.name}
                  {row.company && <span className="font-normal text-muted"> · {row.company}</span>}
                </Link>
                <p className="mt-1 truncate text-sm text-subtle">
                  {PRODUCT_LABELS[row.product] ?? row.product}
                  {row.company_size && ` · ${row.company_size} people`} ·{" "}
                  <span className="font-mono">{row.reference}</span>
                </p>
              </div>
              <div className="lg:w-[22rem] lg:shrink-0">
                <BookingActions
                  compact
                  booking={row}
                  product={row.product}
                  canEdit={hasRole(forSite(user, row.product), "editor")}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
