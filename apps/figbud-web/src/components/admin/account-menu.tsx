"use client";

import { ThemeToggle, cn } from "@figbud/ui";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { type AdminUser, ROLE_LABELS } from "@/lib/admin-client";

import { SignOutButton } from "./sign-out-button";

/** "James Sammy" → "JS"; falls back to the email's first letter. */
function initials(user: Pick<AdminUser, "name" | "email">) {
  const letters = user.name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
  return (letters.length > 1 ? letters[0] + letters.at(-1) : letters || user.email[0]).toUpperCase();
}

/**
 * The signed-in admin: avatar, name and role, opening a panel with their
 * email and Sign out. A disclosure (not an ARIA menu): Escape or a click
 * outside closes it and focus returns to the button.
 */
export function AccountMenu({ user }: { user: AdminUser }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-full border py-1 ps-1 pe-3 text-start transition-colors",
          open ? "border-line-strong bg-surface" : "border-transparent hover:border-line hover:bg-surface",
        )}
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong"
        >
          {initials(user)}
        </span>
        <span className="hidden leading-tight xl:block">
          <span className="block max-w-40 truncate text-sm font-medium text-text">{user.name}</span>
          <span className="block text-xs text-subtle">{ROLE_LABELS[user.role]}</span>
        </span>
        <span className="sr-only xl:hidden">Account: {user.name}</span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 text-subtle transition-transform", open && "rotate-180")}
        />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute end-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-line bg-surface p-2 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.35)]"
      >
        <div className="px-3 pt-2 pb-3">
          <p className="truncate font-medium text-text">{user.name}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
          <p className="mt-2 inline-flex rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
            {ROLE_LABELS[user.role]}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5">
          <span className="text-sm text-muted">Appearance</span>
          <ThemeToggle labels={{ toLight: "Switch to light theme", toDark: "Switch to dark theme" }} />
        </div>
        <div className="border-t border-line pt-2">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
