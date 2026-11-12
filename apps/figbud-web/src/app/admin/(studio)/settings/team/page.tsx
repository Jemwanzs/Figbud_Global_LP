import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { StudioSkeleton } from "@/components/admin/studio-states";
import type { SiteOption } from "@/components/admin/site-access-picker";
import { type PendingInvite, PendingInvites } from "@/components/admin/pending-invites";
import { type SignInPolicyData, SignInPolicyEditor } from "@/components/admin/sign-in-policy";
import { type TeamMember, TeamManager } from "@/components/admin/team-manager";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Users & access" };

export default function TeamPage() {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Team />
    </Suspense>
  );
}

async function Team() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  if (user.role !== "owner") redirect("/admin/settings");
  const [{ data }, invites, policy] = await Promise.all([
    adminGet<{ members: TeamMember[]; sites: SiteOption[] }>("team"),
    adminGet<{ invites: PendingInvite[] }>("invites/pending"),
    adminGet<SignInPolicyData>("sign-in-policy"),
  ]);
  if (!data) return <AdminUnavailable />;
  return (
    <>
      <p className="text-sm text-subtle">
        <Link href="/admin/settings" className="hover:text-text">
          Settings
        </Link>{" "}
        / Users & access
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text">Users & access</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Everyone has one Studio role. You can also limit people to selected websites, with a role on each
        that&apos;s never above their Studio role. Websites they can&apos;t access don&apos;t appear for them,
        and shared content (which reaches every website) needs access to all websites. Suspending someone
        signs them out everywhere; the Studio always keeps at least one active owner, and changes to an owner
        need you to have confirmed it&apos;s you recently. Below, you can see and end anyone&apos;s sessions,
        and set how everyone signs in.
      </p>
      <div className="mt-10">
        <TeamManager members={data.members} sites={data.sites} me={user.id} />
      </div>
      <PendingInvites invites={invites.data?.invites ?? []} />
      {policy.data && (
        <div className="mt-12">
          <SignInPolicyEditor data={policy.data} />
        </div>
      )}
      <p className="mt-8 text-sm text-subtle">
        To add someone, create an invite from the{" "}
        <Link href="/admin" className="text-accent underline underline-offset-2">
          Overview
        </Link>
        ; you can choose their websites there too.
      </p>
    </>
  );
}
