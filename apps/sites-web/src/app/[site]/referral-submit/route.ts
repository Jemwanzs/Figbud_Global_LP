import { apiBase, parseSiteParam } from "@/lib/sites";

/**
 * Refer & earn on this website: forwards to the API's enquiry endpoint, which
 * validates and stores it. The product comes from the address, not the form.
 */
export async function POST(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { slug } = parseSiteParam((await params).site);
  const text = await request.text();
  if (text.length > 12_000) return Response.json({ error: { message: "Too large." } }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: { message: "Request body must be valid JSON." } }, { status: 400 });
  }
  try {
    const upstream = await fetch(`${apiBase}/v1/enquiries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": request.headers.get("idempotency-key") ?? "",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      body: JSON.stringify({ ...body, kind: "referral", product: slug }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: { message: "We couldn't send that. Please try again." } }, { status: 503 });
  }
}
