"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { adminFetch } from "@/lib/admin-client";

/**
 * Keeps an open calculator on the latest prices (owner's brief, 14 Nov 2026):
 * while the page is visible it checks every 20 seconds (and on returning to
 * the tab) whether a newer draft was saved or a new version published, here
 * or in another tab or by someone else, and refreshes the prices in place:
 * the calculator keeps its inputs, and items no longer in the book drop out
 * of the selection. If the check fails, it says so with a retry.
 */
export function PricingRevisionWatcher({
  slug,
  draft,
  published,
}: {
  slug: string;
  draft: number;
  published: number;
}) {
  const router = useRouter();
  const known = useRef({ draft, published });
  const [notice, setNotice] = useState<"updated" | "failed" | null>(null);
  useEffect(() => {
    known.current = { draft, published };
  }, [draft, published]);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const latest = await adminFetch<{ draft_version: number; published_number: number }>(
          `sites/${slug}/pricing`,
        );
        if (stopped) return;
        if (
          latest.draft_version !== known.current.draft ||
          latest.published_number !== known.current.published
        ) {
          setNotice("updated");
          router.refresh();
        } else setNotice((n) => (n === "failed" ? null : n));
      } catch {
        if (!stopped) setNotice("failed");
      }
    };
    const timer = window.setInterval(check, 20_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [slug, router]);

  if (!notice) return null;
  return (
    <p
      role="status"
      data-revision-notice={notice}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-text"
    >
      {notice === "updated"
        ? "Prices updated to the latest saved version."
        : "Couldn't check for newer prices. These may be out of date."}
      <button
        type="button"
        onClick={() => {
          setNotice(null);
          router.refresh();
        }}
        className="font-medium text-accent underline underline-offset-2"
      >
        {notice === "updated" ? "OK" : "Refresh now"}
      </button>
    </p>
  );
}
