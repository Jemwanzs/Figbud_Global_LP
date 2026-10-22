// Minimal stand-in for the API's Blog & Insights endpoints, so end-to-end
// tests exercise real server-side fetching without a database. Mirrors the
// response shapes of services/api/src/cms. English has articles; Swahili has
// none (the empty state).
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_CMS_PORT ?? 3199);

const payroll = { slug: "payroll", name: "Payroll" };
const lending = { slug: "lending", name: "Lending" };
const author = { slug: "editorial", name: "FigBud Editorial", role: "Editorial team" };

const articles = [
  {
    slug: "effective-dated-payroll",
    title: "Why payroll rules must be effective-dated",
    excerpt: "Statutory rates change mid-year. Here is how a payroll engine keeps every period correct.",
    category: payroll,
    tags: [{ slug: "compliance", name: "Compliance" }],
    author,
    published_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-05T08:00:00Z",
    reading_minutes: 4,
    body_html:
      '<p>Rates change. Payroll must not.</p>\n<h2 id="the-problem">The problem</h2>\n<p>Synthetic example only.</p>\n<h2 id="the-approach">The approach</h2>\n<p>Rules carry the dates they apply from.</p>\n',
    headings: [
      { id: "the-problem", text: "The problem", level: 2 },
      { id: "the-approach", text: "The approach", level: 2 },
    ],
  },
  {
    slug: "maker-checker-lending",
    title: "Maker-checker approvals in lending",
    excerpt: "Separating who prepares a loan decision from who approves it.",
    category: lending,
    tags: [{ slug: "governance", name: "Governance" }],
    author,
    published_at: "2026-09-20T08:00:00Z",
    updated_at: "2026-09-20T08:00:00Z",
    reading_minutes: 3,
    body_html: "<p>Two people, one decision.</p>\n",
    headings: [],
  },
];

const summary = (a) => ({
  slug: a.slug,
  title: a.title,
  excerpt: a.excerpt,
  category: a.category,
  tags: a.tags,
  author: a.author,
  published_at: a.published_at,
  reading_minutes: a.reading_minutes,
});

function list(url) {
  const locale = url.searchParams.get("locale") ?? "en";
  const category = url.searchParams.get("category");
  const tag = url.searchParams.get("tag");
  const q = url.searchParams.get("q")?.toLowerCase();
  const page = Number(url.searchParams.get("page") ?? 1);
  const perPage = Number(url.searchParams.get("per_page") ?? 12);
  const matches = (locale === "en" ? articles : []).filter(
    (a) =>
      (!category || a.category.slug === category) &&
      (!tag || a.tags.some((t) => t.slug === tag)) &&
      (!q || `${a.title} ${a.excerpt}`.toLowerCase().includes(q)),
  );
  return {
    items: matches.slice((page - 1) * perPage, page * perPage).map(summary),
    page,
    per_page: perPage,
    total: matches.length,
    total_pages: Math.ceil(matches.length / perPage),
  };
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/v1/articles") return send(200, list(url));
  if (url.pathname === "/v1/categories") {
    const en = (url.searchParams.get("locale") ?? "en") === "en";
    return send(
      200,
      [payroll, lending].map((c) => ({ ...c, article_count: en ? 1 : 0 })),
    );
  }
  const match = /^\/v1\/articles\/([a-z0-9-]+)$/.exec(url.pathname);
  if (match && (url.searchParams.get("locale") ?? "en") === "en") {
    const article = articles.find((a) => a.slug === match[1]);
    if (article) {
      const related = articles.filter((a) => a !== article).map(summary);
      return send(200, { ...article, seo_title: article.title, seo_description: article.excerpt, related });
    }
  }
  if (url.pathname === "/health") return send(200, { status: "ok" });
  send(404, { error: { code: "not_found", message: "Not found." } });
}).listen(PORT);
