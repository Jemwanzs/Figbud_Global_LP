import { buttonClasses } from "@figbud/ui";
import Link from "next/link";

/** An address inside the Studio that doesn't exist, shown inside the shell. */
export default function StudioNotFound() {
  return (
    <div className="fb-panel mx-auto mt-6 max-w-xl rounded-[var(--radius-panel)] p-7 sm:p-9">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-text">Not found</h1>
      <p className="mt-2 leading-relaxed text-muted">
        This page doesn&apos;t exist, or it&apos;s no longer available to you.
      </p>
      <Link href="/admin" className={buttonClasses("primary", "md", "mt-6")}>
        Go to the overview
      </Link>
    </div>
  );
}
