import { apiBase, getListedSites, parseSiteParam } from "@/lib/sites";

/**
 * Waitlist and early-access sign-ups on a website that isn't launched yet:
 * forwards to the API's enquiry endpoint, which validates and stores them.
 * The kind and product come from the registry, not from the form.
 */
export async function POST(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { slug } = parseSiteParam((await params).site);
  const site = (await getListedSites()).find((s) => s.slug === slug && s.kind === "product");
  if (!site || site.status === "active") {
    return Response.json({ error: { message: "Not found." } }, { status: 404 });
  }
  const text = await request.text();
  if (text.length > 8_000) return Response.json({ error: { message: "Too large." } }, { status: 413 });
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
      body: JSON.stringify({
        ...body,
        kind: site.status === "beta" ? "early_access" : "waitlist",
        product: slug,
      }),
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
