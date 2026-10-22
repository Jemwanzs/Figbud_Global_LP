import { buttonClasses, cn } from "@figbud/ui";
import { ArrowLeft, ArrowRight, Download, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import {
  ENQUIRY_STATUSES,
  type EnquiryStatus,
  EnquiryStatusPill,
  KIND_LABELS,
  PRODUCT_LABELS,
} from "@/components/admin/enquiry-labels";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Enquiries" };

interface Row {
  id: string;
  reference: string;
  kind: string;
  product: string;
  name: string;
  email: string;
  company?: string;
  status: EnquiryStatus;
  created_at: string;
}

interface Page {
  items: Row[];
  page: number;
  total: number;
  total_pages: number;
}

const FILTERS = ["status", "kind", "product", "q"] as const;

export default function EnquiriesPage({ searchParams }: PageProps<"/admin/enquiries">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Enquiries searchParams={searchParams} />
    </Suspense>
  );
}

async function Enquiries({ searchParams }: Pick<PageProps<"/admin/enquiries">, "searchParams">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const query = await searchParams;
  const current: Record<string, string> = {};
  for (const key of FILTERS) {
    const value = query[key];
    if (typeof value === "string" && value.trim()) current[key] = value.trim().slice(0, 100);
  }
  const page = Math.max(1, Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1);
  const params = new URLSearchParams({ ...current, ...(page > 1 ? { page: String(page) } : {}) });
  const { data } = await adminGet<Page>(`enquiries${params.size ? `?${params}` : ""}`);
  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(current);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    return next.size ? `/admin/enquiries?${next}` : "/admin/enquiries";
  };
  const exportQuery = new URLSearchParams(current);

  return (
    <AdminShell user={user} active="/admin/enquiries">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Enquiries</h1>
          <p className="mt-2 text-muted">Demo requests, waitlist sign-ups and messages from the website.</p>
        </div>
        {user.role === "owner" && (
          <a
            href={`/admin/api/enquiries/export${exportQuery.size ? `?${exportQuery}` : ""}`}
            className={buttonClasses("secondary", "md")}
          >
            <Download aria-hidden className="size-4" />
            Export CSV
          </a>
        )}
      </div>

      <nav aria-label="Filter by status" className="mt-8">
        <ul className="flex flex-wrap gap-2">
          {[{ value: undefined, label: "All" }, ...ENQUIRY_STATUSES].map((s) => (
            <li key={s.label}>
              <Link
                href={href({ status: s.value, page: undefined })}
                aria-current={current.status === s.value ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-4 text-sm transition-colors",
                  current.status === s.value
                    ? "bg-accent font-medium text-accent-ink"
                    : "border border-line text-muted hover:border-line-strong hover:text-text",
                )}
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form
        action="/admin/enquiries"
        className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
      >
        {current.status && <input type="hidden" name="status" value={current.status} />}
        <div className="relative">
          <label htmlFor="enquiry-search" className="sr-only">
            Search by name, email, company or reference
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-subtle"
          />
          <input
            id="enquiry-search"
            type="search"
            name="q"
            defaultValue={current.q}
            placeholder="Name, email, company or reference"
            className="min-h-11 w-full rounded-full border border-line-strong bg-surface ps-11 pe-4 text-text placeholder:text-subtle"
          />
        </div>
        <label className="sr-only" htmlFor="enquiry-kind">
          Type
        </label>
        <select
          id="enquiry-kind"
          name="kind"
          defaultValue={current.kind ?? ""}
          className="min-h-11 rounded-full border border-line-strong bg-surface px-4 text-text"
        >
          <option value="">All types</option>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="enquiry-product">
          Product
        </label>
        <select
          id="enquiry-product"
          name="product"
          defaultValue={current.product ?? ""}
          className="min-h-11 rounded-full border border-line-strong bg-surface px-4 text-text"
        >
          <option value="">All products</option>
          {Object.entries(PRODUCT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClasses("secondary", "md")}>
          Apply
        </button>
      </form>

      {!data ? (
        <p className="mt-10 text-muted">Enquiries could not be loaded. Please try again.</p>
      ) : data.items.length === 0 ? (
        <div className="mt-10 rounded-[var(--radius-panel)] border border-dashed border-line-strong p-10 text-center">
          <p className="text-lg font-medium text-text">
            {Object.keys(current).length ? "No enquiries match" : "No enquiries yet"}
          </p>
          <p className="mt-2 text-muted">
            {Object.keys(current).length
              ? "Try another filter or search."
              : "Website enquiries appear here as soon as they arrive."}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-8 text-sm text-subtle" aria-live="polite">
            {data.total} {data.total === 1 ? "enquiry" : "enquiries"}
          </p>
          <ul className="mt-3 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
            {data.items.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/admin/enquiries/${row.id}`}
                  className="flex flex-col gap-2 p-5 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text">
                      {row.name}
                      {row.company && <span className="font-normal text-muted"> · {row.company}</span>}
                    </p>
                    <p className="mt-1 truncate text-sm text-subtle">
                      {KIND_LABELS[row.kind] ?? row.kind} · {PRODUCT_LABELS[row.product] ?? row.product} ·{" "}
                      <span className="font-mono">{row.reference}</span>
                    </p>
                  </div>
                  <EnquiryStatusPill status={row.status} />
                  <time dateTime={row.created_at} className="shrink-0 text-sm text-subtle">
                    {new Date(row.created_at).toUTCString().slice(5, 22)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
          {data.total_pages > 1 && (
            <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-4">
              {page > 1 ? (
                <Link
                  href={href({ page: String(page - 1) })}
                  rel="prev"
                  className={buttonClasses("secondary", "md")}
                >
                  <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <p className="text-sm text-subtle">
                Page {page} of {data.total_pages}
              </p>
              {page < data.total_pages ? (
                <Link
                  href={href({ page: String(page + 1) })}
                  rel="next"
                  className={buttonClasses("secondary", "md")}
                >
                  Next
                  <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </AdminShell>
  );
}
