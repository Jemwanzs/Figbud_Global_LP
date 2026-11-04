import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { type PayrollAdmin, PayrollStudio } from "@/components/admin/payroll-studio";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Payroll Calculator" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function PayrollCalculatorPage({
  params,
}: PageProps<"/admin/sites/[slug]/payroll-calculator">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Page params={params} />
    </Suspense>
  );
}

async function Page({ params }: Pick<PageProps<"/admin/sites/[slug]/payroll-calculator">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const state = await adminGet<PayrollAdmin>(`sites/${slug}/payroll-calculator`);
  if (state.status === 404) notFound();
  if (!state.data) return <AdminUnavailable />;
  const { name } = state.data.site;
  return (
    <AdminShell user={user} active="/admin/sites">
      <p className="text-sm text-subtle">
        <Link href="/admin/sites" className="hover:text-text">
          Websites
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}`} className="hover:text-text">
          {name}
        </Link>{" "}
        / Payroll Calculator
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">
        Payroll Calculator
      </h1>
      <p className="mt-2 max-w-3xl text-muted">
        A public salary estimate, gross to net and net to gross, separate from subscription pricing. The API
        does every calculation from the dated rules here. Visitors only ever see a published version, and only
        while the switch below is on.
      </p>
      <PayrollStudio key={state.data.draft_version} slug={slug} data={state.data} />
    </AdminShell>
  );
}
