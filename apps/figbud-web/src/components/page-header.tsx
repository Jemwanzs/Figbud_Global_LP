import { Container, Eyebrow } from "@figbud/ui";
import type { ReactNode } from "react";

/** Standard header for inner pages: breadcrumbs, eyebrow, page title (h1) and lead. */
export function PageHeader({
  breadcrumbs,
  eyebrow,
  title,
  lead,
  children,
}: {
  breadcrumbs?: ReactNode;
  eyebrow?: string;
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden border-b border-line">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute end-[-10%] -top-48 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)]" />
        <div className="fb-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_80%_at_70%_0%,black,transparent_75%)] opacity-50" />
      </div>
      <Container size="wide" className="pt-page-top pb-section-sm">
        {breadcrumbs && <div className="mb-5 sm:mb-6">{breadcrumbs}</div>}
        {eyebrow && <Eyebrow className="fb-rise">{eyebrow}</Eyebrow>}
        <h1 className="mt-4 max-w-4xl font-display text-page font-semibold text-balance text-text">
          {title}
        </h1>
        {lead && (
          <p className="fb-rise mt-4 max-w-2xl text-lead text-muted" style={{ animationDelay: "100ms" }}>
            {lead}
          </p>
        )}
        {children}
      </Container>
    </section>
  );
}
