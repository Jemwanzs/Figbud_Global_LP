import { cn } from "@figbud/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { type AvailabilityData, DemoAvailabilityEditor } from "@/components/admin/demo-availability";
import type { AdminSite } from "@/components/admin/site-labels";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Demo availability" };

export default function AvailabilityPage({ searchParams }: PageProps<"/admin/enquiries/availability">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Availability searchParams={searchParams} />
    </Suspense>
  );
}

async function Availability({
  searchParams,
}: Pick<PageProps<"/admin/enquiries/availability">, "searchParams">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { data: sites } = await adminGet<AdminSite[]>("sites");
  const live = (sites ?? []).filter((s) => !s.archived_at);
  const query = await searchParams;
  const asked = typeof query.site === "string" ? query.site : "";
  const site = live.find((s) => s.slug === asked) ?? live.find((s) => s.slug === "zirahr") ?? live[0];
  const { data } = site
    ? await adminGet<AvailabilityData>(`enquiries/availability/${site.slug}`)
    : { data: undefined };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Demo availability</h1>
          <p className="mt-2 max-w-2xl text-muted">
            When each website takes demo bookings. Visitors see only times that are still free; two people can
            never book the same time. Booking stays off until you turn it on.
          </p>
        </div>
        <Link href="/admin/enquiries/bookings" className="text-sm font-medium text-accent-strong underline">
          Demo bookings
        </Link>
      </div>
      <nav aria-label="Website" className="mt-8">
        <ul className="flex flex-wrap gap-2">
          {live.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/admin/enquiries/availability?site=${s.slug}`}
                aria-current={site?.slug === s.slug ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-4 text-sm transition-colors",
                  site?.slug === s.slug
                    ? "bg-accent font-medium text-accent-ink"
                    : "border border-line text-muted hover:border-line-strong hover:text-text",
                )}
              >
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {!site || !data ? (
        <p className="mt-10 text-muted">Availability could not be loaded. Please try again.</p>
      ) : (
        <DemoAvailabilityEditor key={site.slug} slug={site.slug} name={site.name} data={data} />
      )}
    </>
  );
}
