"use client";

import type { Locale } from "@figbud/i18n";
import { CountrySelect, type CountryCode, PhoneNumbers } from "@figbud/site-kit";
import { buttonClasses, cn } from "@figbud/ui";
import { ArrowRight, CircleCheck, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import {
  type EnquiryErrors,
  type EnquiryValues,
  MAX_PHONES,
  companySizes,
  emailError,
  enquiryKinds,
  enquiryProducts,
  isEnquiryKind,
  isEnquiryProduct,
  payloadFields,
  phoneErrors,
  requiresCompany,
  requiresMessage,
  submitEnquiry,
  validateEnquiry,
} from "@/lib/enquiry";
import { fillNodes } from "@/lib/format";
import { apiOrigin } from "@/lib/site";

type Copy = Dictionary["form"];
type Status =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "success"; reference: string }
  | { state: "error"; message: string };

const SERVER_FIELD_ERROR: Record<string, EnquiryErrors[keyof EnquiryErrors]> = {
  name: "required",
  email: "email",
  phone: "phone",
  phone_secondary: "phone",
  country: "required",
  company: "required",
  message: "required",
  consent: "consent",
};

export function EnquiryForm({
  locale,
  copy,
  closed = {},
  privacyHref,
}: {
  locale: Locale;
  copy: Copy;
  /** Products not taking enquiries, with the Studio's message ("" for the default). */
  closed?: Record<string, string>;
  privacyHref: string;
}) {
  const params = useSearchParams();
  const initialKind = params.get("kind");
  const requested = params.get("product");
  // A link to a closed product says so above the form, which starts on FigBud Global instead.
  const closedRequest = isEnquiryProduct(requested) && requested in closed ? requested : null;
  const initialProduct = closedRequest ? null : requested;
  // The campaign that brought the visitor, kept with the enquiry (attribution).
  const campaign = /^[0-9a-f-]{36}$/.test(params.get("campaign") ?? "") ? params.get("campaign") : null;

  const [values, setValues] = useState<EnquiryValues>(() => ({
    kind: isEnquiryKind(initialKind) ? initialKind : "demo_request",
    product: isEnquiryProduct(initialProduct) ? initialProduct : "figbud",
    name: "",
    email: "",
    company: "",
    job_title: "",
    // Kenya first (FigBud's home market); the country chosen below is carried over.
    phones: [{ country: "KE", number: "" }],
    country: "",
    company_size: "",
    message: "",
    consent: false,
    website: "",
  }));
  const [errors, setErrors] = useState<EnquiryErrors>({});
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const startedAt = useRef<number | null>(null);
  // One key per submission attempt-series: retries reuse it, so the API never stores duplicates.
  const idempotencyKey = useRef<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const formId = useId();

  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (status.state === "success") successRef.current?.focus();
    if (status.state === "error") summaryRef.current?.focus();
  }, [status.state]);

  const set = <K extends keyof EnquiryValues>(key: K, value: EnquiryValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateEnquiry(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setStatus({ state: "error", message: copy.errors.summary });
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setStatus({ state: "submitting" });
    const result = await submitEnquiry(
      apiOrigin,
      {
        ...payloadFields(values),
        locale,
        source_path: window.location.pathname,
        ...(campaign ? { campaign } : {}),
        elapsed_ms: Math.round(performance.now() - (startedAt.current ?? performance.now())),
      },
      idempotencyKey.current,
    );

    if (result.ok) {
      setStatus({ state: "success", reference: result.reference });
      return;
    }
    if (result.reason === "validation") {
      const serverErrors: EnquiryErrors = {};
      for (const field of result.fields) {
        if (field in SERVER_FIELD_ERROR) {
          // The API names the first number `phone`; the form keeps numbers in `phones`.
          const key = field === "phone" ? "phones" : field;
          serverErrors[key as keyof EnquiryErrors] = SERVER_FIELD_ERROR[field];
        }
      }
      setErrors(serverErrors);
      setStatus({ state: "error", message: copy.errors.summary });
      return;
    }
    setStatus({
      state: "error",
      message:
        result.reason === "closed"
          ? copy.errors.closed.replace("{product}", copy.productOptions[values.product])
          : result.reason === "rate_limited"
            ? copy.errors.rateLimited
            : result.reason === "network"
              ? copy.errors.network
              : copy.errors.generic,
    });
  };

  const reset = () => {
    idempotencyKey.current = null;
    startedAt.current = performance.now();
    setValues((v) => ({ ...v, message: "", consent: false }));
    setErrors({});
    setStatus({ state: "idle" });
  };

  if (status.state === "success") {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="fb-panel fb-rise flex flex-col items-start rounded-[var(--radius-panel)] p-8 outline-none sm:p-10"
      >
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
          <CircleCheck aria-hidden className="size-6" />
        </span>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight text-text">{copy.successTitle}</h2>
        <p className="mt-3 text-muted">
          {fillNodes(copy.successBody, {
            reference: <span className="font-mono text-text">{status.reference}</span>,
          })}
        </p>
        <button type="button" onClick={reset} className={buttonClasses("secondary", "md", "mt-8")}>
          {copy.another}
        </button>
      </div>
    );
  }

  // Checked when a field is left, not while typing.
  const checkEmail = () => {
    setValues((v) => ({ ...v, email: v.email.trim() }));
    setErrors((e) => ({ ...e, email: values.email.trim() ? emailError(values.email) : undefined }));
  };
  const checkPhones = () =>
    setErrors((e) => ({
      ...e,
      phones: undefined,
      phone_secondary: undefined,
      ...phoneErrors(values.phones),
    }));
  const chooseCountry = (code: CountryCode) =>
    setValues((v) => ({
      ...v,
      country: code,
      // An empty first number follows the country; a number already typed keeps its own.
      phones: v.phones[0] && !v.phones[0].number.trim() ? [{ ...v.phones[0], country: code }] : v.phones,
    }));

  const errorText = (field: keyof EnquiryErrors) => {
    const code = errors[field];
    return code ? copy.errors[code] : undefined;
  };
  const companyRequired = requiresCompany(values.kind);
  const messageRequired = requiresMessage(values.kind);
  const submitting = status.state === "submitting";

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby={`${formId}-title`}
      className="fb-panel rounded-[var(--radius-panel)] p-6 sm:p-8 lg:p-10"
    >
      <h2 id={`${formId}-title`} className="text-2xl font-semibold tracking-tight text-text">
        {copy.title}
      </h2>

      {closedRequest && (
        <div
          role="note"
          aria-label={copy.closedTitle.replace("{product}", copy.productOptions[closedRequest])}
          className="mt-6 flex gap-3 rounded-2xl border border-line bg-surface-2 p-4"
        >
          <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
          <div>
            <p className="font-medium text-text">
              {copy.closedTitle.replace("{product}", copy.productOptions[closedRequest])}
            </p>
            <p className="mt-1 text-sm text-muted">{closed[closedRequest] || copy.closedDefault}</p>
          </div>
        </div>
      )}

      <div aria-live="assertive">
        {status.state === "error" && (
          <div
            ref={summaryRef}
            tabIndex={-1}
            className="mt-6 flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-text outline-none"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
            {status.message}
          </div>
        )}
      </div>

      <fieldset className="mt-8">
        <legend className="text-sm font-medium text-text">{copy.kind}</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {enquiryKinds.map((kind) => (
            <label
              key={kind}
              className={cn(
                "relative inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--focus)]",
                values.kind === kind
                  ? "border-accent bg-accent-soft text-text"
                  : "border-line-strong text-muted hover:border-accent/50 hover:text-text",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={kind}
                checked={values.kind === kind}
                onChange={() => set("kind", kind)}
                className="sr-only"
              />
              {copy.kinds[kind]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <Field id={`${formId}-product`} label={copy.product} className="sm:col-span-2">
          {(props) => (
            <select
              {...props}
              value={values.product}
              onChange={(e) => set("product", e.target.value as EnquiryValues["product"])}
              className={inputClass}
            >
              {enquiryProducts.map((product) => (
                <option key={product} value={product} disabled={product in closed}>
                  {product in closed
                    ? copy.closedOption.replace("{product}", copy.productOptions[product])
                    : copy.productOptions[product]}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field id={`${formId}-name`} label={copy.name} error={errorText("name")}>
          {(props) => (
            <input
              {...props}
              autoComplete="name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field id={`${formId}-email`} label={copy.email} hint={copy.emailHint} error={errorText("email")}>
          {(props) => (
            <input
              {...props}
              type="email"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              onBlur={checkEmail}
              className={inputClass}
            />
          )}
        </Field>
        <Field
          id={`${formId}-company`}
          label={copy.company}
          optional={!companyRequired ? copy.optional : undefined}
          error={errorText("company")}
        >
          {(props) => (
            <input
              {...props}
              autoComplete="organization"
              value={values.company}
              onChange={(e) => set("company", e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field id={`${formId}-job`} label={copy.jobTitle} optional={copy.optional}>
          {(props) => (
            <input
              {...props}
              autoComplete="organization-title"
              value={values.job_title}
              onChange={(e) => set("job_title", e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field
          id={`${formId}-country`}
          label={copy.country}
          optional={copy.optional}
          error={errorText("country")}
        >
          {(props) => (
            <CountrySelect
              id={props.id}
              value={(values.country as CountryCode) || ""}
              onChange={chooseCountry}
              locale={locale}
              labels={copy.countries}
              invalid={props["aria-invalid"]}
              describedBy={props["aria-describedby"]}
            />
          )}
        </Field>
        <div>
          <PhoneNumbers
            id={`${formId}-phone`}
            label={copy.phone}
            optional={copy.optional}
            value={values.phones}
            max={MAX_PHONES}
            locale={locale}
            labels={{ ...copy.countries, ...copy.phones }}
            onChange={(phones) => {
              setValues((v) => ({ ...v, phones }));
              if (errors.phones || errors.phone_secondary)
                setErrors((e) => ({ ...e, phones: undefined, phone_secondary: undefined }));
            }}
            onBlur={checkPhones}
            errors={[errorText("phones"), errorText("phone_secondary")]}
          />
        </div>
        <Field
          id={`${formId}-size`}
          label={copy.companySize}
          optional={copy.optional}
          className="sm:col-span-2"
        >
          {(props) => (
            <select
              {...props}
              value={values.company_size}
              onChange={(e) => set("company_size", e.target.value)}
              className={inputClass}
            >
              <option value="">{copy.companySizePlaceholder}</option>
              {companySizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          id={`${formId}-message`}
          label={copy.message}
          optional={!messageRequired ? copy.optional : undefined}
          error={errorText("message")}
          className="sm:col-span-2"
        >
          {(props) => (
            <textarea
              {...props}
              rows={5}
              maxLength={5000}
              value={values.message}
              onChange={(e) => set("message", e.target.value)}
              className={cn(inputClass, "min-h-32 resize-y py-3")}
            />
          )}
        </Field>
      </div>

      {/* Honeypot: hidden from people and assistive technology, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={(e) => set("website", e.target.value)}
          />
        </label>
      </div>

      <div className="mt-6">
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted">
          <input
            type="checkbox"
            checked={values.consent}
            onChange={(e) => set("consent", e.target.checked)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? `${formId}-consent-error` : undefined}
            className="mt-1 size-[1.1rem] shrink-0 accent-[var(--accent)]"
          />
          <span>
            {fillNodes(copy.consent, {
              privacy: (
                <a href={privacyHref} className="text-accent underline underline-offset-4">
                  {copy.privacyLink}
                </a>
              ),
            })}
          </span>
        </label>
        {errors.consent && (
          <p id={`${formId}-consent-error`} className="mt-2 text-sm text-danger">
            {copy.errors.consent}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className={buttonClasses("primary", "lg", "mt-8 w-full sm:w-auto")}
      >
        {submitting ? (
          <>
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            {copy.submitting}
          </>
        ) : (
          <>
            {copy.submit}
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </>
        )}
      </button>
    </form>
  );
}

const inputClass =
  "block min-h-12 w-full rounded-xl border border-line-strong bg-bg/60 px-4 text-text placeholder:text-subtle " +
  "transition-[border-color,box-shadow] outline-none hover:border-accent/40 focus:border-accent " +
  "focus:shadow-[0_0_0_3px_var(--accent-soft)] aria-[invalid=true]:border-danger";

function Field({
  id,
  label,
  optional,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  optional?: string;
  /** A note beside the label that isn't a requirement, e.g. "company email preferred". */
  hint?: string;
  error?: string;
  className?: string;
  children: (props: {
    id: string;
    name: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    "aria-required"?: boolean;
  }) => ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium text-text">
        {label}
        {(optional ?? hint) && <span className="text-xs font-normal text-subtle">{optional ?? hint}</span>}
      </label>
      <div className="mt-2">
        {children({
          id,
          name: id,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? errorId : undefined,
          "aria-required": optional ? undefined : true,
        })}
      </div>
      {error && (
        <p id={errorId} className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
