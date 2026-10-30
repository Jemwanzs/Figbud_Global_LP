import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import type { SeoIntegrations, SeoSummary } from "@/components/admin/seo-workspace";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "SEO & search visibility" };

interface OverviewRow {
  site: string;
  name: string;
  primary_domain: string | null;
  indexing: boolean;
  summary: SeoSummary;
  integrations: SeoIntegrations;
}

export default function SeoOverviewPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { data } = await adminGet<{ sites: OverviewRow[] }>("seo");
  if (!data) return <AdminUnavailable />;
  const total = data.sites.reduce(
    (t, s) => ({
      pages: t.pages + s.summary.pages,
      errors: t.errors + s.summary.errors,
      warnings: t.warnings + s.summary.warnings,
    }),
    { pages: 0, errors: 0, warnings: 0 },
  );
  return (
    <AdminShell user={user} active="/admin/seo">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-text">
        SEO & search visibility
      </h1>
      <p className="mt-2 max-w-3xl text-muted">
        Every website&apos;s search health from its published Studio pages, and what&apos;s connected. Search
        Console data (indexing, queries, impressions, clicks) appears once connected; nothing here is
        estimated. The corporate site&apos;s built-in pages are also checked automatically on every release.
      </p>
      <dl className="mt-8 grid grid-cols-3 gap-3 sm:max-w-xl">
        {(
          [
            ["Live Studio pages", total.pages],
            ["To fix", total.errors],
            ["To improve", total.warnings],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 font-display text-2xl font-semibold text-text tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Search health by website</caption>
          <thead className="text-subtle">
            <tr className="border-b border-line">
              {[
                "Website",
                "Indexing",
                "Live pages",
                "In search",
                "To fix",
                "To improve",
                "Search Console",
              ].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`px-4 py-2.5 font-medium ${i === 0 ? "text-start" : "text-end"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.sites.map((s) => (
              <tr key={s.site}>
                <th scope="row" className="px-4 py-3 text-start font-medium">
                  <Link href={`/admin/sites/${s.site}/seo`} className="text-text hover:text-accent">
                    {s.name}
                  </Link>
                  {s.primary_domain && (
                    <span className="block text-xs font-normal text-subtle">{s.primary_domain}</span>
                  )}
                </th>
                <td className="px-4 py-3 text-end">{s.indexing ? "On" : "Off"}</td>
                <td className="px-4 py-3 text-end tabular-nums">{s.summary.pages}</td>
                <td className="px-4 py-3 text-end tabular-nums">{s.summary.indexable}</td>
                <td className="px-4 py-3 text-end tabular-nums">{s.summary.errors}</td>
                <td className="px-4 py-3 text-end tabular-nums">{s.summary.warnings}</td>
                <td className="px-4 py-3 text-end text-muted">
                  {s.integrations.search_console.verification_tag ? "Tag published" : "Not verified"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
