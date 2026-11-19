"use client";

import { type Locale, leadCopy, locales } from "@figbud/i18n";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";

import type { EnquiryProduct } from "./enquiry";
import type { LeadAction, LeadCopy } from "./lead-dialogs";

/** Button actions any website's buttons can take instead of a link (P8-M8). */
export const CTA_ACTION_HREFS = { "start-now": "#start-now", "book-demo": "#book-demo" } as const;

/** The dialog's code loads only when someone opens one. */
const LeadDialog = lazy(() => import("./lead-dialogs").then((m) => ({ default: m.LeadDialog })));

/** The page's language, as the page set it on the document (P7-L2b); English otherwise. */
function pageLocale(): Locale {
  const tag = document.documentElement.lang.toLowerCase();
  return locales.find((l) => tag === l || tag.startsWith(`${l}-`)) ?? "en";
}

export function actionOf(href: string | null | undefined): LeadAction | null {
  if (!href) return null;
  const hash = href.slice(href.indexOf("#"));
  return hash === "#start-now" ? "start-now" : hash === "#book-demo" ? "book-demo" : null;
}

/**
 * The one place button actions are carried out (owner's brief, 18 Nov 2026):
 * any link on the page to `#start-now` or `#book-demo` (header, hero, page
 * sections, campaigns, footer) opens Start Now or demo booking in place,
 * and so does arriving with either in the address. Links stay links, so
 * they work with the keyboard and before scripts load (they go to the top
 * of the page until then).
 */
export function CtaActions({
  apiOrigin,
  product,
  productName,
  privacyHref,
  demoFallbackHref,
  locale,
  copy,
}: {
  apiOrigin: string;
  product: EnquiryProduct;
  productName: string;
  privacyHref: string;
  demoFallbackHref: string;
  locale?: string;
  copy?: Partial<LeadCopy>;
}) {
  const [open, setOpen] = useState<{ action: LeadAction; campaign?: string; locale: Locale } | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      const action = actionOf(link?.getAttribute("href"));
      if (!link || !action) return;
      event.preventDefault();
      opener.current = link as HTMLElement;
      setOpen({ action, campaign: link.getAttribute("data-campaign") ?? undefined, locale: pageLocale() });
    };
    document.addEventListener("click", onClick);
    const fromAddress = actionOf(window.location.hash);
    if (fromAddress) setOpen({ action: fromAddress, locale: pageLocale() });
    return () => document.removeEventListener("click", onClick);
  }, []);

  const close = useCallback(() => {
    setOpen(null);
    if (actionOf(window.location.hash)) {
      history.replaceState(history.state, "", window.location.pathname + window.location.search);
    }
    opener.current?.focus();
  }, []);

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <LeadDialog
        key={open.action}
        action={open.action}
        onClose={close}
        apiOrigin={apiOrigin}
        product={product}
        productName={productName}
        privacyHref={privacyHref}
        demoFallbackHref={demoFallbackHref}
        campaign={open.campaign}
        locale={locale ?? open.locale}
        // The page's language, over any wording the website passes for English.
        copy={open.locale === "en" ? copy : { ...leadCopy[open.locale], ...copy }}
      />
    </Suspense>
  );
}
