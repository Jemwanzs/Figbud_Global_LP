import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import type { SiteOption } from "@/components/admin/site-access-picker";
import { type TeamMember, TeamManager } from "@/components/admin/team-manager";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Team & access" };

export default function TeamPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Team />
    </Suspense>
  );
}

async function Team() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  if (user.role !== "owner") redirect("/admin/settings");
  const { data } = await adminGet<{ members: TeamMember[]; sites: SiteOption[] }>("team");
  if (!data) return <AdminUnavailable />;
  return (
    <AdminShell user={user} active="/admin/settings">
      <p className="text-sm text-subtle">
        <Link href="/admin/settings" className="hover:text-text">
          Settings
        </Link>{" "}
        / Team & access
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">Team & access</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Everyone has one Studio role. You can also limit people to selected websites, with a role on each
        that&apos;s never above their Studio role. Websites they can&apos;t access don&apos;t appear for them,
        and shared content (which reaches every website) needs access to all websites.
      </p>
      <div className="mt-10">
        <TeamManager members={data.members} sites={data.sites} me={user.id} />
      </div>
      <p className="mt-8 text-sm text-subtle">
        To add someone, create an invite from the{" "}
        <Link href="/admin" className="text-accent underline underline-offset-2">
          Overview
        </Link>
        ; you can choose their websites there too.
      </p>
    </AdminShell>
  );
}
