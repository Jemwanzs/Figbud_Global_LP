import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { HeroStudio } from "@/components/admin/hero/hero-studio";
import type { HeroAdmin } from "@/components/admin/hero/hero-types";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Hero Design Studio" };

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export default function HeroStudioPage({ params }: PageProps<"/admin/sites/[slug]/hero">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Studio params={params} />
    </Suspense>
  );
}

async function Studio({ params }: Pick<PageProps<"/admin/sites/[slug]/hero">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 40) notFound();
  const { status, data } = await adminGet<HeroAdmin>(`sites/${slug}/hero`);
  if (status === 404) notFound();
  if (!data) return <AdminUnavailable />;
  return (
    <AdminShell user={user} active="/admin/sites">
      <p className="text-sm text-subtle">
        <Link href="/admin/sites" className="hover:text-text">
          Websites
        </Link>{" "}
        /{" "}
        <Link href={`/admin/sites/${slug}`} className="hover:text-text">
          {data.site.name}
        </Link>
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">
        {data.site.name}: Hero Design Studio
      </h1>
      <p className="mt-2 max-w-3xl text-muted">
        This website&apos;s hero designs, previewed exactly as visitors will see them. Edit, compare light and
        dark, and publish one; until then the website keeps its current hero.
      </p>
      <div className="mt-8">
        <HeroStudio data={data} isOwner={user.role === "owner"} />
      </div>
    </AdminShell>
  );
}
