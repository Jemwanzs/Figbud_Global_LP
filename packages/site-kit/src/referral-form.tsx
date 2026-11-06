"use client";

import { buttonClasses, fieldClasses } from "@figbud/ui";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";

/**
 * Refer & earn (P14-R). Someone introduces a business; it reaches the same
 * enquiry inbox as every other lead, validated by the API. Success only shows
 * once the API has accepted it.
 */
export function ReferralForm({
  endpoint,
  contactPhone,
  preview,
}: {
  /** This website's own endpoint; absent in Studio previews. */
  endpoint?: string;
  contactPhone?: string | null;
  preview?: boolean;
}) {
  const uid = useId();
  // One key per form, so a retry can't create a second referral.
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
    if (preview || !endpoint) return;
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
          kind: "referral",
          product: "",
          name: value("name") ?? "",
          email: value("email") ?? "",
          phone: value("phone"),
          phone_country: "KE",
          company: value("organisation"),
          consent: data.get("consent") === "on",
          website: value("website"),
          elapsed_ms: Date.now() - opened.current,
          locale: "en",
          source_path: window.location.pathname,
          referral: {
            company: value("referred_company") ?? "",
            contact_name: value("referred_name") ?? "",
            contact_email: value("referred_email") ?? "",
            contact_phone: value("referred_phone"),
            company_size: value("referred_size"),
            notes: value("referred_notes"),
          },
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

  const phone = contactPhone && (
    <a
      href={`tel:${contactPhone.replace(/\s/g, "")}`}
      className="font-medium text-product-text underline underline-offset-2"
    >
      {contactPhone}
    </a>
  );

  if (reference) {
    return (
      <div role="status" className="fb-panel rounded-[var(--radius-panel)] p-6 sm:p-8">
        <p className="flex items-center gap-2.5 font-display text-title font-semibold text-text">
          <CheckCircle2 aria-hidden className="size-6 text-success" />
          Thanks for the introduction
        </p>
        <p className="mt-3 text-muted">
          Your reference is <strong className="text-text">{reference}</strong>. Keep it to follow your
          referral.
        </p>
        <p className="mt-2 text-muted">
          {phone ? (
            <>Call us on {phone} any time for an update on the deal.</>
          ) : (
            <>Our team will be in touch, and you can ask them for an update on the deal at any time.</>
          )}{" "}
          You earn once the deal has closed.
        </p>
      </div>
    );
  }

  const input = fieldClasses("mt-1.5");
  const field = (
    name: string,
    label: string,
    options: { type?: string; required?: boolean; autoComplete?: string } = {},
  ) => (
    <div>
      <label htmlFor={`${uid}-${name}`} className="block text-sm font-medium text-text">
        {label}
        {!options.required && <span className="font-normal text-subtle"> (optional)</span>}
      </label>
      <input
        id={`${uid}-${name}`}
        name={name}
        type={options.type ?? "text"}
        required={options.required}
        autoComplete={options.autoComplete ?? "off"}
        disabled={preview}
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
    <form onSubmit={submit} noValidate className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-8">
      <fieldset>
        <legend className="font-semibold text-text">The business you&apos;re referring</legend>
        <div className="mt-3 grid gap-4 @xl:grid-cols-2">
          {field("referred_company", "Business name", { required: true })}
          {field("referred_name", "Contact person", { required: true })}
          {field("referred_email", "Their email", { type: "email", required: true })}
          {field("referred_phone", "Their phone", { type: "tel" })}
          {field("referred_size", "Number of employees")}
          <div className="@xl:col-span-2">
            <label htmlFor={`${uid}-notes`} className="block text-sm font-medium text-text">
              Anything we should know <span className="font-normal text-subtle">(optional)</span>
            </label>
            <textarea
              id={`${uid}-notes`}
              name="referred_notes"
              rows={3}
              maxLength={1000}
              disabled={preview}
              className={`${input} py-3`}
            />
          </div>
        </div>
      </fieldset>
      <fieldset className="mt-7 border-t border-line pt-6">
        <legend className="font-semibold text-text">About you</legend>
        <div className="mt-3 grid gap-4 @xl:grid-cols-2">
          {field("name", "Your name", { required: true, autoComplete: "name" })}
          {field("email", "Your email", { type: "email", required: true, autoComplete: "email" })}
          {field("phone", "Your phone", { type: "tel", autoComplete: "tel" })}
          {field("organisation", "Your organisation", { autoComplete: "organization" })}
        </div>
      </fieldset>
      {/* Honeypot: hidden from people and assistive technology, tempting to bots. */}
      <div aria-hidden className="sr-only">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="mt-6 flex items-start gap-3 text-sm text-text">
        <input
          type="checkbox"
          name="consent"
          required
          disabled={preview}
          aria-invalid={fields.consent ? true : undefined}
          className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
        />
        <span>
          I agree that the ZiraHR team may contact me about this referral, and I&apos;ve let this person know
          we may contact them.
        </span>
      </label>
      {fields.consent && <p className="mt-1 text-sm text-danger">{fields.consent}</p>}
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || preview}
        className={buttonClasses("product", "lg", "mt-6 w-full @xl:w-auto")}
      >
        {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
        {busy ? "Sending…" : "Submit referral"}
      </button>
      {phone && (
        <p className="mt-4 text-sm text-muted">Already referred someone? Call {phone} to follow the deal.</p>
      )}
    </form>
  );
}
