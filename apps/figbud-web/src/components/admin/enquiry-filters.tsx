"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import { sameValue } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { KIND_LABELS, PRODUCT_LABELS } from "./enquiry-labels";

type Filters = { q: string; kind: string; product: string };

/** Inbox filters; Apply is enabled only when the choices differ from those applied. */
export function EnquiryFilters({
  status,
  applied,
}: {
  status?: string;
  applied: { q?: string; kind?: string; product?: string };
}) {
  const initial: Filters = { q: applied.q ?? "", kind: applied.kind ?? "", product: applied.product ?? "" };
  const [filters, setFilters] = useState(initial);
  const set = (key: keyof Filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const changed = !sameValue({ ...filters, q: filters.q.trim() }, initial);

  return (
    <form
      action="/admin/enquiries"
      className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
    >
      {status && <input type="hidden" name="status" value={status} />}
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
          value={filters.q}
          onChange={(e) => set("q")(e.target.value)}
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
        value={filters.kind}
        onChange={(e) => set("kind")(e.target.value)}
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
        value={filters.product}
        onChange={(e) => set("product")(e.target.value)}
        className="min-h-11 rounded-full border border-line-strong bg-surface px-4 text-text"
      >
        <option value="">All products</option>
        {Object.entries(PRODUCT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <ActionButton type="submit" variant="secondary" ready={changed}>
        Apply
      </ActionButton>
    </form>
  );
}
