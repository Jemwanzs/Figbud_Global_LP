"use client";

import { cn } from "@figbud/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";

import { ActionButton } from "./action-button";
import { type CampaignList, type CampaignStatus, KIND_LABELS, STATUS_LABELS, ctr } from "./campaign-types";
import { LocalTime } from "./local-time";

const STATUSES = Object.keys(STATUS_LABELS) as CampaignStatus[];

/** Marketing → Campaigns & Promotions: overview, filters, list and a way to start one. */
export function CampaignsOverview({ data }: { data: CampaignList }) {
  const router = useRouter();
  const uid = useId();
  const creatable = data.sites.filter((s) => s.can_create);
  const [site, setSite] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [name, setName] = useState("");
  const [newSite, setNewSite] = useState(creatable[0]?.site ?? "");
  const [newKind, setNewKind] = useState("hero");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(
    () =>
      data.items.filter(
        (c) => (!site || c.site === site) && (!kind || c.kind === kind) && (!status || c.status === status),
      ),
    [data.items, site, kind, status],
  );
  const count = (s: CampaignStatus) => data.items.filter((c) => c.status === s).length;
  const totals = data.items.reduce(
    (t, c) => ({
      impressions: t.impressions + c.stats.impressions,
      clicks: t.clicks + c.stats.clicks,
      dismissals: t.dismissals + c.stats.dismissals,
      conversions: t.conversions + c.stats.conversions,
      entries: t.entries + c.stats.entries,
    }),
    { impressions: 0, clicks: 0, dismissals: 0, conversions: 0, entries: 0 },
  );
  const bySite = data.sites
    .map((s) => {
      const own = data.items.filter((c) => c.site === s.site);
      return {
        ...s,
        live: own.filter((c) => c.status === "live").length,
        impressions: own.reduce((n, c) => n + c.stats.impressions, 0),
        clicks: own.reduce((n, c) => n + c.stats.clicks, 0),
        conversions: own.reduce((n, c) => n + c.stats.conversions, 0),
      };
    })
    .filter((s) => s.impressions || s.live || data.items.some((c) => c.site === s.site));

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const created = await adminFetch<{ id: string }>("campaigns", { site: newSite, name, kind: newKind });
      router.push(`/admin/marketing/${created.id}`);
    } catch (err) {
      setError(err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.");
      setBusy(false);
    }
  }

  const select = "min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text";

  return (
    <div className="space-y-10">
      <section aria-labelledby={`${uid}-glance`}>
        <h2 id={`${uid}-glance`} className="sr-only">
          At a glance
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["Campaigns", data.items.filter((c) => c.status !== "archived").length],
              ["Live", count("live")],
              ["Scheduled", count("scheduled")],
              ["Awaiting approval", data.items.filter((c) => c.pending).length],
              ["Completed", count("completed")],
              ["Reward claims", totals.entries],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-line bg-surface p-4">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-semibold text-text tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4 text-sm">
          <p className="text-muted">
            Recorded on websites (daily counts, no personal data):{" "}
            <span className="text-text tabular-nums">{totals.impressions}</span> impressions ·{" "}
            <span className="text-text tabular-nums">{totals.clicks}</span> clicks ·{" "}
            <span className="text-text tabular-nums">{ctr(totals)}</span> click-through ·{" "}
            <span className="text-text tabular-nums">{totals.conversions}</span> conversions (enquiries and
            reward claims from a campaign).
          </p>
        </div>
        {bySite.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">Performance by website</caption>
              <thead className="text-start text-subtle">
                <tr className="border-b border-line">
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">
                    Website
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium">
                    Live
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium">
                    Impressions
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium">
                    Clicks
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium">
                    Conversions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {bySite.map((s) => (
                  <tr key={s.site}>
                    <th scope="row" className="px-4 py-2.5 text-start font-medium text-text">
                      {s.name}
                    </th>
                    <td className="px-4 py-2.5 text-end tabular-nums">{s.live}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{s.impressions}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{s.clicks}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{s.conversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creatable.length > 0 && (
        <section aria-labelledby={`${uid}-new`} className="fb-panel rounded-[var(--radius-panel)] p-6 sm:p-8">
          <h2 id={`${uid}-new`} className="font-semibold text-text">
            Create campaign
          </h2>
          <p className="mt-1 text-sm text-muted">
            Every campaign belongs to one website and starts as a draft from a template for its type.
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && newSite) void create();
            }}
            className="mt-5 grid gap-4 md:grid-cols-[1fr_14rem_16rem_auto] md:items-end"
          >
            <label className="block text-sm font-medium text-text">
              Campaign name
              <input
                value={name}
                maxLength={120}
                placeholder="For example: ZiraHR year-end demo week"
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 font-normal"
              />
            </label>
            <label className="block text-sm font-medium text-text">
              Website
              <select
                value={newSite}
                onChange={(e) => setNewSite(e.target.value)}
                className={cn(select, "mt-1.5 w-full font-normal")}
              >
                {creatable.map((s) => (
                  <option key={s.site} value={s.site}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-text">
              Type
              <select
                value={newKind}
                onChange={(e) => setNewKind(e.target.value)}
                className={cn(select, "mt-1.5 w-full font-normal")}
              >
                {data.kinds.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]?.label ?? k}
                  </option>
                ))}
              </select>
            </label>
            <ActionButton
              type="submit"
              ready={Boolean(name.trim() && newSite)}
              busy={busy}
              hint="Name it first"
              icon={<Plus aria-hidden className="size-4" />}
            >
              Create
            </ActionButton>
          </form>
          <p className="mt-2 text-xs text-subtle">{KIND_LABELS[newKind]?.hint}</p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby={`${uid}-list`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id={`${uid}-list`} className="font-semibold text-text">
            Campaigns <span className="font-normal text-subtle">· {items.length}</span>
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
            <select
              aria-label="Website"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              className={select}
            >
              <option value="">All websites</option>
              {data.sites.map((s) => (
                <option key={s.site} value={s.site}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Type"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className={select}
            >
              <option value="">All types</option>
              {data.kinds.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]?.label ?? k}
                </option>
              ))}
            </select>
            <select
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={select}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s].label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line-strong p-10 text-center text-muted">
            {data.items.length ? "No campaigns match these filters." : "No campaigns yet. Create one above."}
          </p>
        ) : (
          <ul
            className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface"
            aria-label="Campaigns"
          >
            {items.map((c) => (
              <li key={c.id} className="grid gap-x-4 gap-y-1.5 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/marketing/${c.id}`}
                      className="font-medium text-text hover:text-accent"
                    >
                      {c.name}
                    </Link>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs", STATUS_LABELS[c.status].tone)}>
                      {STATUS_LABELS[c.status].label}
                    </span>
                    {c.pending && (
                      <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs text-text">
                        Awaiting approval
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {c.site_name} · {KIND_LABELS[c.kind]?.label ?? c.kind} ·{" "}
                    <span className="font-mono">{c.reference}</span>
                    {c.ends_at && (
                      <>
                        {" · ends "}
                        <LocalTime iso={c.ends_at} />
                      </>
                    )}
                  </p>
                </div>
                <p className="text-sm text-muted tabular-nums">
                  {c.stats.impressions} impressions · {c.stats.clicks} clicks · {ctr(c.stats)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
