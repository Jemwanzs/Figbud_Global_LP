import Link from "next/link";
import type { ReactNode } from "react";

import { FigBudBrand } from "@/components/figbud-brand";
import type { AdminUser } from "@/lib/admin-client";

import { AccountMenu } from "./account-menu";
import { AdminNav } from "./admin-nav";
import { AuthCard } from "./auth-card";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/sites", label: "Websites" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/marketing", label: "Marketing" },
  { href: "/admin/seo", label: "SEO" },
  { href: "/admin/insights", label: "Insights" },
  { href: "/admin/enquiries", label: "Enquiries" },
  { href: "/admin/settings", label: "Settings" },
] as const;

/** Header and navigation shared by every signed-in admin page. */
export function AdminShell({
  user,
  active,
  children,
}: {
  user: AdminUser;
  active: (typeof NAV)[number]["href"];
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      {/* One compact row that stays visible while scrolling; below lg the links
          move into a menu so nothing wraps onto a second row. */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md print:hidden">
        <div className="relative mx-auto flex h-16 max-w-7xl items-center gap-3 px-5 sm:px-8 lg:gap-5">
          <Link href="/admin" className="flex shrink-0 items-center gap-3 rounded-lg py-1">
            <FigBudBrand />
            <span aria-hidden className="h-6 w-px bg-line-strong" />
            <span className="text-sm font-medium tracking-wide text-accent">Studio</span>
          </Link>
          <AdminNav items={NAV} active={active} />
          <div className="shrink-0">
            <AccountMenu user={user} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}

export function AdminUnavailable() {
  return (
    <AuthCard
      title="Admin is temporarily unavailable"
      lead="We couldn't reach the admin service. Please try again in a moment."
    >
      <Link href="/admin" className="font-medium text-accent hover:underline">
        Try again
      </Link>
    </AuthCard>
  );
}
