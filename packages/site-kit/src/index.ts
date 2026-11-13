// Page-specific modules (forms, Coming Soon, the payroll calculator, public
// pricing, phone rules) have their own import paths, e.g.
// `@figbud/site-kit/enquiry-form`, so pages that don't show them don't
// download them (P2-18); blocks load them through `lazy-blocks`.
// Client-safe entry. Server-only pieces: `@figbud/site-kit/footer` (cached
// year) and `@figbud/site-kit/server` (next.config.ts, proxy.ts).
export * from "./brand";
export * from "./nav-preview";
// Demonstrations and the module tour load lazily (`lazy-blocks`): types only here (P2-18).
export type { DemoKind, ModuleItem } from "./product-demos";
export type { StoryMotion } from "./scroll-story";
export * from "./blocks";
export * from "./brand-logo";
export * from "./campaigns";
export * from "./consent";
export * from "./footer-layout";
export * from "./section-themes";
export * from "./site-theme";
export * from "./seo";
export * from "./cross-site";
export * from "./language-switcher";
export * from "./product-glyph";
export * from "./privacy";
export * from "./proof";
export * from "./pricing";
export * from "./lazy-blocks";
export * from "./editorial-hero";
export * from "./hero-kit";
// Designed heroes: `@figbud/site-kit/product-heroes`, or `LazyProductHero` (P2-18).
export type { ProductHeroProps } from "./product-heroes";
export * from "./product-header";
export * from "./use-dismiss";
export * from "./zirahr-modules";
export * from "./numbered-story";
export type { TourItem } from "./module-tour";
export * from "./guided-demo";
export * from "./guided-steps";
