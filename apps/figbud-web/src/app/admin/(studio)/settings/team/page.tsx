import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import { StudioSkeleton } from "@/components/admin/studio-states";
import type { SiteOption } from "@/components/admin/site-access-picker";
import { type ApprovalRulesData, ApprovalRules } from "@/components/admin/approval-rules";
import { InviteAdminForm } from "@/components/admin/invite-admin-form";
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
  const [{ data }, invites, policy, rules] = await Promise.all([
    adminGet<{ members: TeamMember[]; sites: SiteOption[] }>("team"),
    adminGet<{ invites: PendingInvite[] }>("invites/pending"),
    adminGet<SignInPolicyData>("sign-in-policy"),
    adminGet<ApprovalRulesData>("approval-rules"),
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
        set how everyone signs in, and decide who approves each kind of change.
      </p>
      {/* Add admin user (owner's brief, 13 Nov 2026): only owners create accounts, by invitation. */}
      <section aria-labelledby="add-admin" className="fb-panel mt-8 rounded-[var(--radius-panel)] p-5 sm:p-6">
        <h2 id="add-admin" className="font-display text-xl font-semibold text-text">
          Add admin user
        </h2>
        <p className="mt-1 mb-5 max-w-3xl text-sm text-muted">
          Choose their role, websites and Studio areas, then send them the single-use link privately. They set
          up their own passkey or password when they open it; nobody else ever sees their password.
        </p>
        <InviteAdminForm sites={data.sites} />
      </section>
      <div className="mt-10">
        <TeamManager members={data.members} sites={data.sites} me={user.id} />
      </div>
      <PendingInvites invites={invites.data?.invites ?? []} />
      {policy.data && (
        <div className="mt-12">
          <SignInPolicyEditor data={policy.data} />
        </div>
      )}
      {rules.data && (
        <div className="mt-8">
          <ApprovalRules data={rules.data} />
        </div>
      )}
    </>
  );
}
