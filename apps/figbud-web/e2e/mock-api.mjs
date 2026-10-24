// Minimal stand-in for the API, so end-to-end tests exercise real server-side
// fetching and the admin proxy without a database.
// - Blog & Insights (services/api/src/cms): English has articles; Swahili has none.
// - Admin (services/api/src/admin): invites, passkey sign-in, sessions. Passkey
//   cryptography is verified by the Rust tests; here the browser's virtual
//   authenticator runs real ceremonies and the mock checks each response's
//   client data (type, challenge, origin) and the Origin header (CSRF).
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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

// Website registry (Admin Studio, Phase B), mirroring services/api/src/sites.rs.
const SITE_STATUSES = ["draft", "coming_soon", "beta", "active", "retired"];
const SITE_MOVES = {
  draft: ["coming_soon", "beta", "active"],
  coming_soon: ["draft", "beta", "active", "retired"],
  beta: ["coming_soon", "active", "retired"],
  active: ["coming_soon", "beta", "retired"],
  retired: ["coming_soon"],
};
const SITE_TEMPLATES = {
  hr_workforce: "hr",
  lending_credit: "lending",
  finance_payments: "finance",
  custom_enterprise: "custom",
};
const seedSite = (n, slug, kind, name, tagline, category, template, status) => ({
  id: `01928d6c-0000-7000-8000-00000000000${n}`,
  slug,
  kind,
  name,
  tagline,
  description: null,
  category,
  template,
  status,
  primary_domain: null,
  position: n - 1,
  archived_at: null,
  version: 1,
  updated_at: new Date().toISOString(),
  show_on_map: true,
  requests: [],
});
const sites = [
  seedSite(
    1,
    "figbud",
    "corporate",
    "FigBud Global",
    "From vision to value, we deliver.",
    "corporate",
    "corporate",
    "active",
  ),
  seedSite(
    2,
    "zirahr",
    "product",
    "ZiraHR",
    "People. Payroll. Progress. Connected.",
    "hr_workforce",
    "hr",
    "active",
  ),
  seedSite(
    3,
    "jasiri",
    "product",
    "Jasiri LMS",
    "Every loan. Every decision. Connected.",
    "lending_credit",
    "lending",
    "active",
  ),
  seedSite(
    4,
    "expense_now",
    "product",
    "Expense Now",
    "Spend smarter. Move money better.",
    "finance_payments",
    "finance",
    "coming_soon",
  ),
  seedSite(
    5,
    "ziwa",
    "product",
    "Ziwa LMS",
    "Lending that flows with your business.",
    "lending_credit",
    "lending",
    "coming_soon",
  ),
];
const siteRow = ({ requests, ...s }) => ({
  ...s,
  pending_to_status: requests.find((r) => r.decision === "pending")?.to_status ?? null,
});
const SITE_CTA = { coming_soon: "waitlist", beta: "early_access", active: "demo" };
const publicSites = () =>
  sites
    .filter((s) => !s.archived_at && SITE_CTA[s.status])
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      ...Object.fromEntries(
        Object.entries(s).filter(([k]) => !["requests", "archived_at", "version"].includes(k)),
      ),
      cta: SITE_CTA[s.status],
      brand: publishedBrand(s.slug),
    }));
const RANKS = { viewer: 0, editor: 1, reviewer: 2, owner: 3 };

function siteRoutes(path, req, body, user, send) {
  const notFound = () => send(404, { error: { code: "not_found", message: "Not found." } });
  const forbidden = (message = "You don't have permission to do that.") =>
    send(403, { error: { code: "forbidden", message } });
  const conflict = (message) => send(409, { error: { code: "conflict", message } });
  const invalid = (fields) =>
    send(422, { error: { code: "validation", message: "Please check the highlighted fields.", fields } });
  const fieldsOf = (b, creating) => {
    const errors = [];
    if (!String(b.name ?? "").trim())
      errors.push({ field: "name", code: "required", message: "Enter a name." });
    if (creating && !/^[a-z0-9]+([_-][a-z0-9]+)*$/.test(b.slug ?? ""))
      errors.push({ field: "slug", code: "format", message: "Use lower-case letters, numbers, - or _." });
    if (creating && sites.some((s) => s.slug === b.slug))
      errors.push({ field: "slug", code: "taken", message: "Another website already uses this identifier." });
    if (b.primary_domain && !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(b.primary_domain))
      errors.push({
        field: "primary_domain",
        code: "format",
        message: "Enter a host name such as product.example.com.",
      });
    return errors;
  };

  const withBrand = (s) => ({ ...siteRow(s), brand: publishedBrand(s.slug) });
  if (path === "sites" && req.method === "GET") return send(200, sites.map(withBrand));
  if (path === "sites" && req.method === "POST") {
    if (user.role !== "owner") return forbidden();
    const errors = fieldsOf(body, true);
    if (errors.length) return invalid(errors);
    const site = {
      ...seedSite(
        5,
        body.slug,
        "product",
        body.name.trim(),
        body.tagline || null,
        body.category,
        body.template || SITE_TEMPLATES[body.category],
        "draft",
      ),
      id: randomUUID(),
      description: body.description || null,
      primary_domain: body.primary_domain || null,
      position: sites.length,
    };
    if (body.launch_status && body.launch_status !== "draft") {
      site.requests.push({
        id: randomUUID(),
        from_status: "draft",
        to_status: body.launch_status,
        reason: "Launch status chosen when the website was created.",
        requested_by: user.name,
        requested_by_id: user.id,
        decision: "pending",
        created_at: new Date().toISOString(),
      });
    }
    sites.push(site);
    return send(201, siteRow(site));
  }
  const m =
    /^sites\/([a-z0-9_-]+)(?:\/(archive|restore|status-requests)(?:\/([0-9a-f-]{36})\/(approve|reject|cancel))?)?$/.exec(
      path,
    );
  const site = m && sites.find((s) => s.slug === m[1]);
  if (!site) return notFound();
  const [, , action, requestId, decision] = m;
  if (!action && req.method === "GET") {
    return send(200, { site: withBrand(site), status_requests: site.requests.slice().reverse() });
  }
  const touch = () =>
    Object.assign(site, { version: site.version + 1, updated_at: new Date().toISOString() });
  if (!action) {
    if (user.role !== "owner") return forbidden();
    if (body.version !== site.version) return conflict("This website was changed by someone else.");
    const errors = fieldsOf(body, false);
    if (errors.length) return invalid(errors);
    Object.assign(site, {
      name: body.name.trim(),
      tagline: body.tagline || null,
      description: body.description || null,
      primary_domain: body.primary_domain || null,
      ...(typeof body.show_on_map === "boolean" ? { show_on_map: body.show_on_map } : {}),
      ...(site.kind === "product"
        ? { category: body.category, template: body.template || site.template }
        : {}),
    });
    touch();
    return send(200, siteRow(site));
  }
  if (action === "archive" || action === "restore") {
    if (user.role !== "owner") return forbidden();
    if (site.kind === "corporate") return forbidden("The corporate website cannot be archived.");
    site.archived_at = action === "archive" ? new Date().toISOString() : null;
    touch();
    return send(200, siteRow(site));
  }
  if (RANKS[user.role] < RANKS.reviewer) return forbidden();
  if (site.kind === "corporate") return forbidden("The corporate website is always active.");
  const pending = site.requests.find((r) => r.decision === "pending");
  if (!requestId) {
    if (site.archived_at) return conflict("Restore this website before changing its status.");
    if (pending) return conflict("This website already has a status change awaiting approval.");
    if (!SITE_STATUSES.includes(body.to_status) || !SITE_MOVES[site.status].includes(body.to_status))
      return invalid([
        { field: "to_status", code: "not_allowed", message: "That status change isn't available." },
      ]);
    if (!String(body.reason ?? "").trim())
      return invalid([{ field: "reason", code: "length", message: "Explain the change." }]);
    const request = {
      id: randomUUID(),
      from_status: site.status,
      to_status: body.to_status,
      reason: body.reason.trim(),
      requested_by: user.name,
      requested_by_id: user.id,
      decision: "pending",
      created_at: new Date().toISOString(),
    };
    site.requests.push(request);
    return send(201, request);
  }
  if (!pending || pending.id !== requestId) return notFound();
  const own = pending.requested_by_id === user.id;
  if (decision === "cancel" && !own && user.role !== "owner") return forbidden();
  if (decision !== "cancel" && own && user.role !== "owner")
    return forbidden("maker-checker: someone else must decide your request.");
  if (decision === "approve" && site.status !== pending.from_status)
    return conflict("The status changed since this was requested.");
  Object.assign(pending, {
    decision: { approve: "approved", reject: "rejected", cancel: "cancelled" }[decision],
    decided_by: user.name,
    decision_note: body.note ?? null,
    decided_at: new Date().toISOString(),
  });
  if (decision === "approve") {
    site.status = pending.to_status;
    touch();
  }
  return send(200, siteRow(site));
}

// Brand profiles and logo library (services/api/src/brand), seeded from the
// same files as the real API. Images are validated loosely (magic bytes and
// declared type); the Rust tests cover sanitising and decoding.
const SEED_DIR = new URL("../../../services/api/seed/brand/", import.meta.url);
const brandAssets = new Map(); // id -> asset (with data Buffer)
const brands = new Map(); // site slug -> profile

const BRAND_DEFAULTS = {
  figbud: ["#f0a65d", "#a66538", "#f6bd82"],
  zirahr: ["#22d3ee", "#0891b2", "#11e6ff"],
  jasiri: ["#22c55e", "#7c3aed", "#4ade80"],
  expense_now: ["#f97316", "#ea580c", "#fdba74"],
};
const emptyPair = () => ({ on_dark: null, on_light: null });
const defaultBrand = (slug) => {
  const [primary, secondary, accent] = BRAND_DEFAULTS[slug] ?? BRAND_DEFAULTS.figbud;
  return {
    logos: { horizontal: emptyPair(), stacked: emptyPair(), symbol: emptyPair(), wordmark: emptyPair() },
    favicon: null,
    app_icon: null,
    social_image: null,
    colors: { primary, secondary, accent },
    logo_height: 28,
  };
};
const clone = (value) => JSON.parse(JSON.stringify(value));

function imageInfo(data, type) {
  if (
    type === "image/png" &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (
    type === "image/webp" &&
    data.subarray(0, 4).toString() === "RIFF" &&
    data.subarray(8, 12).toString() === "WEBP"
  ) {
    return { width: 400, height: 200 };
  }
  if (type === "image/svg+xml") {
    const text = data.toString("utf8");
    if (!text.includes("<svg") || /<script|<foreignobject|<image|<!doctype|<text/i.test(text)) return null;
    const box = /viewBox="[\d.\s-]*?\s([\d.]+)\s+([\d.]+)"/.exec(text);
    const w = /\swidth="([\d.]+)"/.exec(text)?.[1] ?? box?.[1];
    const h = /\sheight="([\d.]+)"/.exec(text)?.[1] ?? box?.[2];
    return w && h ? { width: Math.round(Number(w)), height: Math.round(Number(h)) } : null;
  }
  return null;
}

function storeAsset(slug, data, type, label, alt, origin) {
  const existing = [...brandAssets.values()].find((a) => a.site === slug && a.data.equals(data));
  if (existing) return [200, existing];
  const info = imageInfo(data, type);
  // Stable ids (from the contents), so a build and a later test run agree on file URLs.
  const hex = createHash("sha256").update(slug).update(data).digest("hex");
  const asset = {
    id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
    site: slug,
    label,
    alt_text: alt,
    content_type: type,
    width: info.width,
    height: info.height,
    has_alpha: true,
    byte_size: data.length,
    origin,
    archived_at: null,
    created_at: new Date().toISOString(),
    widths: [],
    data,
  };
  brandAssets.set(asset.id, asset);
  return [201, asset];
}

const BRAND_SEED = {
  figbud: [
    "FigBud Global",
    [
      [
        "figbud-horizontal-on-dark-official.png",
        "official",
        "FigBud logo (official, for dark backgrounds)",
        "horizontal",
        ["on_dark"],
      ],
      [
        "figbud-symbol-on-dark-official.png",
        "official",
        "FigBud symbol (official, for dark backgrounds)",
        "symbol",
        ["on_dark"],
      ],
      [
        "figbud-favicon-official.png",
        "official",
        "FigBud favicon (official symbol on a dark tile)",
        "favicon",
        [],
      ],
      [
        "figbud-app-icon-official.png",
        "official",
        "FigBud app icon (official symbol on a dark tile)",
        "app_icon",
        [],
      ],
      [
        "figbud-horizontal-on-light-proposed.png",
        "proposed",
        "FigBud logo for light backgrounds (proposed recolour)",
        "horizontal",
        ["on_light"],
      ],
      [
        "figbud-symbol-on-light-proposed.png",
        "proposed",
        "FigBud symbol for light backgrounds (proposed recolour)",
        "symbol",
        ["on_light"],
      ],
    ],
  ],
  zirahr: [
    "ZiraHR",
    [
      [
        "zirahr-symbol-official.png",
        "official",
        "ZiraHR symbol (official)",
        "symbol",
        ["on_dark", "on_light"],
      ],
      ["zirahr-favicon-official.png", "official", "ZiraHR favicon (official symbol)", "favicon", []],
      [
        "zirahr-app-icon-official.png",
        "official",
        "ZiraHR app icon (official symbol on a dark tile)",
        "app_icon",
        [],
      ],
      [
        "zirahr-supplied-incomplete.png",
        "official",
        "ZiraHR logo as supplied (incomplete: “HR” is cut off)",
        null,
        [],
      ],
    ],
  ],
  jasiri: [
    "Jasiri LMS",
    [
      [
        "jasiri-horizontal-on-dark-official.png",
        "official",
        "Jasiri logo (official, for dark backgrounds)",
        "horizontal",
        ["on_dark"],
      ],
      [
        "jasiri-horizontal-on-light-proposed.png",
        "proposed",
        "Jasiri logo for light backgrounds (proposed recolour)",
        "horizontal",
        ["on_light"],
      ],
    ],
  ],
  expense_now: [
    "Expense Now",
    [
      [
        "expense-now-horizontal-on-dark-proposed.svg",
        "proposed",
        "Expense Now logo concept (dark backgrounds)",
        "horizontal",
        ["on_dark"],
      ],
      [
        "expense-now-horizontal-on-light-proposed.svg",
        "proposed",
        "Expense Now logo concept (light backgrounds)",
        "horizontal",
        ["on_light"],
      ],
      [
        "expense-now-symbol-proposed.svg",
        "proposed",
        "Expense Now symbol concept",
        "symbol",
        ["on_dark", "on_light"],
      ],
      ["expense-now-favicon-proposed.svg", "proposed", "Expense Now favicon concept", "favicon", []],
    ],
  ],
  ziwa: [
    "Ziwa LMS",
    [
      [
        "ziwa-horizontal-on-dark-proposed.svg",
        "proposed",
        "Ziwa LMS logo concept (dark backgrounds)",
        "horizontal",
        ["on_dark"],
      ],
      [
        "ziwa-horizontal-on-light-proposed.svg",
        "proposed",
        "Ziwa LMS logo concept (light backgrounds)",
        "horizontal",
        ["on_light"],
      ],
      ["ziwa-symbol-proposed.svg", "proposed", "Ziwa LMS symbol concept", "symbol", ["on_dark", "on_light"]],
      ["ziwa-favicon-proposed.svg", "proposed", "Ziwa LMS favicon concept", "favicon", []],
    ],
  ],
};

function assign(config, slot, themes, id) {
  if (slot === "favicon" || slot === "app_icon") config[slot] = id;
  else if (slot) for (const theme of themes) config.logos[slot][theme] = id;
}

for (const [slug, [name, files]] of Object.entries(BRAND_SEED)) {
  const published = defaultBrand(slug);
  const draft = defaultBrand(slug);
  for (const [file, origin, label, slot, themes] of files) {
    const data = readFileSync(new URL(file, SEED_DIR));
    const [, asset] = storeAsset(
      slug,
      data,
      file.endsWith(".svg") ? "image/svg+xml" : "image/png",
      label,
      name,
      origin,
    );
    if (origin === "official") assign(published, slot, themes, asset.id);
    assign(draft, slot, themes, asset.id);
  }
  const official = files.some(([, origin]) => origin === "official");
  const revision = official
    ? {
        id: randomUUID(),
        number: 1,
        config: clone(published),
        note: "Official logos supplied by FigBud",
        state: "published",
        requested_by: null,
        requested_by_id: null,
        decided_by: null,
        decision_note: null,
        created_at: new Date().toISOString(),
        decided_at: new Date().toISOString(),
      }
    : null;
  brands.set(slug, {
    draft,
    draft_version: 1,
    draft_note:
      slug === "expense_now" || slug === "ziwa"
        ? `Proposed ${name} logo concept: not approved. Review before submitting.`
        : JSON.stringify(draft) !== JSON.stringify(published)
          ? "Proposed light-background versions of the official logos: review before submitting."
          : null,
    published: official ? published : null,
    published_revision: revision?.id ?? null,
    published_at: revision?.decided_at ?? null,
    revisions: revision ? [revision] : [],
  });
}

const profile = (slug) => {
  if (!brands.has(slug)) {
    brands.set(slug, {
      draft: defaultBrand(slug),
      draft_version: 1,
      draft_note: null,
      published: null,
      published_revision: null,
      published_at: null,
      revisions: [],
    });
  }
  return brands.get(slug);
};

const assetIds = (c) =>
  c
    ? [
        ...Object.values(c.logos).flatMap((p) => [p.on_dark, p.on_light]),
        c.favicon,
        c.app_icon,
        c.social_image,
      ].filter(Boolean)
    : [];

function placements(c, id) {
  if (!c) return [];
  const out = [];
  for (const [slot, pair] of Object.entries(c.logos)) {
    if (pair.on_dark === id) out.push({ slot, theme: "dark" });
    if (pair.on_light === id) out.push({ slot, theme: "light" });
  }
  for (const slot of ["favicon", "app_icon", "social_image"])
    if (c[slot] === id) out.push({ slot, theme: null });
  return out;
}

const hexLum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [hexLum(a), hexLum(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};

function brandChecks(c) {
  const dark = ratio(c.colors.primary, "#120f0d");
  const light = ratio(c.colors.primary, "#fbf7f1");
  return [
    {
      id: "logo_on_dark",
      required: true,
      ok: Boolean(c.logos.horizontal.on_dark || c.logos.symbol.on_dark),
      label: "A horizontal or symbol logo for dark backgrounds (the default theme)",
    },
    {
      id: "logo_on_light",
      required: false,
      ok: Boolean(c.logos.horizontal.on_light || c.logos.symbol.on_light),
      label:
        "A logo for light backgrounds (otherwise the light theme shows the dark-background logo on a dark plate)",
    },
    {
      id: "primary_on_dark",
      required: true,
      ok: dark >= 3,
      ratio: dark,
      label: "Primary colour stands out on the dark theme (at least 3:1)",
    },
    {
      id: "primary_on_light",
      required: false,
      ok: light >= 3,
      ratio: light,
      label: "Primary colour stands out on the light theme (at least 3:1; darker shades are used for text)",
    },
  ];
}
const publishable = (c) => brandChecks(c).every((check) => check.ok || !check.required);

function resolveBrand(c) {
  const ref = (id) => {
    const a = id && brandAssets.get(id);
    return a
      ? {
          id: a.id,
          url: `/v1/brand/assets/${a.id}`,
          alt: a.alt_text,
          content_type: a.content_type,
          width: a.width,
          height: a.height,
          widths: [],
        }
      : null;
  };
  const pair = (p) => ({ on_dark: ref(p.on_dark), on_light: ref(p.on_light) });
  return {
    logos: Object.fromEntries(Object.entries(c.logos).map(([k, p]) => [k, pair(p)])),
    favicon: ref(c.favicon),
    app_icon: ref(c.app_icon),
    social_image: ref(c.social_image),
    colors: c.colors,
    logo_height: c.logo_height,
  };
}

const publicAsset = (a) =>
  Object.fromEntries(Object.entries(a).filter(([key]) => key !== "data" && key !== "site"));

function serveAsset(res, asset) {
  res.writeHead(200, {
    "content-type": asset.content_type,
    "cache-control": "public, max-age=31536000, immutable",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
  res.end(asset.data);
}

function publishedBrand(slug) {
  const published = brands.get(slug)?.published;
  return published ? resolveBrand(published) : null;
}

function brandRoutes(path, req, res, url, body, raw, user, send) {
  const forbidden = (message = "You don't have permission to do that.") =>
    send(403, { error: { code: "forbidden", message } });
  const conflict = (message) => send(409, { error: { code: "conflict", message } });
  const invalid = (fields) =>
    send(422, { error: { code: "validation", message: "Please check the highlighted fields.", fields } });
  const notFound = () => send(404, { error: { code: "not_found", message: "Not found." } });
  const rank = RANKS[user.role];

  const assetMatch = /^brand\/assets\/([0-9a-f-]{36})$/.exec(path);
  if (assetMatch) {
    const asset = brandAssets.get(assetMatch[1]);
    return asset ? serveAsset(res, asset) : notFound();
  }
  const m =
    /^sites\/([a-z0-9_-]+)\/brand(?:\/(draft|uploads|submit|assets\/([0-9a-f-]{36})\/(archive|restore)|revisions\/([0-9a-f-]{36})\/(approve|reject|cancel|restore)))?$/.exec(
      path,
    );
  const site = m && sites.find((s) => s.slug === m[1]);
  if (!site) return notFound();
  const slug = site.slug;
  const p = profile(slug);
  const [, , action, assetId, assetAction, revisionId, revisionAction] = m;
  const pending = p.revisions.find((r) => r.state === "pending");

  if (!action && req.method === "GET") {
    const mine = [...brandAssets.values()].filter((a) => a.site === slug);
    return send(200, {
      draft: p.draft,
      draft_version: p.draft_version,
      draft_note: p.draft_note,
      draft_updated_at: new Date().toISOString(),
      draft_updated_by: null,
      draft_differs: JSON.stringify(p.draft) !== JSON.stringify(p.published),
      checks: brandChecks(p.draft),
      publishable: publishable(p.draft),
      published: p.published,
      published_revision: p.published_revision,
      published_at: p.published_at,
      assets: mine
        .sort(
          (a, b) =>
            Boolean(a.archived_at) - Boolean(b.archived_at) || b.created_at.localeCompare(a.created_at),
        )
        .map((a) => ({
          ...publicAsset(a),
          used_in: {
            draft: placements(p.draft, a.id),
            published: placements(p.published, a.id),
            pending: placements(pending?.config, a.id),
          },
        })),
      revisions: p.revisions.slice().sort((a, b) => b.number - a.number),
    });
  }
  if (rank < RANKS.editor) return forbidden();

  if (action === "uploads") {
    const label = url.searchParams.get("label")?.trim();
    const alt = url.searchParams.get("alt")?.trim();
    const type = req.headers["content-type"];
    const errors = [];
    if (!label)
      errors.push({ field: "label", code: "required", message: "Name this file (up to 120 characters)." });
    if (!alt)
      errors.push({
        field: "alt_text",
        code: "required",
        message: "Describe the logo for screen readers, usually the product name (up to 200 characters).",
      });
    const info = ["image/svg+xml", "image/png", "image/webp"].includes(type) ? imageInfo(raw, type) : null;
    if (!info) errors.push({ field: "file", code: "invalid", message: "Upload an SVG, PNG or WebP file." });
    if (errors.length) return invalid(errors);
    const [status, asset] = storeAsset(slug, raw, type, label, alt, "upload");
    return send(status, publicAsset(asset));
  }
  if (action === "draft") {
    if (body.version !== p.draft_version)
      return conflict("Someone else changed this brand draft. Reload to see their changes.");
    const config = body.config;
    if (!["primary", "secondary", "accent"].every((k) => /^#[0-9a-f]{6}$/i.test(config?.colors?.[k] ?? ""))) {
      return invalid([
        { field: "colors.primary", code: "format", message: "Use a six-digit hex colour such as #22d3ee." },
      ]);
    }
    p.draft = config;
    p.draft_version += 1;
    return send(200, {
      draft_version: p.draft_version,
      checks: brandChecks(config),
      publishable: publishable(config),
    });
  }
  if (assetId) {
    const asset = brandAssets.get(assetId);
    if (!asset || asset.site !== slug) return notFound();
    const used = [p.draft, p.published, pending?.config].some((c) => assetIds(c).includes(assetId));
    if (assetAction === "archive" && used)
      return conflict("This file is in use. Choose another file for those places first, then archive it.");
    asset.archived_at = assetAction === "archive" ? new Date().toISOString() : null;
    return send(200, publicAsset(asset));
  }
  if (action === "submit") {
    if (!String(body.note ?? "").trim())
      return invalid([
        { field: "note", code: "length", message: "Say what changed in up to 300 characters." },
      ]);
    if (!publishable(p.draft)) return conflict("Fix the required brand checks before submitting.");
    if (pending) return conflict("A brand change is already waiting for approval.");
    const revision = {
      id: randomUUID(),
      number: Math.max(0, ...p.revisions.map((r) => r.number)) + 1,
      config: clone(p.draft),
      note: body.note.trim(),
      state: "pending",
      requested_by: user.name,
      requested_by_id: user.id,
      decided_by: null,
      decision_note: null,
      created_at: new Date().toISOString(),
      decided_at: null,
    };
    p.revisions.push(revision);
    return send(201, { id: revision.id });
  }
  const revision = p.revisions.find((r) => r.id === revisionId);
  if (!revision) return notFound();
  if (revisionAction === "restore") {
    if (revision.state !== "published") return conflict("Only published versions can be restored.");
    p.draft = clone(revision.config);
    p.draft_version += 1;
    p.draft_note = `Restored from version ${revision.number}`;
    return send(200, { restored: revision.number });
  }
  if (revision.state !== "pending") return conflict("This change has already been decided.");
  const own = revision.requested_by_id === user.id;
  if (revisionAction === "cancel" && !own && user.role !== "owner") return forbidden();
  if (revisionAction !== "cancel" && rank < RANKS.reviewer) return forbidden();
  if (revisionAction === "approve" && own && user.role !== "owner")
    return forbidden("A different reviewer must approve your own change (maker-checker).");
  Object.assign(revision, {
    state: { approve: "published", reject: "rejected", cancel: "cancelled" }[revisionAction],
    decided_by: user.name,
    decision_note: body.note ?? null,
    decided_at: new Date().toISOString(),
  });
  if (revisionAction === "approve") {
    p.published = clone(revision.config);
    p.published_revision = revision.id;
    p.published_at = revision.decided_at;
  }
  return send(200, { state: revision.state });
}

function admin(req, res, url, body, send, raw) {
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
  if (/^sites\/[a-z0-9_-]+\/brand/.test(path) || path.startsWith("brand/assets/"))
    return brandRoutes(path, req, res, url, body, raw, user, send);
  if (path === "sites" || path.startsWith("sites/")) return siteRoutes(path, req, body, user, send);
  return send(404, { error: { code: "not_found", message: "Not found." } });
}

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  let body = {};
  try {
    body =
      raw.length && !String(req.headers["content-type"]).startsWith("image/")
        ? JSON.parse(raw.toString("utf8"))
        : {};
  } catch {
    body = {};
  }
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const send = (status, payload) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  };
  if (url.pathname.startsWith("/v1/admin/")) return admin(req, res, url, body, send, raw);
  if (url.pathname === "/v1/articles") return send(200, list(url));
  if (url.pathname === "/v1/sites") return send(200, publicSites());
  const logo = /^\/v1\/brand\/assets\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (logo) {
    const asset = brandAssets.get(logo[1]);
    const live = asset && assetIds(brands.get(asset.site)?.published).includes(asset.id);
    return live ? serveAsset(res, asset) : send(404, { error: { code: "not_found", message: "Not found." } });
  }
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
