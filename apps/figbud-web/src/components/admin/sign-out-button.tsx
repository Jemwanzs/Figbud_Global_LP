"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminFetch } from "@/lib/admin-client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await adminFetch("logout", {});
        } finally {
          router.replace("/admin/login");
          router.refresh();
        }
      }}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-60"
    >
      <LogOut aria-hidden className="size-4" />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
