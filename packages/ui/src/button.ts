import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "product";
export type ButtonSize = "md" | "lg";

const base =
  "group/btn relative inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-medium " +
  "whitespace-nowrap transition-[background-color,color,box-shadow,transform,border-color] duration-200 " +
  "ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-[0_8px_28px_-10px_var(--glow)] hover:bg-accent-strong hover:shadow-[0_12px_36px_-10px_var(--glow)]",
  secondary:
    "border border-line-strong bg-surface/40 text-text backdrop-blur hover:border-accent/60 hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  product: "bg-product text-product-ink hover:brightness-110",
};

const sizes: Record<ButtonSize, string> = {
  md: "px-5 text-[0.95rem]",
  lg: "px-7 py-3 text-base",
};

/**
 * Framework-agnostic button styling, so the same look applies to `<button>`,
 * `<a>` and router links.
 */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(base, variants[variant], sizes[size], className);
}
