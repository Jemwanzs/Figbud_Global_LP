"use client";

import dynamic from "next/dynamic";

/*
 * Blocks only some pages show, loaded only where they appear (P2-18). The
 * product-site route can render every block, so without this each page
 * downloaded the forms (with their phone-number rules) and the pricing
 * calculator. Server-rendered as before: their HTML is in the page, and
 * their code arrives only on pages that render them.
 */
export const LazyEnquiryForm = dynamic(() => import("./enquiry-form").then((m) => m.EnquiryForm));
export const LazyReferralForm = dynamic(() => import("./referral-form").then((m) => m.ReferralForm));
export const LazyPublicPricing = dynamic(() => import("./public-pricing").then((m) => m.PublicPricing));
export const LazyComingSoon = dynamic(() => import("./coming-soon").then((m) => m.ComingSoon));
// The product demonstrations (every kind, with the scroll stories) and the
// module tour: only pages that show one download them (P2-18).
export const LazyProductDemo = dynamic(() => import("./product-demos").then((m) => m.ProductDemo));
export const LazyModuleCatalogue = dynamic(() => import("./product-demos").then((m) => m.ModuleCatalogue));
// A designed hero shows only on a website's home page (server-rendered as
// before, so the first paint doesn't wait for it).
export const LazyProductHero = dynamic(() => import("./product-heroes").then((m) => m.ProductHero));
