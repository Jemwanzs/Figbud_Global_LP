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
    const { credentialId, ...publicUser } = user;
    return send(200, { user: publicUser });
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
  if (path === "me") {
    const { credentialId, ...publicUser } = user;
    return send(200, { user: publicUser });
  }
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
