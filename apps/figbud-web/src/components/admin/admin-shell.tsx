import { cn } from "@figbud/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { FigBudBrand } from "@/components/figbud-brand";
import { type AdminUser, ROLE_LABELS } from "@/lib/admin-client";

import { AuthCard } from "./auth-card";
import { SignOutButton } from "./sign-out-button";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/sites", label: "Websites" },
  { href: "/admin/insights", label: "Insights" },
  { href: "/admin/enquiries", label: "Enquiries" },
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
          <Link href="/admin" className="flex items-center gap-3 rounded-lg">
            <FigBudBrand />
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-subtle">Admin</span>
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
          <div className="ms-auto flex items-center gap-3">
            <p className="hidden text-end text-sm leading-tight md:block">
              <span className="block text-text">{user.name}</span>
              <span className="text-subtle">{ROLE_LABELS[user.role]}</span>
            </p>
            <SignOutButton />
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
