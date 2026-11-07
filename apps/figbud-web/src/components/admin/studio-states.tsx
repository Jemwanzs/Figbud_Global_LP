"use client";

import { buttonClasses } from "@figbud/ui";
import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Loading placeholder for a Studio page while its data arrives: the shell
 * stays put and only the content area shows the page's outline.
 */
export function StudioSkeleton() {
  return (
    <div role="status" aria-busy="true" className="fb-skeleton-fade" data-studio-skeleton="">
      <span className="sr-only">Loading…</span>
      <div aria-hidden className="fb-skeleton-pulse">
        <div className="fb-skeleton h-4 w-40 rounded-full" />
        <div className="fb-skeleton mt-4 h-9 w-72 max-w-full rounded-xl" />
        <div className="fb-skeleton mt-3 h-4 w-[28rem] max-w-full rounded-full" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="fb-panel rounded-[var(--radius-card)] p-5">
              <div className="fb-skeleton h-4 w-24 rounded-full" />
              <div className="fb-skeleton mt-4 h-7 w-32 rounded-lg" />
              <div className="fb-skeleton mt-3 h-3 w-full rounded-full" />
            </div>
          ))}
        </div>
        <div className="fb-panel mt-6 rounded-[var(--radius-panel)] p-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 border-b border-line py-3 last:border-0">
              <div className="fb-skeleton size-8 shrink-0 rounded-lg" />
              <div className="fb-skeleton h-3 flex-1 rounded-full" />
              <div className="fb-skeleton h-3 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A section that couldn't load, inside the shell: say so, offer a retry and a way out. */
export function StudioProblem({
  title,
  lead,
  onRetry,
}: {
  title: string;
  lead: string;
  onRetry?: () => void;
}) {
  const router = useRouter();
  return (
    <div role="alert" className="fb-panel mx-auto mt-6 max-w-xl rounded-[var(--radius-panel)] p-7 sm:p-9">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-text">{title}</h1>
      <p className="mt-2 leading-relaxed text-muted">{lead}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => (onRetry ? onRetry() : router.refresh())}
          className={buttonClasses("primary", "md")}
        >
          <RotateCw aria-hidden className="size-4" />
          Try again
        </button>
        <Link href="/admin" className={buttonClasses("secondary", "md")}>
          Go to the overview
        </Link>
      </div>
    </div>
  );
}
