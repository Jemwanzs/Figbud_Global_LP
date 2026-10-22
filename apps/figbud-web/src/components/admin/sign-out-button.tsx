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
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm text-muted transition-colors hover:border-line-strong hover:text-text"
    >
      <LogOut aria-hidden className="size-4" />
      Sign out
    </button>
  );
}
