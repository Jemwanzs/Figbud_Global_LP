"use client";

import { useDismiss } from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";

/**
 * The Studio's main navigation: one row of links on wide screens; below
 * `lg`, a menu button that opens the same links under the header (Escape,
 * an outside press or choosing a link closes it).
 */
export function AdminNav({
  items,
  active,
}: {
  items: readonly { href: string; label: string }[];
  active: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, open, () => setOpen(false));
  const link = (item: { href: string; label: string }, mobile: boolean) => (
    <Link
      href={item.href}
      aria-current={item.href === active ? "page" : undefined}
      onClick={() => setOpen(false)}
      className={cn(
        "relative inline-flex min-h-11 items-center rounded-full text-sm whitespace-nowrap transition-colors",
        mobile ? "w-full px-4" : "px-3",
        item.href === active
          ? "bg-surface-2 font-medium text-text"
          : "text-muted hover:bg-surface-2/60 hover:text-text",
      )}
    >
      {item.label}
    </Link>
  );
  return (
    <div ref={root} className="flex min-w-0 flex-1 items-center">
      <nav aria-label="Admin" className="hidden min-w-0 lg:block">
        <ul className="flex items-center gap-0.5">
          {items.map((item) => (
            <li key={item.href}>{link(item, false)}</li>
          ))}
        </ul>
      </nav>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="ms-auto inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text lg:hidden"
      >
        {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
        <span className="sr-only">{open ? "Close menu" : "Menu"}</span>
      </button>
      <nav
        id={panelId}
        aria-label="Admin"
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-line bg-bg px-5 pt-2 pb-4 shadow-[0_18px_40px_-24px_rgb(0_0_0/0.4)] sm:px-8 lg:hidden"
      >
        <ul className="mx-auto grid max-w-7xl gap-1 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.href}>{link(item, true)}</li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
