import type { ProductSlug } from "@figbud/brand";
import { cn } from "@figbud/ui";
import { Landmark, ReceiptText, UsersRound } from "lucide-react";

const icons = {
  zirahr: UsersRound,
  jasiri: Landmark,
  expense_now: ReceiptText,
} satisfies Record<ProductSlug, unknown>;

/** Product identity tile: the product's accent gradient with its symbol. */
export function ProductGlyph({
  slug,
  size = "md",
  className,
}: {
  slug: ProductSlug;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = icons[slug];
  return (
    <span
      data-product={slug}
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-product to-product-2 text-product-ink shadow-[0_6px_20px_-8px_var(--product)]",
        size === "sm" && "size-8 rounded-[10px]",
        size === "md" && "size-10 rounded-xl",
        size === "lg" && "size-12 rounded-[14px]",
        className,
      )}
    >
      <Icon className={cn(size === "sm" ? "size-4" : size === "md" ? "size-5" : "size-6")} strokeWidth={2} />
    </span>
  );
}
