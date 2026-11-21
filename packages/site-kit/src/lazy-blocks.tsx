"use client";

import dynamic from "next/dynamic";
import { type ComponentType, Suspense, lazy } from "react";

/**
 * Like `dynamic`, without its preload hint. For the forms and the Coming
 * Soon page, Turbopack's loadable manifest named a chunk it never wrote
 * (Next 16.4), so every page with one asked for a missing file: a 404 and a
 * console error (Lighthouse best practices 96, 21 Nov 2026). `React.lazy`
 * server-renders the same HTML and splits the code the same way (the
 * browser's own `import()`); the server HTML stays in place until the code
 * arrives.
 */
function lazyBlock<P extends object>(load: () => Promise<ComponentType<P>>) {
  const Lazy = lazy(() => load().then((component) => ({ default: component })));
  function LazyBlock(props: P) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return LazyBlock;
}

/*
 * Blocks only some pages show, loaded only where they appear (P2-18). The
 * product-site route can render every block, so without this each page
 * downloaded the forms (with their phone-number rules) and the pricing
 * calculator. Server-rendered as before: their HTML is in the page, and
 * their code arrives only on pages that render them.
 */
export const LazyEnquiryForm = lazyBlock(() => import("./enquiry-form").then((m) => m.EnquiryForm));
export const LazyReferralForm = lazyBlock(() => import("./referral-form").then((m) => m.ReferralForm));
export const LazyPublicPricing = dynamic(() => import("./public-pricing").then((m) => m.PublicPricing));
export const LazyComingSoon = lazyBlock(() => import("./coming-soon").then((m) => m.ComingSoon));
// The product demonstrations (every kind, with the scroll stories) and the
// module tour: only pages that show one download them (P2-18).
export const LazyProductDemo = dynamic(() => import("./product-demos").then((m) => m.ProductDemo));
export const LazyModuleCatalogue = dynamic(() => import("./product-demos").then((m) => m.ModuleCatalogue));
// A designed hero shows only on a website's home page (server-rendered as
// before, so the first paint doesn't wait for it).
export const LazyProductHero = dynamic(() => import("./product-heroes").then((m) => m.ProductHero));
// An FAQ's product visual (P14-W5): only pages whose FAQ has one download it.
export const LazyFaqShowcase = dynamic(() => import("./faq-showcase").then((m) => m.FaqShowcase));
// The Results carousel (P10-R1): only websites that choose it download it.
export const LazyResultsCarousel = dynamic(() => import("./results-carousel").then((m) => m.ResultsCarousel));
// Self-service on each device (P14-W6): only heroes with device screenshots download it.
export const LazyDevicePreview = dynamic(() => import("./device-preview").then((m) => m.DevicePreview));
