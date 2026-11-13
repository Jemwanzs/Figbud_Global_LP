"use client";

import { buttonClasses, fieldClasses } from "@figbud/ui";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";

/**
 * A product website that isn't launched yet (Coming Soon or beta, with no
 * published home page): the approved name, tagline and description from the
 * registry, and a waitlist that reaches the enquiry inbox. It never describes
 * features the website hasn't published. Success shows only once the API has
 * accepted the sign-up.
 */
export function ComingSoon({
  name,
  tagline,
  description,
  status,
  endpoint,
  closedMessage,
  corporateHref,
  mark,
}: {
  name: string;
  tagline?: string | null;
  description?: string | null;
  status: "coming_soon" | "beta";
  /** This website's own sign-up endpoint; absent while it isn't taking enquiries. */
  endpoint?: string;
  closedMessage?: string | null;
  corporateHref: string;
  /** The product's mark, drawn by the page from its brand. */
  mark: React.ReactNode;
}) {
  const label = status === "beta" ? "Early access" : "Coming soon";
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="fb-soon-glow pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto grid max-w-[92rem] items-center gap-12 px-5 pt-page-top pb-section sm:px-8 md:px-10 lg:grid-cols-12 lg:gap-16 lg:px-16">
        <div className="lg:col-span-7">
          <p className="inline-flex items-center gap-2 rounded-full border border-product/40 bg-product-soft px-3 py-1 text-sm font-medium text-text">
            <span className="fb-soon-dot size-2 rounded-full bg-product" />
            {label}
          </p>
          <h1 className="mt-6 font-display text-display font-semibold tracking-tight text-text">{name}</h1>
          {tagline && <p className="mt-5 font-display text-title text-text">{tagline}</p>}
          {description && <p className="mt-4 max-w-2xl text-lead text-muted">{description}</p>}
          <div className="mt-10 max-w-xl">
            {endpoint ? (
              <WaitlistForm endpoint={endpoint} product={name} early={status === "beta"} />
            ) : (
              <p className="rounded-2xl border border-line bg-surface p-5 text-muted">
                {closedMessage || `${name} isn't taking sign-ups just now.`}
              </p>
            )}
          </div>
          <a
            href={corporateHref}
            className="mt-8 inline-flex min-h-11 items-center gap-1.5 font-medium text-product-text underline-offset-4 hover:underline"
          >
            Explore the FigBud Global ecosystem
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </a>
        </div>
        {/* A quiet signal around the product's mark: nothing here claims anything. */}
        <div aria-hidden className="relative mx-auto aspect-square w-full max-w-[26rem] lg:col-span-5">
          {[0, 1, 2].map((ring) => (
            <span
              key={ring}
              className="fb-soon-ring absolute rounded-full border border-product/30"
              style={{ inset: `${ring * 14}%`, animationDelay: `${ring * -6}s` }}
            >
              <span className="absolute top-0 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-product shadow-[0_0_18px_var(--product)]" />
            </span>
          ))}
          <div className="absolute inset-[38%] grid place-items-center rounded-3xl border border-line bg-surface shadow-2xl">
            {mark}
          </div>
        </div>
      </div>
    </section>
  );
}

function WaitlistForm({ endpoint, product, early }: { endpoint: string; product: string; early: boolean }) {
  const uid = useId();
  const key = useRef<string | null>(null);
  const opened = useRef(0);
  useEffect(() => {
    opened.current = Date.now();
  }, []);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "").trim() || undefined;
    key.current ??= crypto.randomUUID();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key.current },
        body: JSON.stringify({
          name: value("name") ?? "",
          email: value("email") ?? "",
          company: value("company"),
          consent: data.get("consent") === "on",
          website: value("website"),
          elapsed_ms: Date.now() - opened.current,
          locale: "en",
          source_path: window.location.pathname,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const list: { field: string; message: string }[] = body?.error?.fields ?? [];
        setFields(Object.fromEntries(list.map((f) => [f.field, f.message])));
        setError(
          list.length
            ? "Please check the highlighted fields."
            : (body?.error?.message ?? "Something went wrong. Please try again."),
        );
        return;
      }
      setReference(body.reference);
    } catch {
      setError("We couldn't send that. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (reference) {
    return (
      <div role="status" className="fb-panel rounded-[var(--radius-panel)] p-6">
        <p className="flex items-center gap-2.5 font-semibold text-text">
          <CheckCircle2 aria-hidden className="size-5 text-success" />
          You&apos;re on the list
        </p>
        <p className="mt-2 text-muted">
          We&apos;ll be in touch about {product}. Your reference is{" "}
          <strong className="text-text">{reference}</strong>.
        </p>
      </div>
    );
  }

  const input = fieldClasses("mt-1.5");
  const field = (name: string, label: string, type = "text", required = true, auto = "off") => (
    <div>
      <label htmlFor={`${uid}-${name}`} className="block text-sm font-medium text-text">
        {label}
        {!required && <span className="font-normal text-subtle"> (optional)</span>}
      </label>
      <input
        id={`${uid}-${name}`}
        name={name}
        type={type}
        required={required}
        autoComplete={auto}
        aria-invalid={fields[name] ? true : undefined}
        aria-describedby={fields[name] ? `${uid}-${name}-error` : undefined}
        className={input}
      />
      {fields[name] && (
        <p id={`${uid}-${name}-error`} className="mt-1 text-sm text-danger">
          {fields[name]}
        </p>
      )}
    </div>
  );

  return (
    <form
      method="post"
      onSubmit={submit}
      noValidate
      aria-label={early ? "Request early access" : "Join the waitlist"}
      className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Your name", "text", true, "name")}
        {field("email", "Work email", "email", true, "email")}
        <div className="sm:col-span-2">{field("company", "Company", "text", false, "organization")}</div>
      </div>
      {/* Honeypot: hidden from people and assistive technology, tempting to bots. */}
      <div aria-hidden className="sr-only">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="mt-5 flex items-start gap-3 text-sm text-text">
        <input
          type="checkbox"
          name="consent"
          required
          aria-invalid={fields.consent ? true : undefined}
          className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
        />
        <span>I agree that FigBud Global may contact me about {product}.</span>
      </label>
      {fields.consent && <p className="mt-1 text-sm text-danger">{fields.consent}</p>}
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className={buttonClasses("product", "lg", "mt-5 w-full sm:w-auto")}
      >
        {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
        {busy ? "Sending…" : early ? "Request early access" : "Join the waitlist"}
      </button>
    </form>
  );
}
