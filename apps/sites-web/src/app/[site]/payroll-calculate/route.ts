import { apiBase, parseSiteParam } from "@/lib/sites";

/**
 * The public payroll calculator's endpoint on this website: forwards the
 * inputs to the API, which calculates from published rules only and refuses
 * everything while the calculator is off. Nothing is stored here or there.
 */
export async function POST(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { slug } = parseSiteParam((await params).site);
  const body = await request.text();
  if (body.length > 4_000) return Response.json({ error: { message: "Too large." } }, { status: 413 });
  try {
    const upstream = await fetch(
      `${apiBase}/v1/sites/${encodeURIComponent(slug)}/payroll-calculator/calculate`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: { message: "The calculator can't be reached." } }, { status: 503 });
  }
}
