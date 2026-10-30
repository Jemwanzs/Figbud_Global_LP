import { type PhoneEntry, isCountryCode, phoneE164 } from "@figbud/site-kit/phone";

/**
 * Enquiry form model shared by the browser form. The Rust API is the source
 * of truth and re-validates everything; these checks mirror its rules so
 * visitors get instant feedback.
 */

export const enquiryKinds = [
  "demo_request",
  "sales",
  "contact",
  "partnership",
  "early_access",
  "waitlist",
] as const;
export type EnquiryKind = (typeof enquiryKinds)[number];

export const enquiryProducts = ["figbud", "zirahr", "jasiri", "expense_now", "ziwa"] as const;
export type EnquiryProduct = (typeof enquiryProducts)[number];

export const companySizes = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;

export interface EnquiryValues {
  kind: EnquiryKind;
  product: EnquiryProduct;
  name: string;
  email: string;
  company: string;
  job_title: string;
  /** The first number, then optionally a second (UI-F1). */
  phones: PhoneEntry[];
  /** ISO 3166-1 alpha-2, or "" when not given. */
  country: string;
  company_size: string;
  message: string;
  consent: boolean;
  /** Honeypot: must stay empty. */
  website: string;
}

export type FieldErrorCode = "required" | "email" | "consent" | "messageShort" | "phone" | "phoneDuplicate";
export type EnquiryErrors = Partial<Record<keyof EnquiryValues | "phone_secondary", FieldErrorCode>>;

/** Phone numbers an enquiry can carry (the API enforces the same limit). */
export const MAX_PHONES = 2;

export const requiresCompany = (kind: EnquiryKind) =>
  kind === "demo_request" || kind === "partnership" || kind === "sales";

export const requiresMessage = (kind: EnquiryKind) =>
  kind === "contact" || kind === "partnership" || kind === "sales";

export function isEnquiryKind(value: string | null): value is EnquiryKind {
  return value !== null && (enquiryKinds as readonly string[]).includes(value);
}

export function isEnquiryProduct(value: string | null): value is EnquiryProduct {
  return value !== null && (enquiryProducts as readonly string[]).includes(value);
}

const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

/**
 * Syntax only: personal and company addresses are both accepted (the label
 * only prefers a work address), and a valid address doesn't prove the
 * mailbox exists.
 */
export function emailError(email: string): FieldErrorCode | undefined {
  const value = email.trim();
  if (!value) return "required";
  return EMAIL.test(value) ? undefined : "email";
}

/** Errors for the phone numbers: per number, and a second number equal to the first. */
export function phoneErrors(phones: PhoneEntry[]): Pick<EnquiryErrors, "phones" | "phone_secondary"> {
  const errors: Pick<EnquiryErrors, "phones" | "phone_secondary"> = {};
  const [first, second] = phones;
  if (first?.number.trim() && !phoneE164(first)) errors.phones = "phone";
  if (first?.number.trim() && second?.number.trim()) {
    const e164 = phoneE164(second);
    if (!e164) errors.phone_secondary = "phone";
    else if (e164 === phoneE164(first)) errors.phone_secondary = "phoneDuplicate";
  }
  return errors;
}

export function validateEnquiry(values: EnquiryValues): EnquiryErrors {
  const errors: EnquiryErrors = {};
  if (values.name.trim().length < 2) errors.name = "required";
  const email = emailError(values.email);
  if (email) errors.email = email;
  Object.assign(errors, phoneErrors(values.phones));
  if (values.country && !isCountryCode(values.country)) errors.country = "required";
  if (requiresCompany(values.kind) && !values.company.trim()) errors.company = "required";
  const message = values.message.trim();
  if (requiresMessage(values.kind)) {
    if (!message) errors.message = "required";
    else if (message.length < 10) errors.message = "messageShort";
  }
  if (!values.consent) errors.consent = "consent";
  return errors;
}

export interface EnquiryPayload extends Omit<EnquiryValues, "consent" | "phones"> {
  consent: boolean;
  /** E.164 when valid; the API validates again with `phone_country`. */
  phone: string;
  phone_country: string;
  phone_secondary?: string;
  phone_secondary_country?: string;
  locale: string;
  source_path: string;
  elapsed_ms: number;
  /** The campaign that brought the visitor, when there is one. */
  campaign?: string;
}

/**
 * The API's fields from the form values: trimmed email, numbers in E.164 (a
 * second number only alongside a first one).
 */
export function payloadFields(values: EnquiryValues) {
  const { consent, phones, ...rest } = values;
  const [first, second] = phones;
  const number = (entry?: PhoneEntry) => (entry ? (phoneE164(entry) ?? entry.number.trim()) : "");
  const primary = number(first);
  return {
    ...rest,
    consent,
    email: values.email.trim(),
    phone: primary,
    phone_country: first?.country ?? "",
    ...(primary && second?.number.trim()
      ? { phone_secondary: number(second), phone_secondary_country: second.country }
      : {}),
  };
}

export type SubmitResult =
  | { ok: true; reference: string }
  | { ok: false; reason: "validation"; fields: string[] }
  | { ok: false; reason: "rate_limited" | "network" | "server" | "closed" };

export async function submitEnquiry(
  apiOrigin: string,
  payload: EnquiryPayload,
  idempotencyKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${apiOrigin}/v1/enquiries`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  if (response.ok) {
    const body = (await response.json()) as { reference: string };
    return { ok: true, reference: body.reference };
  }
  if (response.status === 422) {
    const body = (await response.json().catch(() => null)) as {
      error?: { fields?: Array<{ field: string }> };
    } | null;
    return { ok: false, reason: "validation", fields: body?.error?.fields?.map((f) => f.field) ?? [] };
  }
  if (response.status === 429) return { ok: false, reason: "rate_limited" };
  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    if (body?.error?.code === "enquiries_closed") return { ok: false, reason: "closed" };
  }
  return { ok: false, reason: "server" };
}
