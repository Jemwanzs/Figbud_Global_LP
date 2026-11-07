import { cn } from "./cn";

/*
 * One look for every text field, select and number input on the websites
 * (UI-TH5): theme-aware surface and border, a clear focus ring in the focus
 * colour (danger while invalid), and the same height as buttons' tap targets.
 */
const base =
  "fb-field block min-h-12 w-full rounded-xl border border-line-strong bg-bg/60 px-4 text-base text-text " +
  "placeholder:text-subtle transition-[border-color,box-shadow] duration-200 outline-none " +
  "hover:border-accent/40 focus-visible:border-accent " +
  "focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--focus)_40%,transparent)] " +
  "aria-[invalid=true]:border-danger " +
  "aria-[invalid=true]:focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--danger)_35%,transparent)] " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/** Framework-agnostic field styling; `className` adds spacing, width or type settings. */
export function fieldClasses(className?: string): string {
  return cn(base, className);
}
