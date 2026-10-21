import { describe, expect, it, vi } from "vitest";

import { type EnquiryValues, submitEnquiry, validateEnquiry } from "./enquiry";

const valid: EnquiryValues = {
  kind: "demo_request",
  product: "zirahr",
  name: "Amina Wanjiru",
  email: "amina@example.co.ke",
  company: "Mfano Ltd",
  job_title: "",
  phone: "",
  country: "",
  company_size: "",
  message: "",
  consent: true,
  website: "",
};

describe("validateEnquiry", () => {
  it("accepts a complete demo request", () => {
    expect(validateEnquiry(valid)).toEqual({});
  });

  it("mirrors the API's per-kind requirements", () => {
    expect(validateEnquiry({ ...valid, company: " " })).toEqual({ company: "required" });
    expect(validateEnquiry({ ...valid, kind: "contact", company: "" })).toEqual({ message: "required" });
    expect(validateEnquiry({ ...valid, kind: "sales", message: "short" })).toEqual({
      message: "messageShort",
    });
    expect(validateEnquiry({ ...valid, kind: "waitlist", company: "" })).toEqual({});
  });

  it("flags bad emails and missing consent", () => {
    expect(validateEnquiry({ ...valid, email: "amina@", consent: false })).toEqual({
      email: "email",
      consent: "consent",
    });
  });
});

describe("submitEnquiry", () => {
  const payload = { ...valid, locale: "en", source_path: "/en/contact", elapsed_ms: 9000 };
  const respond = (status: number, body: unknown) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it("sends the idempotency key and returns the reference", async () => {
    const fetchMock = respond(201, { reference: "FBG-2610-ABCDEF", status: "received" });
    const result = await submitEnquiry("http://api.test", payload, "key-1", fetchMock);
    expect(result).toEqual({ ok: true, reference: "FBG-2610-ABCDEF" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://api.test/v1/enquiries");
    expect((init as RequestInit).headers).toMatchObject({ "idempotency-key": "key-1" });
  });

  it("maps validation, rate-limit, server and network failures", async () => {
    const validation = respond(422, { error: { fields: [{ field: "email" }] } });
    expect(await submitEnquiry("x", payload, "k", validation)).toEqual({
      ok: false,
      reason: "validation",
      fields: ["email"],
    });
    expect(await submitEnquiry("x", payload, "k", respond(429, {}))).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(await submitEnquiry("x", payload, "k", respond(503, {}))).toEqual({ ok: false, reason: "server" });
    const offline = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await submitEnquiry("x", payload, "k", offline)).toEqual({ ok: false, reason: "network" });
  });
});
