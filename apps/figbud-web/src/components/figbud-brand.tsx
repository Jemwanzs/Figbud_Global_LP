import { BrandLogo, hasLogo } from "@figbud/site-kit";
import { FigBudWordmark } from "@figbud/ui";

import { getBrands } from "@/lib/products";

/**
 * The FigBud Global identity for the admin area and utility pages: the
 * published official symbol on a dark tile beside the name. Falls back to the
 * built-in wordmark when no symbol is published.
 */
export async function FigBudBrand() {
  const symbol = (await getBrands()).figbud?.logos.symbol;
  if (!hasLogo(symbol)) return <FigBudWordmark />;
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-fb-ink shadow-[0_0_0_1px_rgb(34_197_94/0.35)]">
        {/* The name follows, so the symbol itself is decorative. */}
        <BrandLogo pair={symbol} on="dark" height={20} maxWidth={22} alt="" />
      </span>
      <span className="text-[1.15rem] leading-none font-semibold tracking-[-0.02em] whitespace-nowrap text-text">
        FigBud <span className="font-normal text-muted">Global</span>
      </span>
    </span>
  );
}
