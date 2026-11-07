import { type ReactNode, Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import type { AdminSite } from "@/components/admin/site-labels";
import { StudioShell } from "@/components/admin/studio-shell";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { FigBudBrand } from "@/components/figbud-brand";
import { adminGet, requireAdmin } from "@/lib/admin-server";

/**
 * Every signed-in Studio page shares this layout, so the top bar and sidebar
 * stay mounted between pages and only the content changes (no blank screen
 * while the next page loads). Pages still check the session themselves.
 */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<StudioFallback />}>
      <SignedIn>{children}</SignedIn>
    </Suspense>
  );
}

async function SignedIn({ children }: { children: ReactNode }) {
  const [user, sites] = await Promise.all([requireAdmin(), adminGet<AdminSite[]>("sites")]);
  if (user === "unavailable") return <AdminUnavailable standalone />;
  const listed = (sites.data ?? [])
    .filter((s) => !s.archived_at)
    .map(({ slug, name, kind, status }) => ({ slug, name, kind, status }));
  return (
    <StudioShell user={user} sites={listed} brand={<FigBudBrand />}>
      {children}
    </StudioShell>
  );
}

/** First load only: the shell's outline while the session is checked. */
function StudioFallback() {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="h-16 border-b border-line" />
      <div className="flex">
        <div className="hidden h-[calc(100dvh-4rem)] w-64 shrink-0 border-e border-line bg-bg-elevated lg:block" />
        <div className="mx-auto max-w-7xl min-w-0 flex-1 px-5 py-8 sm:px-8 sm:py-10">
          <StudioSkeleton />
        </div>
      </div>
    </div>
  );
}
