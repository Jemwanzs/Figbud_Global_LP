import { apiBase, parseSiteParam } from "@/lib/sites";

/**
 * The public pricing calculator's endpoint on this website: forwards the
 * visitor's choices to the API, which prices only published public items and
 * refuses everything while the website doesn't show prices.
 */
export async function POST(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { slug } = parseSiteParam((await params).site);
  const body = await request.text();
  if (body.length > 20_000) return Response.json({ error: { message: "Too large." } }, { status: 413 });
  try {
    const upstream = await fetch(`${apiBase}/v1/sites/${encodeURIComponent(slug)}/pricing/calculate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: { message: "The pricing service can't be reached." } }, { status: 503 });
  }
}
