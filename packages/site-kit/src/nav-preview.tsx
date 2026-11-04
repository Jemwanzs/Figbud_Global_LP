"use client";

import { InverseTheme, cn } from "@figbud/ui";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  ChartNoAxesColumn,
  Compass,
  Globe2,
  Layers,
  Lightbulb,
  type LucideIcon,
  MessageCircle,
  Phone,
  Rocket,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import type { NavPreviewContent, NavPreviewIcon } from "./brand";

const ICONS: Record<NavPreviewIcon, LucideIcon> = {
  sparkles: Sparkles,
  compass: Compass,
  "book-open": BookOpen,
  "message-circle": MessageCircle,
  building: Building2,
  users: Users,
  layers: Layers,
  rocket: Rocket,
  shield: ShieldCheck,
  chart: ChartNoAxesColumn,
  globe: Globe2,
  wallet: Wallet,
  calendar: Calendar,
  briefcase: Briefcase,
  phone: Phone,
  lightbulb: Lightbulb,
};

export const navPreviewIcon = (name: string): LucideIcon => ICONS[name as NavPreviewIcon] ?? Sparkles;

/** Long enough that crossing the menu doesn't flash cards, short enough to feel immediate. */
const OPEN_DELAY = 180;
const CLOSE_DELAY = 90;
const VIEWPORT_GAP = 12;

/** The card's contents, shared by the menu and the Studio's previews. */
export function NavPreviewCard({ content }: { content: NavPreviewContent }) {
  const Icon = navPreviewIcon(content.icon);
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong"
      >
        <Icon className="size-[1.125rem]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.95rem] leading-snug font-semibold text-text">{content.headline}</p>
        {content.description && <p className="mt-1 text-sm leading-snug text-muted">{content.description}</p>}
      </div>
      <ArrowRight
        aria-hidden
        className="fb-nav-preview-go mt-0.5 size-4 shrink-0 text-subtle rtl:rotate-180"
      />
    </div>
  );
}

/**
 * A floating preview under a plain menu link (UI-NAV2): on mouse hover after
 * a short delay and on keyboard focus, in the opposite theme, dismissed with
 * Escape. Touch never opens it. It adds no tab stop and never traps focus.
 * Clicking the link closes it at once; clicking the card follows the link.
 * Pass the link as `children`; with no `preview`, the link renders as it was.
 */
export function NavPreview({
  preview,
  children,
  className,
}: {
  preview?: NavPreviewContent | null;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);

  const clear = () => window.clearTimeout(timer.current);
  const schedule = useCallback((next: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), delay);
  }, []);
  useEffect(() => clear, []);

  // Describes the link for assistive technology; the card itself isn't focusable.
  useEffect(() => {
    const link = root.current?.querySelector("a");
    if (!link || !preview) return;
    link.setAttribute("aria-describedby", id);
    return () => link.removeAttribute("aria-describedby");
  }, [id, preview]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Stay on screen: measured with the shift removed, so it doesn't compound.
  useLayoutEffect(() => {
    const el = card.current;
    if (!open || !el) return;
    const rect = el.getBoundingClientRect();
    const centred = { left: rect.left - shift, right: rect.right - shift };
    const max = document.documentElement.clientWidth - VIEWPORT_GAP;
    const next =
      centred.left < VIEWPORT_GAP
        ? VIEWPORT_GAP - centred.left
        : centred.right > max
          ? max - centred.right
          : 0;
    if (next !== shift) setShift(next);
  }, [open, shift]);

  if (!preview) return <>{children}</>;

  return (
    <div
      ref={root}
      className={cn("relative", className)}
      onPointerEnter={(e) => e.pointerType === "mouse" && schedule(true, open ? 0 : OPEN_DELAY)}
      onPointerLeave={(e) => e.pointerType === "mouse" && schedule(false, CLOSE_DELAY)}
      onFocus={(e) => {
        // Keyboard only: a click focuses the link too, and shouldn't open anything.
        if (e.target.matches(":focus-visible")) {
          clear();
          setOpen(true);
        }
      }}
      onBlur={() => {
        clear();
        setOpen(false);
      }}
      onClickCapture={() => {
        clear();
        setOpen(false);
      }}
    >
      {children}
      {/* The transparent top edge bridges the gap, so moving down to the card keeps it open. */}
      <div
        ref={card}
        id={id}
        role="tooltip"
        hidden={!open}
        style={{ "--nav-shift": `${shift}px` } as React.CSSProperties}
        onClick={() => root.current?.querySelector("a")?.click()}
        className="fb-nav-preview absolute top-full left-1/2 z-50 w-[19rem] max-w-[calc(100vw-1.5rem)] cursor-pointer pt-2.5"
      >
        <InverseTheme className="fb-panel relative rounded-2xl border border-line p-3.5 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.45)]">
          <span
            aria-hidden
            className="fb-nav-preview-arrow absolute -top-[5px] left-1/2 size-2.5 rotate-45 rounded-[2px] border-t border-l border-line bg-surface"
          />
          <NavPreviewCard content={preview} />
        </InverseTheme>
      </div>
    </div>
  );
}
