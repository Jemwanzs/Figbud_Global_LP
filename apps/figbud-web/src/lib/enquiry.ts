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

export const enquiryProducts = ["figbud", "zirahr", "jasiri", "expense_now"] as const;
export type EnquiryProduct = (typeof enquiryProducts)[number];

export const companySizes = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;

export interface EnquiryValues {
  kind: EnquiryKind;
  product: EnquiryProduct;
  name: string;
  email: string;
  company: string;
  job_title: string;
  phone: string;
  country: string;
  company_size: string;
  message: string;
  consent: boolean;
  /** Honeypot: must stay empty. */
  website: string;
}

export type FieldErrorCode = "required" | "email" | "consent" | "messageShort";
export type EnquiryErrors = Partial<Record<keyof EnquiryValues, FieldErrorCode>>;

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

export function validateEnquiry(values: EnquiryValues): EnquiryErrors {
  const errors: EnquiryErrors = {};
  if (values.name.trim().length < 2) errors.name = "required";
  if (!values.email.trim()) errors.email = "required";
  else if (!EMAIL.test(values.email.trim())) errors.email = "email";
  if (requiresCompany(values.kind) && !values.company.trim()) errors.company = "required";
  const message = values.message.trim();
  if (requiresMessage(values.kind)) {
    if (!message) errors.message = "required";
    else if (message.length < 10) errors.message = "messageShort";
  }
  if (!values.consent) errors.consent = "consent";
  return errors;
}

export interface EnquiryPayload extends Omit<EnquiryValues, "consent"> {
  consent: boolean;
  locale: string;
  source_path: string;
  elapsed_ms: number;
}

export type SubmitResult =
  | { ok: true; reference: string }
  | { ok: false; reason: "validation"; fields: string[] }
  | { ok: false; reason: "rate_limited" | "network" | "server" };

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
  return { ok: false, reason: "server" };
}
