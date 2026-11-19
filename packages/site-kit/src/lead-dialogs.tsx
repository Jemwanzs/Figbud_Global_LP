"use client";

import { type LeadText, leadCopy } from "@figbud/i18n";
import { buttonClasses, cn, fieldClasses } from "@figbud/ui";
import { ArrowLeft, CalendarClock, CircleCheck, LoaderCircle, TriangleAlert, X } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { type EnquiryProduct, companySizes, emailError, submitEnquiry } from "./enquiry";
import { PhoneInput } from "./forms";
import { type PhoneEntry, phoneE164 } from "./phone";

/**
 * Start Now and demo booking (owner's brief, 18 Nov 2026, P8-M8), opened in
 * place from any button whose action is `#start-now` or `#book-demo`
 * (`CtaActions`). Both are enquiries to the same API as the contact form:
 * Start Now is a workspace request; a booking is a demo request with a
 * time slot, reserved atomically by the API. Slots come from the website's
 * availability in its own time zone; the visitor's own time is shown beside
 * them when it differs.
 */

export type LeadAction = "start-now" | "book-demo";

export type LeadCopy = LeadText;

/** English, the approved text; other languages come from `leadCopy` in `@figbud/i18n`. */
export const LEAD_COPY: LeadCopy = leadCopy.en;

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);

interface SlotDay {
  date: string;
  slots: string[];
}
interface Slots {
  enabled: boolean;
  time_zone?: string;
  slot_minutes?: number;
  note?: string | null;
  days?: SlotDay[];
}

interface Details {
  name: string;
  email: string;
  company: string;
  company_size: string;
  phone: PhoneEntry;
  message: string;
  consent: boolean;
  website: string;
}

type Errors = Partial<Record<"name" | "email" | "company" | "company_size" | "phone" | "consent", string>>;

function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
        {optional && <span className="font-normal text-subtle"> ({optional})</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-subtle">
          {hint}
        </p>
      )}
      <div className="mt-1.5">{children}</div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const describe = (id: string, error?: string, hint?: string) =>
  [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;

/** Name, email, organisation, headcount, phone, message and consent: both dialogs' details. */
function DetailsFields({
  uid,
  values,
  set,
  errors,
  copy,
  privacyHref,
  locale,
  sizeRequired,
  messageHint,
}: {
  uid: string;
  values: Details;
  set: <K extends keyof Details>(key: K, value: Details[K]) => void;
  errors: Errors;
  copy: LeadCopy;
  privacyHref: string;
  locale: string;
  sizeRequired: boolean;
  messageHint?: string;
}) {
  const [before, after = ""] = copy.consent.split("{privacy}");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={`${uid}-name`} label={copy.name} error={errors.name}>
        <input
          id={`${uid}-name`}
          autoComplete="name"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describe(`${uid}-name`, errors.name)}
          aria-required
          data-autofocus=""
          className={fieldClasses()}
        />
      </Field>
      <Field id={`${uid}-email`} label={copy.email} error={errors.email}>
        <input
          id={`${uid}-email`}
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describe(`${uid}-email`, errors.email)}
          aria-required
          className={fieldClasses()}
        />
      </Field>
      <Field id={`${uid}-company`} label={copy.company} error={errors.company}>
        <input
          id={`${uid}-company`}
          autoComplete="organization"
          value={values.company}
          onChange={(e) => set("company", e.target.value)}
          aria-invalid={errors.company ? true : undefined}
          aria-describedby={describe(`${uid}-company`, errors.company)}
          aria-required
          className={fieldClasses()}
        />
      </Field>
      <Field id={`${uid}-phone`} label={copy.phone} optional={copy.optional} error={errors.phone}>
        <PhoneInput
          id={`${uid}-phone`}
          value={values.phone}
          onChange={(phone) => set("phone", phone)}
          locale={locale}
          invalid={Boolean(errors.phone)}
          describedBy={describe(`${uid}-phone`, errors.phone)}
        />
      </Field>
      {/* Headcount as pills: one choice, keyboard-operable as a radio group. */}
      <fieldset
        className="sm:col-span-2"
        aria-describedby={describe(`${uid}-size`, errors.company_size, copy.headcountHint)}
      >
        <legend className="text-sm font-medium text-text">
          {copy.headcount}
          {!sizeRequired && <span className="font-normal text-subtle"> ({copy.optional})</span>}
        </legend>
        <p id={`${uid}-size-hint`} className="mt-0.5 text-xs text-subtle">
          {copy.headcountHint}
        </p>
        <div className="mt-2 flex flex-wrap gap-2" data-headcount="">
          {companySizes.map((size) => (
            <label
              key={size}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm tabular-nums transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--focus,var(--accent))]",
                values.company_size === size
                  ? "border-product bg-product-soft font-medium text-product-text"
                  : "border-line text-muted hover:border-line-strong hover:text-text",
              )}
            >
              <input
                type="radio"
                name={`${uid}-size`}
                value={size}
                checked={values.company_size === size}
                onChange={() => set("company_size", size)}
                className="sr-only"
              />
              {size}
            </label>
          ))}
        </div>
        {errors.company_size && (
          <p id={`${uid}-size-error`} className="mt-1.5 text-sm text-danger">
            {errors.company_size}
          </p>
        )}
      </fieldset>
      <div className="sm:col-span-2">
        <Field id={`${uid}-message`} label={copy.message} optional={copy.optional} hint={messageHint}>
          <textarea
            id={`${uid}-message`}
            rows={3}
            maxLength={2000}
            value={values.message}
            onChange={(e) => set("message", e.target.value)}
            aria-describedby={describe(`${uid}-message`, undefined, messageHint)}
            className={fieldClasses("min-h-20 resize-y")}
          />
        </Field>
      </div>
      {/* Honeypot: hidden from people, must stay empty. */}
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
      <div className="sm:col-span-2">
        <label className="flex items-start gap-3 text-sm text-muted">
          <input
            type="checkbox"
            checked={values.consent}
            onChange={(e) => set("consent", e.target.checked)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? `${uid}-consent-error` : undefined}
            className="mt-0.5 size-5 shrink-0 accent-[var(--product,var(--accent))]"
          />
          <span>
            {before}
            <a href={privacyHref} className="text-product-text underline underline-offset-2">
              {copy.privacy}
            </a>
            {after}
          </span>
        </label>
        {errors.consent && (
          <p id={`${uid}-consent-error`} className="mt-1.5 text-sm text-danger">
            {errors.consent}
          </p>
        )}
      </div>
    </div>
  );
}

function check(values: Details, copy: LeadCopy, sizeRequired: boolean): Errors {
  const errors: Errors = {};
  if (values.name.trim().length < 2) errors.name = copy.required;
  if (emailError(values.email)) errors.email = values.email.trim() ? copy.emailInvalid : copy.required;
  if (!values.company.trim()) errors.company = copy.required;
  if (sizeRequired && !values.company_size) errors.company_size = copy.required;
  if (values.phone.number.trim() && !phoneE164(values.phone)) errors.phone = copy.phoneInvalid;
  if (!values.consent) errors.consent = copy.consentRequired;
  return errors;
}

/** "Thursday 20 November, 09:00" in a zone. */
function formatSlot(iso: string, locale: string, timeZone: string, withDay = true) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    ...(withDay ? { weekday: "long", day: "numeric", month: "long" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function LeadDialog({
  action,
  onClose,
  apiOrigin,
  product,
  productName,
  privacyHref,
  demoFallbackHref,
  campaign,
  locale = "en",
  copy: overrides,
}: {
  action: LeadAction;
  onClose: () => void;
  apiOrigin: string;
  product: EnquiryProduct;
  productName: string;
  privacyHref: string;
  /** The demo request form, for when booking is off or full. */
  demoFallbackHref: string;
  campaign?: string;
  locale?: string;
  copy?: Partial<LeadCopy>;
}) {
  const copy = useMemo(() => ({ ...LEAD_COPY, ...overrides }), [overrides]);
  const uid = useId().replace(/:/g, "");
  const dialog = useRef<HTMLDialogElement>(null);
  const started = useRef(Date.now());
  const idempotency = useRef<string | null>(null);
  const booking = action === "book-demo";
  const [step, setStep] = useState<"slot" | "details" | "done">(booking ? "slot" : "details");
  const [slots, setSlots] = useState<Slots | null | "error">(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [values, setValues] = useState<Details>({
    name: "",
    email: "",
    company: "",
    company_size: "",
    phone: { country: "KE", number: "" },
    message: "",
    consent: false,
    website: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const visitorZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const closed = () => onClose();
    d.addEventListener("close", closed);
    return () => d.removeEventListener("close", closed);
  }, [onClose]);

  const loadSlots = useCallback(async () => {
    setSlots(null);
    try {
      const response = await fetch(`${apiOrigin}/v1/sites/${product}/demo-slots`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as Slots;
      setSlots(data);
      const first = data.days?.[0]?.date ?? null;
      setDay((current) => (current && data.days?.some((d) => d.date === current) ? current : first));
    } catch {
      setSlots("error");
    }
  }, [apiOrigin, product]);

  useEffect(() => {
    if (booking) void loadSlots();
  }, [booking, loadSlots]);

  // Focus the new step's first control when the step changes.
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>(`[data-step="${step}"] [data-autofocus]`)?.focus();
  }, [step]);

  const set = <K extends keyof Details>(key: K, value: Details[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const zone = slots && slots !== "error" ? (slots.time_zone ?? "Africa/Nairobi") : "Africa/Nairobi";
  const differs = useMemo(() => {
    if (!slot) return false;
    return formatSlot(slot, locale, zone, false) !== formatSlot(slot, locale, visitorZone, false);
  }, [slot, locale, zone, visitorZone]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = check(values, copy, !booking);
    setErrors(found);
    if (Object.keys(found).length) {
      const first = Object.keys(found)[0];
      dialog.current
        ?.querySelector<HTMLElement>(
          first === "company_size"
            ? `[name="${uid}-size"]`
            : first === "consent"
              ? 'input[type="checkbox"]'
              : `#${uid}-${first}`,
        )
        ?.focus();
      return;
    }
    setSending(true);
    setFailure(null);
    idempotency.current ??= crypto.randomUUID();
    const phone = values.phone.number.trim() ? (phoneE164(values.phone) ?? values.phone.number.trim()) : "";
    const result = await submitEnquiry(
      apiOrigin,
      {
        kind: booking ? "demo_request" : "workspace_request",
        product,
        name: values.name.trim(),
        email: values.email.trim(),
        company: values.company.trim(),
        job_title: "",
        country: "",
        company_size: values.company_size,
        message: values.message.trim(),
        website: values.website,
        consent: values.consent,
        phone,
        phone_country: values.phone.country,
        locale,
        source_path: window.location.pathname,
        elapsed_ms: Date.now() - started.current,
        ...(campaign ? { campaign } : {}),
        ...(booking && slot ? { demo_slot: slot } : {}),
      },
      idempotency.current,
    );
    setSending(false);
    if (result.ok) {
      setReference(result.reference);
      setStep("done");
      return;
    }
    // A new attempt is a new request (the details or the time changed).
    idempotency.current = null;
    if (result.reason === "slot_taken") {
      setSlot(null);
      setNotice(copy.slotTaken);
      setStep("slot");
      void loadSlots();
      return;
    }
    setFailure(
      result.reason === "rate_limited"
        ? copy.rateLimited
        : result.reason === "closed"
          ? copy.closed
          : copy.failed,
    );
  };

  const title = fill(booking ? copy.bookTitle : copy.startTitle, { product: productName });
  const days = slots && slots !== "error" ? (slots.days ?? []) : [];
  const today = days.find((d) => d.date === day);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${uid}-title`}
      data-lead-dialog={action}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      className="fb-overlay m-auto max-h-[calc(100dvh-1.5rem)] w-[min(44rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-bg p-0 text-text shadow-[var(--shadow-elevated)] backdrop:bg-black/60"
    >
      <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-bg/95 px-5 py-4 backdrop-blur sm:px-7">
        <div className="min-w-0 flex-1">
          <h2 id={`${uid}-title`} className="font-display text-xl font-semibold tracking-tight text-text">
            {title}
          </h2>
          {step !== "done" && (
            <p className="mt-1 text-sm text-muted">{booking ? copy.bookLead : copy.startLead}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label={copy.close}
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <div className="px-5 py-5 sm:px-7 sm:py-6">
        {step === "slot" && (
          <div data-step="slot">
            {notice && (
              <p
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm text-text"
              >
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                {notice}
              </p>
            )}
            {slots === null ? (
              <p aria-live="polite" className="flex items-center gap-2 py-8 text-sm text-muted">
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
                {copy.loadingSlots}
              </p>
            ) : slots === "error" ? (
              <div role="alert" className="py-6 text-sm text-muted">
                <p>{copy.slotsFailed}</p>
                <button
                  type="button"
                  onClick={() => void loadSlots()}
                  className={cn(buttonClasses("secondary", "md"), "mt-3")}
                  data-autofocus=""
                >
                  {copy.retry}
                </button>
              </div>
            ) : !slots.enabled || days.length === 0 ? (
              <div className="py-4">
                <p className="text-sm text-muted">{slots.enabled ? copy.noSlots : copy.bookingOff}</p>
                <a
                  href={demoFallbackHref}
                  className={cn(buttonClasses("product", "md"), "mt-4")}
                  data-autofocus=""
                >
                  {copy.requestDemo}
                </a>
              </div>
            ) : (
              <>
                <fieldset>
                  <legend className="text-sm font-medium text-text">{copy.chooseDay}</legend>
                  <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-2" data-days="">
                    {days.map((d, i) => {
                      const date = new Date(`${d.date}T12:00:00Z`);
                      const chosen = d.date === day;
                      return (
                        <button
                          key={d.date}
                          type="button"
                          aria-pressed={chosen}
                          data-autofocus={i === 0 ? "" : undefined}
                          onClick={() => {
                            setDay(d.date);
                            setSlot(null);
                          }}
                          className={cn(
                            "flex min-h-16 min-w-[4.5rem] shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl border px-3 text-sm transition-colors",
                            chosen
                              ? "border-product bg-product-soft text-product-text"
                              : "border-line text-muted hover:border-line-strong hover:text-text",
                          )}
                        >
                          <span className="text-xs uppercase">
                            {new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
                              date,
                            )}
                          </span>
                          <span className="font-display text-lg font-semibold tabular-nums">
                            {new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }).format(
                              date,
                            )}
                          </span>
                          <span className="text-xs">
                            {new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
                              date,
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                {today && (
                  <fieldset className="mt-4">
                    <legend className="text-sm font-medium text-text">{copy.chooseTime}</legend>
                    <p className="mt-0.5 text-xs text-subtle">{fill(copy.timesIn, { zone })}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4" data-slots="">
                      {today.slots.map((s) => {
                        const own = formatSlot(s, locale, visitorZone, false);
                        const theirs = formatSlot(s, locale, zone, false);
                        return (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={slot === s}
                            onClick={() => setSlot(s)}
                            className={cn(
                              "flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-sm tabular-nums transition-colors",
                              slot === s
                                ? "border-product bg-product font-medium text-product-ink"
                                : "border-line text-text hover:border-product/60",
                            )}
                          >
                            {theirs}
                            {own !== theirs && (
                              <span className="text-[0.7rem] opacity-75">
                                {fill(copy.yourTime, { time: own })}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                {slots.note && <p className="mt-4 text-sm text-muted">{slots.note}</p>}
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    disabled={!slot}
                    onClick={() => {
                      setNotice(null);
                      setStep("details");
                    }}
                    className={buttonClasses("product", "md")}
                  >
                    {copy.continue}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "details" && (
          <form data-step="details" noValidate onSubmit={submit} className="relative">
            {booking && slot && (
              <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
                <CalendarClock aria-hidden className="size-5 shrink-0 text-product-text" />
                <p className="min-w-0 flex-1 text-sm text-text" data-chosen-slot="">
                  <span className="font-medium">{formatSlot(slot, locale, zone)}</span>{" "}
                  <span className="text-subtle">({zone})</span>
                  {differs && (
                    <span className="block text-xs text-subtle">
                      {fill(copy.yourTime, { time: formatSlot(slot, locale, visitorZone) })}
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setStep("slot")}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-full px-3 text-sm font-medium text-product-text hover:bg-surface-2"
                >
                  <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
                  {copy.change}
                </button>
              </div>
            )}
            <DetailsFields
              uid={uid}
              values={values}
              set={set}
              errors={errors}
              copy={copy}
              privacyHref={privacyHref}
              locale={locale}
              sizeRequired={!booking}
              messageHint={booking ? undefined : copy.startMessageHint}
            />
            {failure && (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm text-text"
              >
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
                {failure}
              </p>
            )}
            <div className="mt-6 flex justify-end">
              <button type="submit" disabled={sending} className={buttonClasses("product", "lg")}>
                {sending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                {booking ? copy.bookSubmit : copy.startSubmit}
              </button>
            </div>
          </form>
        )}

        {step === "done" && reference && (
          <div data-step="done" role="status" className="py-4 text-center">
            <CircleCheck aria-hidden className="mx-auto size-12 text-success" />
            <p className="mt-3 font-display text-2xl font-semibold text-text">
              {booking ? copy.bookDone : copy.startDone}
            </p>
            <p className="mx-auto mt-2 max-w-md text-muted">
              {booking && slot
                ? fill(copy.bookDoneBody, { time: `${formatSlot(slot, locale, zone)} (${zone})` })
                : fill(copy.startDoneBody, { product: productName })}
            </p>
            <p className="mt-3 text-sm text-subtle">
              {copy.reference.split("{reference}")[0]}
              <span className="font-mono text-text" data-reference="">
                {reference}
              </span>
              {copy.reference.split("{reference}")[1] ?? ""}
            </p>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className={cn(buttonClasses("secondary", "md"), "mt-6")}
              data-autofocus=""
            >
              {copy.close}
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
