import { cacheLife } from "next/cache";

import { figbudOrigin } from "@/lib/sites";

import type { NavLink } from "./site-header";

/** The current year, cached so the footer stays part of the static shell. */
async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

/** A product website's footer: its pages and its place in the FigBud ecosystem. */
export async function SiteFooter({
  name,
  tagline,
  links,
}: {
  name: string;
  tagline?: string | null;
  links: NavLink[];
}) {
  const year = await currentYear();
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-[92rem] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr] md:px-10 lg:px-16">
        <div>
          <p className="text-lg font-semibold text-text">{name}</p>
          {tagline && <p className="mt-2 max-w-sm text-muted">{tagline}</p>}
          <p className="mt-6 text-sm text-subtle">
            {name} is a{" "}
            <a href={`${figbudOrigin}/en`} className="text-accent underline underline-offset-2">
              FigBud Global
            </a>{" "}
            platform.
          </p>
        </div>
        {links.length > 0 && (
          <nav aria-label={`${name} pages`}>
            <ul className="space-y-2 text-sm">
              {links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="inline-flex min-h-8 items-center text-muted hover:text-text">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <nav aria-label="FigBud Global">
          <ul className="space-y-2 text-sm">
            <li>
              <a
                href={`${figbudOrigin}/en/about`}
                className="inline-flex min-h-8 items-center text-muted hover:text-text"
              >
                About FigBud Global
              </a>
            </li>
            <li>
              <a
                href={`${figbudOrigin}/en/legal/privacy`}
                className="inline-flex min-h-8 items-center text-muted hover:text-text"
              >
                Privacy
              </a>
            </li>
            <li>
              <a
                href={`${figbudOrigin}/en/legal/terms`}
                className="inline-flex min-h-8 items-center text-muted hover:text-text"
              >
                Terms
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <p className="border-t border-line px-5 py-5 text-center text-xs text-subtle">
        © {year} FigBud Global. All rights reserved.
      </p>
    </footer>
  );
}
