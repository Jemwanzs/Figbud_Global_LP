import { cn } from "@figbud/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { FigBudBrand } from "@/components/figbud-brand";
import type { AdminUser } from "@/lib/admin-client";

import { AccountMenu } from "./account-menu";
import { AuthCard } from "./auth-card";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/sites", label: "Websites" },
  { href: "/admin/content", label: "Content" },
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
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3 sm:px-8">
          <Link href="/admin" className="flex shrink-0 items-center gap-3 rounded-lg py-1">
            <FigBudBrand />
            <span aria-hidden className="h-6 w-px bg-line-strong" />
            <span className="text-sm font-medium tracking-wide text-accent">Studio</span>
          </Link>
          <nav aria-label="Admin" className="order-last w-full sm:order-none sm:w-auto">
            <ul className="-mx-2 flex [scrollbar-width:none] gap-1 overflow-x-auto px-2">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={item.href === active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full px-3 text-sm whitespace-nowrap transition-colors sm:px-4",
                      item.href === active ? "bg-surface-2 text-text" : "text-muted hover:text-text",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ms-auto">
            <AccountMenu user={user} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12">{children}</main>
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
