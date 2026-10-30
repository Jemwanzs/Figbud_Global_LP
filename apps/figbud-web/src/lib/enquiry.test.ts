import { describe, expect, it, vi } from "vitest";

import { type EnquiryValues, payloadFields, submitEnquiry, validateEnquiry } from "./enquiry";

const valid: EnquiryValues = {
  kind: "demo_request",
  product: "zirahr",
  name: "Amina Wanjiru",
  email: "amina@example.co.ke",
  company: "Mfano Ltd",
  job_title: "",
  phones: [{ country: "KE", number: "" }],
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
  const payload = { ...payloadFields(valid), locale: "en", source_path: "/en/contact", elapsed_ms: 9000 };
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

describe("phone numbers and emails", () => {
  it("accepts personal and company emails, trimmed; rejects malformed ones", () => {
    for (const email of ["amina@gmail.com", " amina@mfano.co.ke ", "a.b+tag@outlook.com"])
      expect(validateEnquiry({ ...valid, email }).email).toBeUndefined();
    for (const email of ["amina@", "amina gmail.com", "@mfano.co.ke"])
      expect(validateEnquiry({ ...valid, email }).email).toBe("email");
    expect(payloadFields({ ...valid, email: "  amina@mfano.co.ke " }).email).toBe("amina@mfano.co.ke");
  });

  it("validates numbers for their country and sends them in E.164", () => {
    const phones = [{ country: "KE" as const, number: "0712 345 678" }];
    expect(validateEnquiry({ ...valid, phones })).toEqual({});
    expect(payloadFields({ ...valid, phones })).toMatchObject({
      phone: "+254712345678",
      phone_country: "KE",
    });
    expect(validateEnquiry({ ...valid, phones: [{ country: "KE", number: "0712" }] }).phones).toBe("phone");
    // The same digits mean something else in another country.
    expect(validateEnquiry({ ...valid, phones: [{ country: "US", number: "0712 345 678" }] }).phones).toBe(
      "phone",
    );
  });

  it("second numbers: valid, different from the first, sent only with a first number", () => {
    const first = { country: "KE" as const, number: "0712345678" };
    expect(validateEnquiry({ ...valid, phones: [first, { country: "UG", number: "0772 123456" }] })).toEqual(
      {},
    );
    expect(
      validateEnquiry({ ...valid, phones: [first, { country: "KE", number: "+254 712 345 678" }] })
        .phone_secondary,
    ).toBe("phoneDuplicate");
    expect(
      payloadFields({ ...valid, phones: [first, { country: "UG", number: "0772123456" }] }),
    ).toMatchObject({
      phone_secondary: "+256772123456",
      phone_secondary_country: "UG",
    });
    expect(
      payloadFields({
        ...valid,
        phones: [
          { country: "KE", number: "" },
          { country: "UG", number: "0772123456" },
        ],
      }),
    ).not.toHaveProperty("phone_secondary");
  });

  it("countries are ISO codes", () => {
    expect(validateEnquiry({ ...valid, country: "KE" })).toEqual({});
    expect(validateEnquiry({ ...valid, country: "Kenya" }).country).toBe("required");
  });
});
