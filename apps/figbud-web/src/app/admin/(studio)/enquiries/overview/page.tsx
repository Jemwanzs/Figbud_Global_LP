import { cn } from "@figbud/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { ENQUIRY_STATUSES, KIND_LABELS, PRODUCT_LABELS } from "@/components/admin/enquiry-labels";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Leads overview" };

interface Count {
  key: string;
  count: number;
}

interface Overview {
  days: number;
  total: number;
  converted: number;
  by_kind: Count[];
  by_product: Count[];
  by_status: Count[];
  demos: { booked: number; upcoming: number; completed: number; no_show: number };
  open_unassigned: number;
}

const PERIODS = { "7": "7 days", "30": "30 days", "90": "90 days", "365": "12 months" } as const;
const statusLabel = (key: string) => ENQUIRY_STATUSES.find((s) => s.value === key)?.label ?? key;

export default function OverviewPage({ searchParams }: PageProps<"/admin/enquiries/overview">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <LeadsOverview searchParams={searchParams} />
    </Suspense>
  );
}

/** One breakdown as labelled rows with a proportional bar (counts, not shares, are the data). */
function Breakdown({
  title,
  rows,
  label,
  link,
}: {
  title: string;
  rows: Count[];
  label: (key: string) => string;
  link: (key: string) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section aria-label={title} className="fb-panel rounded-[var(--radius-panel)] p-6">
      <h2 className="font-semibold text-text">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-subtle">Nothing in this period.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.key}>
              <Link href={link(r.key)} className="group block">
                <span className="flex justify-between gap-3 text-sm">
                  <span className="text-text group-hover:underline">{label(r.key)}</span>
                  <span className="font-medium text-text tabular-nums">
                    {r.count.toLocaleString("en-GB")}
                  </span>
                </span>
                <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${(r.count / max) * 100}%` }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function LeadsOverview({ searchParams }: Pick<PageProps<"/admin/enquiries/overview">, "searchParams">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const query = await searchParams;
  const days = typeof query.days === "string" && query.days in PERIODS ? query.days : "30";
  const { data } = await adminGet<Overview>(`enquiries/overview?days=${days}`);
  const rate = data && data.total ? Math.round((data.converted / data.total) * 1000) / 10 : 0;
  const tiles = data
    ? [
        { label: "Enquiries", value: data.total.toLocaleString("en-GB"), href: "/admin/enquiries" },
        {
          label: "Converted",
          value: `${data.converted.toLocaleString("en-GB")} (${rate}%)`,
          href: "/admin/enquiries?status=converted",
        },
        {
          label: "Demos booked",
          value: data.demos.booked.toLocaleString("en-GB"),
          href: "/admin/enquiries/bookings?when=all",
        },
        {
          label: "Upcoming demos",
          value: data.demos.upcoming.toLocaleString("en-GB"),
          href: "/admin/enquiries/bookings",
        },
        {
          label: "Demos completed",
          value: data.demos.completed.toLocaleString("en-GB"),
          href: "/admin/enquiries/bookings?when=past&status=completed",
        },
        {
          label: "Open, unassigned",
          value: data.open_unassigned.toLocaleString("en-GB"),
          href: "/admin/enquiries",
        },
      ]
    : [];

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Leads overview</h1>
      <p className="mt-2 max-w-2xl text-muted">
        What arrived from the websites you can see, without spam. Counts only; open an enquiry for its
        details.
      </p>
      <nav aria-label="Period" className="mt-8">
        <ul className="flex flex-wrap gap-2">
          {Object.entries(PERIODS).map(([value, label]) => (
            <li key={value}>
              <Link
                href={`/admin/enquiries/overview?days=${value}`}
                aria-current={days === value ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-4 text-sm transition-colors",
                  days === value
                    ? "bg-accent font-medium text-accent-ink"
                    : "border border-line text-muted hover:border-line-strong hover:text-text",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {!data ? (
        <p className="mt-10 text-muted">The overview could not be loaded. Please try again.</p>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-lead-tiles="">
            {tiles.map((t) => (
              <div
                key={t.label}
                className="relative rounded-[var(--radius-panel)] border border-line bg-surface p-4 transition-colors hover:border-line-strong"
              >
                <dt className="text-sm text-muted">
                  {/* The whole tile is the link's target. */}
                  <Link href={t.href} className="after:absolute after:inset-0 hover:text-text">
                    {t.label}
                  </Link>
                </dt>
                <dd className="mt-1 font-display text-2xl font-semibold text-text tabular-nums">{t.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-subtle">
            Demos completed and no-shows count by the demo&apos;s date; the rest by when they arrived.
          </p>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Breakdown
              title="By kind"
              rows={data.by_kind}
              label={(k) => KIND_LABELS[k] ?? k}
              link={(k) => `/admin/enquiries?kind=${k}`}
            />
            <Breakdown
              title="By website"
              rows={data.by_product}
              label={(k) => PRODUCT_LABELS[k] ?? k}
              link={(k) => `/admin/enquiries?product=${k}`}
            />
            <Breakdown
              title="By follow-up status"
              rows={data.by_status}
              label={statusLabel}
              link={(k) => `/admin/enquiries?status=${k}`}
            />
          </div>
        </>
      )}
    </>
  );
}
