import { apiBase } from "@/lib/products";

/**
 * Passes a customer's quotation token to the API server-side, so the API's
 * shared-quote endpoint needs no browser access (no CORS) and the token never
 * appears in a URL.
 */
export async function GET(request: Request) {
  const token = request.headers.get("x-quote-token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const upstream = await fetch(`${apiBase}/v1/quotes/shared`, {
      headers: { "x-quote-token": token },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "private, no-store" },
    });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
