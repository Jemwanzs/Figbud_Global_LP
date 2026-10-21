import { defaultLocale, localizePath } from "@figbud/i18n";
import { Container, buttonClasses } from "@figbud/ui";
import Link from "next/link";

import en from "@/i18n/dictionaries/en";
import { routes } from "@/lib/site";

export default function NotFound() {
  const copy = en.pages.notFound;
  return (
    <Container className="flex min-h-[60vh] flex-col items-start justify-center py-24">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-4 max-w-2xl font-display text-headline font-semibold text-text">{copy.title}</h1>
      <p className="mt-4 text-lead text-muted">{copy.body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={localizePath(defaultLocale)} className={buttonClasses("primary")}>
          {copy.home}
        </Link>
        <Link href={localizePath(defaultLocale, routes.products)} className={buttonClasses("secondary")}>
          {copy.products}
        </Link>
      </div>
    </Container>
  );
}
