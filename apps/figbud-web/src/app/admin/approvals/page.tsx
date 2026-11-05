import { buttonClasses, cn } from "@figbud/ui";
import { ArrowRight, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Approvals" };

export interface ApprovalItem {
  kind: string;
  id: string;
  parent: string;
  sites: { slug: string; name: string }[];
  title: string;
  note: string;
  requested_by?: string | null;
  requested_at: string;
  mine: boolean;
  can_decide: boolean;
}

const KIND_LABELS: Record<string, string> = {
  page: "Page",
  brand: "Brand",
  site_status: "Website status",
  hero: "Hero design",
  pricing: "Pricing",
  payroll: "Payroll Calculator",
  campaign: "Campaign",
  proof: "Customer proof",
  article: "Article",
};

/** The screen where each kind of request is previewed and decided. */
function reviewHref(item: ApprovalItem): string {
  const site = item.sites[0]?.slug ?? "figbud";
  switch (item.kind) {
    case "page":
      return `/admin/sites/${site}/pages/${item.parent}`;
    case "brand":
      return `/admin/sites/${site}/brand`;
    case "hero":
      return `/admin/sites/${site}/hero`;
    case "pricing":
      return `/admin/sites/${site}/pricing`;
    case "payroll":
      return `/admin/sites/${site}/payroll-calculator`;
    case "campaign":
      return `/admin/marketing/${item.parent}`;
    case "proof":
      return `/admin/proof/${item.parent}`;
    case "article":
      return `/admin/insights/${item.parent}`;
    default:
      return `/admin/sites/${site}`;
  }
}

export default function ApprovalsPage({ searchParams }: PageProps<"/admin/approvals">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Approvals searchParams={searchParams} />
    </Suspense>
  );
}

async function Approvals({ searchParams }: Pick<PageProps<"/admin/approvals">, "searchParams">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const query = await searchParams;
  const { data } = await adminGet<{ items: ApprovalItem[]; waiting_for_you: number }>("approvals");
  if (!data) return <AdminUnavailable />;

  // Websites with something waiting, each offered once.
  const websites = new Map<string, string>();
  for (const item of data.items) for (const site of item.sites) websites.set(site.slug, site.name);
  const chosen = typeof query.site === "string" && websites.has(query.site) ? query.site : null;
  const shown = chosen ? data.items.filter((i) => i.sites.some((s) => s.slug === chosen)) : data.items;
  const yours = shown.filter((i) => i.can_decide);
  const others = shown.filter((i) => !i.can_decide);

  return (
    <AdminShell user={user} active="/admin/approvals">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-text sm:text-4xl">Approvals</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Everything waiting for a second person, across every website you can see. Open an item to preview and
        decide it.
      </p>

      {websites.size > 1 && (
        <nav aria-label="Filter by website" className="mt-6 flex flex-wrap gap-2">
          <FilterLink href="/admin/approvals" current={chosen === null} label="All websites" />
          {[...websites].map(([slug, name]) => (
            <FilterLink
              key={slug}
              href={`/admin/approvals?site=${encodeURIComponent(slug)}`}
              current={chosen === slug}
              label={name}
            />
          ))}
        </nav>
      )}

      {data.items.length === 0 ? (
        <div className="fb-panel mt-8 rounded-[var(--radius-panel)] p-8 text-center">
          <CircleCheck aria-hidden className="mx-auto size-8 text-success" />
          <p className="mt-3 font-semibold text-text">Nothing is waiting for approval</p>
          <p className="mt-1 text-sm text-muted">New requests appear here as soon as someone asks.</p>
        </div>
      ) : (
        <>
          <Group
            id="yours"
            title="Waiting for you"
            empty="Nothing here needs your decision."
            items={yours}
            action="Review"
          />
          {others.length > 0 && (
            <Group
              id="others"
              title="Waiting for someone else"
              lead="You asked for these, or they need someone with a reviewer role."
              items={others}
              action="Open"
            />
          )}
        </>
      )}
    </AdminShell>
  );
}

function FilterLink({ href, current, label }: { href: string; current: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={current ? "true" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors",
        current
          ? "border-accent bg-accent-soft font-medium text-text"
          : "border-line text-muted hover:border-line-strong hover:text-text",
      )}
    >
      {label}
    </Link>
  );
}

function Group({
  id,
  title,
  lead,
  empty,
  items,
  action,
}: {
  id: string;
  title: string;
  lead?: string;
  empty?: string;
  items: ApprovalItem[];
  action: string;
}) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-lg font-semibold text-text">
        {title} <span className="font-normal text-muted">({items.length})</span>
      </h2>
      {lead && <p className="mt-1 text-sm text-muted">{lead}</p>}
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium tracking-wide text-accent uppercase">
                  {KIND_LABELS[item.kind] ?? item.kind}
                </p>
                <p className="mt-1 font-semibold break-words text-text">{item.title || "Untitled"}</p>
                {item.note && <p className="mt-1 text-sm break-words text-muted">{item.note}</p>}
                <p className="mt-2 text-sm text-subtle">
                  {item.sites.map((s) => s.name).join(", ")} ·{" "}
                  {item.mine ? "You asked" : (item.requested_by ?? "Someone")} ·{" "}
                  <time dateTime={item.requested_at}>
                    {new Date(item.requested_at).toUTCString().slice(5, 22)} UTC
                  </time>
                </p>
              </div>
              <Link
                href={reviewHref(item) as "/admin"}
                aria-label={`${action}: ${item.title || KIND_LABELS[item.kind]}`}
                className={buttonClasses(
                  item.can_decide ? "primary" : "secondary",
                  "md",
                  "w-full shrink-0 sm:w-auto",
                )}
              >
                {action}
                <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
