"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { adminFetch } from "@/lib/admin-client";

export function SignOutButton() {
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
          // A full page load: nothing from the signed-in Studio stays in memory, even hidden.
          window.location.replace("/admin/login");
        }
      }}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-60"
    >
      <LogOut aria-hidden className="size-4" />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
