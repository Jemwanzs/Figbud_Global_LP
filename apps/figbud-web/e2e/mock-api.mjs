// Minimal stand-in for the API, so end-to-end tests exercise real server-side
// fetching and the admin proxy without a database.
// - Blog & Insights (services/api/src/cms): English has articles; Swahili has none.
// - Admin (services/api/src/admin): invites, passkey sign-in, sessions. Passkey
//   cryptography is verified by the Rust tests; here the browser's virtual
//   authenticator runs real ceremonies and the mock checks each response's
//   client data (type, challenge, origin) and the Origin header (CSRF).
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_API_PORT ?? 3199);

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

const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN ?? "http://localhost:3100";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const users = new Map(); // email -> { id, email, name, role, credentialId }
const sessions = new Map(); // token -> email
const challenges = new Map(); // id -> { kind, challenge, email, name }
const usedInvites = new Set();
const audit = [];

const drafts = new Map(); // editorial articles by id
// Synthetic enquiries for the inbox (no real people).
const enquiries = [
  {
    id: "0b6e7a52-3f1e-4c55-9a4b-1f4e2a7c9d01",
    reference: "FBG-2610-TEST01",
    kind: "demo_request",
    product: "zirahr",
    name: "Amina Wanjiru",
    email: "amina@example.co.ke",
    company: "Mfano Ltd",
    job_title: "HR Lead",
    country: "Kenya",
    message: "We would like a payroll demo for 120 staff.",
    status: "new",
    created_at: "2026-10-21T09:00:00Z",
    history: [],
  },
  {
    id: "0b6e7a52-3f1e-4c55-9a4b-1f4e2a7c9d02",
    reference: "FBG-2610-TEST02",
    kind: "waitlist",
    product: "expense_now",
    name: "Juma Otieno",
    email: "juma@example.com",
    company: "Sample Co",
    status: "new",
    created_at: "2026-10-20T09:00:00Z",
    history: [],
  },
];

function validateArticle(b) {
  const errors = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.slug ?? ""))
    errors.push({ field: "slug", code: "invalid", message: "Use lowercase letters, numbers and hyphens." });
  if (!String(b.title ?? "").trim())
    errors.push({ field: "title", code: "length", message: "Enter a title of up to 200 characters." });
  if (!String(b.excerpt ?? "").trim())
    errors.push({ field: "excerpt", code: "length", message: "Enter a summary of up to 400 characters." });
  if (!String(b.body_markdown ?? "").trim())
    errors.push({
      field: "body_markdown",
      code: "length",
      message: "Write the article (up to 100,000 characters).",
    });
  return errors;
}

const articleFields = (b) => ({
  slug: b.slug,
  locale: b.locale ?? "en",
  title: b.title.trim(),
  excerpt: b.excerpt.trim(),
  body_markdown: b.body_markdown,
  category: b.category ?? null,
  author: b.author ?? null,
  tags: b.tags ?? [],
  cover_image_url: b.cover_image_url || null,
  cover_image_alt: b.cover_image_alt || null,
  seo_title: b.seo_title || null,
  seo_description: b.seo_description || null,
});

const isScheduled = (a) => a.status === "published" && new Date(a.published_at) > new Date();
const detail = (a) => ({
  ...Object.fromEntries(Object.entries(a).filter(([key]) => key !== "versions")),
  updated_at: new Date().toISOString(),
  scheduled: isScheduled(a),
});
const listRow = (a) => ({
  id: a.id,
  slug: a.slug,
  locale: a.locale,
  title: a.title,
  status: a.status,
  version: a.version,
  published_at: a.published_at ?? null,
  updated_at: new Date().toISOString(),
  category: a.category,
  last_edited_by: a.last_edited_by,
  scheduled: isScheduled(a),
});

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

function readCookie(req) {
  return /(?:^|;\s*)figbud_admin=([0-9a-f]{64})/.exec(req.headers.cookie ?? "")?.[1];
}

function clientData(credential) {
  try {
    return JSON.parse(Buffer.from(credential.response.clientDataJSON, "base64url").toString());
  } catch {
    return {};
  }
}

function admin(req, res, url, body, send) {
  const path = url.pathname.slice("/v1/admin/".length);
  const userOf = () => users.get(sessions.get(readCookie(req)));
  if (req.method === "POST" && req.headers.origin !== ADMIN_ORIGIN) {
    return send(403, { error: { code: "forbidden", message: "You don't have permission to do that." } });
  }
  const signIn = (user, action) => {
    const token = randomBytes(32).toString("hex");
    sessions.set(token, user.email);
    audit.unshift({
      id: randomBytes(8).toString("hex"),
      action,
      actor_email: user.email,
      detail: {},
      created_at: new Date().toISOString(),
    });
    res.setHeader("set-cookie", `figbud_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600`);
    return send(200, { user: publicUser(user) });
  };
  const ceremony = (kind, fields) => {
    const id = randomBytes(16).toString("hex");
    const challenge = b64url(randomBytes(32));
    challenges.set(id, { kind, challenge, ...fields });
    return { id, challenge };
  };
  const consume = (kind, credential, type) => {
    const c = challenges.get(body.challenge_id);
    challenges.delete(body.challenge_id);
    const data = clientData(credential ?? {});
    const valid =
      c &&
      c.kind === kind &&
      data.type === type &&
      data.challenge === c.challenge &&
      data.origin === ADMIN_ORIGIN;
    return valid ? c : null;
  };

  if (path === "invites/accept/start") {
    if (!/^[0-9a-f]{64}$/.test(body.token ?? "") || usedInvites.has(body.token)) {
      return send(401, {
        error: { code: "unauthorized", message: "This invite is invalid, used or expired." },
      });
    }
    const email = `${body.token.slice(0, 10)}@figbud.test`;
    const name = body.name?.trim() || "New Admin";
    const { id, challenge } = ceremony("register", { email, name, token: body.token });
    return send(200, {
      challenge_id: id,
      options: {
        publicKey: {
          rp: { id: "localhost", name: "FigBud Global Admin" },
          user: { id: b64url(email), name: email, displayName: name },
          challenge,
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          timeout: 60000,
          authenticatorSelection: { residentKey: "discouraged", userVerification: "required" },
          attestation: "none",
        },
      },
    });
  }
  if (path === "invites/accept/finish") {
    const c = consume("register", body.credential, "webauthn.create");
    if (!c || !body.credential?.response?.attestationObject) {
      return send(401, {
        error: { code: "unauthorized", message: "The passkey could not be verified. Please try again." },
      });
    }
    usedInvites.add(c.token);
    const user = {
      id: randomBytes(8).toString("hex"),
      email: c.email,
      name: c.name,
      role: "owner",
      credentialId: body.credential.rawId,
    };
    users.set(user.email, user);
    return signIn(user, "admin.user_created");
  }
  if (path === "login/start") {
    const user = users.get((body.email ?? "").trim().toLowerCase());
    if (!user) {
      return send(401, {
        error: {
          code: "unauthorized",
          message: "No passkey is registered for this email. Ask an owner for an invite.",
        },
      });
    }
    const { id, challenge } = ceremony("login", { email: user.email });
    return send(200, {
      challenge_id: id,
      options: {
        publicKey: {
          challenge,
          rpId: "localhost",
          timeout: 60000,
          userVerification: "required",
          allowCredentials: [{ type: "public-key", id: user.credentialId }],
        },
      },
    });
  }
  if (path === "login/finish") {
    const c = consume("login", body.credential, "webauthn.get");
    const user = c && users.get(c.email);
    if (!user || body.credential.rawId !== user.credentialId) {
      return send(401, {
        error: { code: "unauthorized", message: "The passkey could not be verified. Please try again." },
      });
    }
    return signIn(user, "admin.login");
  }
  const user = userOf();
  if (!user) return send(401, { error: { code: "unauthorized", message: "Please sign in." } });
  if (path === "me") return send(200, { user: publicUser(user) });
  if (path === "logout") {
    sessions.delete(readCookie(req));
    res.setHeader("set-cookie", "figbud_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    res.writeHead(204);
    return res.end();
  }
  if (path === "invites" && req.method === "POST") {
    const token = randomBytes(32).toString("hex");
    audit.unshift({
      id: token.slice(0, 16),
      action: "admin.invite_created",
      actor_email: user.email,
      detail: { email: body.email },
      created_at: new Date().toISOString(),
    });
    return send(201, {
      invite_url: `${ADMIN_ORIGIN}/admin/invite#token=${token}`,
      expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    });
  }
  if (path === "audit") return send(200, audit.slice(0, 200));

  // --- Enquiries inbox (services/api/src/admin/enquiries.rs) ---
  if (path === "enquiries" || path === "enquiries/export") {
    const p = url.searchParams;
    const q = (p.get("q") ?? "").toLowerCase();
    const rows = enquiries.filter(
      (e) =>
        (!p.get("status") || e.status === p.get("status")) &&
        (!p.get("kind") || e.kind === p.get("kind")) &&
        (!p.get("product") || e.product === p.get("product")) &&
        (!q || `${e.name} ${e.email} ${e.company} ${e.reference}`.toLowerCase().includes(q)) &&
        (p.get("status") === "spam" || e.status !== "spam"),
    );
    if (path === "enquiries") {
      return send(200, {
        items: rows,
        page: 1,
        per_page: 50,
        total: rows.length,
        total_pages: rows.length ? 1 : 0,
      });
    }
    if (user.role !== "owner")
      return send(403, { error: { code: "forbidden", message: "You don't have permission to do that." } });
    const csv = [
      "reference,name,email",
      ...rows.map((e) => [e.reference, e.name, e.email].map((v) => `"${v}"`).join(",")),
    ].join("\r\n");
    res.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="figbud-enquiries-test.csv"',
    });
    return res.end(csv);
  }
  const enq = /^enquiries\/([0-9a-f-]{36})(\/status)?$/.exec(path);
  if (enq) {
    const e = enquiries.find((x) => x.id === enq[1]);
    if (!e) return send(404, { error: { code: "not_found", message: "Not found." } });
    if (enq[2]) {
      if (!["new", "contacted", "qualified", "closed", "spam"].includes(body.status))
        return send(400, { error: { code: "bad_request", message: "unknown filter value" } });
      e.history.unshift({
        action: "enquiry.status_changed",
        actor_email: user.email,
        detail: { from: e.status, to: body.status },
        created_at: new Date().toISOString(),
      });
      e.status = body.status;
      return send(200, { status: e.status });
    }
    const { history, ...enquiry } = { ...e };
    return send(200, {
      enquiry: {
        ...enquiry,
        locale: "en",
        source_path: "/en/contact",
        is_spam: e.status === "spam",
        updated_at: e.created_at,
      },
      emails: [
        { template: "team_notification", status: "pending", attempts: 0 },
        { template: "visitor_acknowledgement", status: "pending", attempts: 0 },
      ],
      history,
    });
  }

  // --- Editorial (services/api/src/cms/editorial.rs) ---
  if (path === "cms/taxonomy") {
    return send(200, {
      categories: [payroll, lending].map((c) => ({ ...c, detail: null })),
      authors: [{ slug: "editorial", name: "FigBud Editorial", detail: "Editorial team" }],
      tags: [],
    });
  }
  if (path === "cms/preview") {
    const escaped = String(body.body_markdown ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
    return send(200, { html: `<p>${escaped}</p>`, headings: [], reading_minutes: 1 });
  }
  if (path === "cms/articles" && req.method === "GET") {
    return send(200, [...drafts.values()].map(listRow).reverse());
  }
  if (path === "cms/articles" && req.method === "POST") {
    const errors = validateArticle(body);
    if (errors.length)
      return send(422, {
        error: { code: "validation_failed", message: "Some fields need attention.", fields: errors },
      });
    if ([...drafts.values()].some((d) => d.slug === body.slug && d.locale === (body.locale ?? "en"))) {
      return send(422, {
        error: {
          code: "validation_failed",
          message: "Some fields need attention.",
          fields: [
            {
              field: "slug",
              code: "taken",
              message: "Another article in this language already uses this address.",
            },
          ],
        },
      });
    }
    const id = crypto.randomUUID();
    const article = {
      ...articleFields(body),
      id,
      status: "draft",
      version: 1,
      versions: [],
      last_edited_by: user.name,
      last_edited_by_id: user.id,
    };
    article.versions.push({
      version: 1,
      title: article.title,
      edited_by: user.email,
      created_at: new Date().toISOString(),
    });
    drafts.set(id, article);
    return send(201, detail(article));
  }
  const cms = /^cms\/articles\/([0-9a-f-]{36})(?:\/(submit|publish|archive|restore|versions))?$/.exec(path);
  if (cms) {
    const article = drafts.get(cms[1]);
    if (!article) return send(404, { error: { code: "not_found", message: "Not found." } });
    const conflict = (message) => send(409, { error: { code: "conflict", message } });
    switch (cms[2]) {
      case undefined:
        if (req.method === "GET") return send(200, detail(article));
        if (body.version !== article.version) {
          return conflict(
            "Someone saved this article after you opened it. Reload to see the latest version, then reapply your changes.",
          );
        }
        {
          const errors = validateArticle(body);
          if (errors.length)
            return send(422, {
              error: { code: "validation_failed", message: "Some fields need attention.", fields: errors },
            });
        }
        Object.assign(article, articleFields(body), {
          version: article.version + 1,
          last_edited_by: user.name,
          last_edited_by_id: user.id,
        });
        article.versions.unshift({
          version: article.version,
          title: article.title,
          edited_by: user.email,
          created_at: new Date().toISOString(),
        });
        return send(200, detail(article));
      case "versions":
        return send(200, article.versions);
      case "submit":
        if (article.status !== "draft") return conflict("Only drafts can be submitted for review.");
        article.status = "in_review";
        return send(200, detail(article));
      case "publish":
        if (!["draft", "in_review"].includes(article.status))
          return conflict("Only drafts and articles in review can be published.");
        Object.assign(article, {
          status: "published",
          approved_by: user.email,
          published_at: body.published_at ?? new Date().toISOString(),
        });
        return send(200, detail(article));
      case "archive":
        if (article.status === "archived") return conflict("This article is already archived.");
        article.status = "archived";
        return send(200, detail(article));
      case "restore":
        if (article.status !== "archived") return conflict("Only archived articles can be restored.");
        Object.assign(article, { status: "draft", approved_by: null, published_at: null });
        return send(200, detail(article));
    }
  }
  return send(404, { error: { code: "not_found", message: "Not found." } });
}

createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const send = (status, payload) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  };
  if (url.pathname.startsWith("/v1/admin/")) return admin(req, res, url, body, send);
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
