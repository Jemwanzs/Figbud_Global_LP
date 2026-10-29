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
  // Navigation, footer & forms (services/api/src/site_settings.rs).
  settings: {
    navigation: { mode: "pages", items: [] },
    footer: { note: null, links: [] },
    enquiries: { open: true, closed_message: null },
    theme: { brand_section: null, soft_section: null },
  },
  settings_version: 1,
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
// A test fixture: Jasiri LMS isn't taking enquiries and has its own menu and
// footer note, so the e2e tests can show both (no other test relies on them).
Object.assign(sites[2].settings, {
  navigation: {
    mode: "custom",
    items: [
      { label: "Lending platform", href: "/platform" },
      { label: "FigBud Global", href: "https://figbud.example.com" },
    ],
  },
  footer: {
    note: "Lending software for African lenders.",
    links: [{ label: "Security", href: "/security" }],
  },
  enquiries: { open: false, closed_message: "Jasiri LMS is taking enquiries through its partners for now." },
});
// The admin row has no settings: they have their own endpoint (sites/{slug}/settings).
// Ziwa LMS's brown and ivory section bands (migration 14).
sites[4].settings.theme = { brand_section: "#4e2d17", soft_section: "#fdf9f4" };
const siteRow = ({ requests, ...s }) => ({
  ...Object.fromEntries(Object.entries(s).filter(([k]) => !["settings", "settings_version"].includes(k))),
  pending_to_status: requests.find((r) => r.decision === "pending")?.to_status ?? null,
});
const SITE_CTA = { coming_soon: "waitlist", beta: "early_access", active: "demo" };
const publicSites = () =>
  sites
    .filter((s) => !s.archived_at && SITE_CTA[s.status])
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      ...Object.fromEntries(
        Object.entries(s).filter(
          ([k]) => !["requests", "archived_at", "version", "settings_version"].includes(k),
        ),
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

  // Mirrors the API's workspace summary (services/api/src/sites.rs).
  const workspace = (s) => {
    const mine = [...pages.values()].filter((p) => p.site === s && !p.archived_at);
    const stamps = [...mine.map((p) => p.published_at), brands.get(s.slug)?.published_at]
      .filter(Boolean)
      .sort();
    return {
      pages: mine.length,
      live_pages: mine.filter((p) => p.published && !p.offline).length,
      sections: mine.reduce((n, p) => n + p.draft.sections.length, 0),
      pending: mine.reduce(
        (n, p) => n + p.revisions.filter((r) => ["pending", "scheduled"].includes(r.state)).length,
        0,
      ),
      last_published: stamps.at(-1) ?? null,
    };
  };
  const withBrand = (s) => ({ ...siteRow(s), brand: publishedBrand(s.slug), workspace: workspace(s) });
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
  figbud: ["#22c55e", "#3b82f6", "#a855f7"],
  zirahr: ["#22d3ee", "#0891b2", "#11e6ff"],
  jasiri: ["#22c55e", "#7c3aed", "#4ade80"],
  expense_now: ["#f97316", "#ea580c", "#fdba74"],
  ziwa: ["#fb7a1a", "#ffc642", "#d4a97a"],
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
  if (type === "image/jpeg" && data[0] === 0xff && data[1] === 0xd8) {
    for (let i = 2; i + 9 < data.length;) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      if (marker >= 0xc0 && marker <= 0xc3)
        return { width: data.readUInt16BE(i + 7), height: data.readUInt16BE(i + 5) };
      i += 2 + data.readUInt16BE(i + 2);
    }
    return null;
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
  // The final Ziwa LMS identity (services/api/src/brand/seed.rs).
  ziwa: [
    "Ziwa LMS",
    [
      [
        "ziwa-horizontal-on-light-official.svg",
        "official",
        "Ziwa LMS logo (approved, for light backgrounds)",
        "horizontal",
        ["on_light"],
      ],
      [
        "ziwa-horizontal-on-dark-official.svg",
        "official",
        "Ziwa LMS logo (approved, for dark backgrounds)",
        "horizontal",
        ["on_dark"],
      ],
      [
        "ziwa-symbol-official.svg",
        "official",
        "Ziwa LMS symbol (approved)",
        "symbol",
        ["on_dark", "on_light"],
      ],
      [
        "ziwa-favicon-official.svg",
        "official",
        "Ziwa LMS favicon (approved symbol on an ivory tile)",
        "favicon",
        [],
      ],
      [
        "ziwa-app-icon-official.svg",
        "official",
        "Ziwa LMS app icon (approved symbol on an ivory tile)",
        "app_icon",
        [],
      ],
      ["ziwa-favicon-dark-official.svg", "official", "Ziwa LMS favicon on brown (approved)", null, []],
      ["ziwa-app-icon-dark-official.svg", "official", "Ziwa LMS app icon on brown (approved)", null, []],
      [
        "ziwa-horizontal-one-colour-official.svg",
        "official",
        "Ziwa LMS logo, one colour (approved)",
        null,
        [],
      ],
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
      slug === "expense_now"
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
  const dark = ratio(c.colors.primary, "#020617");
  const light = ratio(c.colors.primary, "#f8fafc");
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

// Stands in for the API's square PNG icons (`?icon=`): any small PNG will do.
const ICON_PNG = readFileSync(new URL("../public/icon.png", import.meta.url));

// ---------------------------------------------------------------- media library
// Mirrors services/api/src/media.rs: images per website, alt text required,
// usage read from pages, public only while a published page uses them.
const mediaAssets = new Map(); // id -> asset (with data Buffer)

function storeMedia(slug, data, type, label, alt, by) {
  const existing = [...mediaAssets.values()].find((m) => m.site === slug && m.data.equals(data));
  if (existing) return [200, existing];
  const info = imageInfo(data, type);
  if (!info) return [422, null];
  const hex = createHash("sha256").update(`media:${slug}`).update(data).digest("hex");
  const asset = {
    id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
    site: slug,
    label,
    alt_text: alt,
    content_type: type,
    width: info.width,
    height: info.height,
    byte_size: data.length,
    archived_at: null,
    created_at: new Date().toISOString(),
    created_by: by,
    data,
  };
  mediaAssets.set(asset.id, asset);
  return [201, asset];
}

const sectionImages = (doc) => (doc?.sections ?? []).filter((s) => s.type === "image").map((s) => s.image_id);
const mediaUsage = (asset) =>
  [...pages.values()]
    .filter((p) => p.site?.slug === asset.site && !p.archived_at)
    .flatMap((p) =>
      [
        ["draft", p.draft],
        ["published", p.published],
      ]
        .filter(([, doc]) => sectionImages(doc).includes(asset.id))
        .map(([state]) => ({ page: p.id, title: p.title, path: `/${p.path}`, state })),
    );
const mediaInfo = (asset) =>
  asset && !asset.archived_at
    ? {
        id: asset.id,
        alt: asset.alt_text,
        width: asset.width,
        height: asset.height,
        content_type: asset.content_type,
        widths: [],
      }
    : null;
const mediaPublic = (asset) =>
  asset &&
  !asset.archived_at &&
  [...pages.values()].some(
    (p) =>
      p.site?.slug === asset.site &&
      !p.archived_at &&
      !p.offline &&
      sectionImages(p.published).includes(asset.id),
  );

function mediaRoutes(path, req, res, url, raw, body, user, send) {
  const editor = RANKS[user.role] >= RANKS.editor;
  const forbidden = () =>
    send(403, { error: { code: "forbidden", message: "You don't have permission to do that." } });
  const list = /^sites\/([a-z0-9_-]+)\/media$/.exec(path);
  if (list) {
    const items = [...mediaAssets.values()]
      .filter((m) => m.site === list[1])
      .map((m) => ({
        ...Object.fromEntries(Object.entries(m).filter(([k]) => !["data", "site"].includes(k))),
        used_on: mediaUsage(m),
      }));
    return send(200, { items, can_edit: editor });
  }
  const uploads = /^sites\/([a-z0-9_-]+)\/media\/uploads$/.exec(path);
  if (uploads) {
    if (!editor) return forbidden();
    const label = url.searchParams.get("label")?.trim();
    const alt = url.searchParams.get("alt")?.trim();
    const fields = [];
    if (!label)
      fields.push({ field: "label", code: "required", message: "Name this image (up to 120 characters)." });
    if (!alt)
      fields.push({
        field: "alt_text",
        code: "required",
        message: "Describe the image for people who can't see it (up to 250 characters).",
      });
    const type = String(req.headers["content-type"] ?? "");
    if (!["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(type) || !imageInfo(raw, type))
      fields.push({ field: "file", code: "invalid", message: "Upload a JPEG, PNG, WebP or SVG image." });
    if (fields.length)
      return send(422, { error: { code: "validation", message: "Some fields need attention.", fields } });
    const [status, asset] = storeMedia(uploads[1], raw, type, label, alt, user.name);
    return send(status, { id: asset.id, duplicate: status === 200 });
  }
  const one = /^media\/([0-9a-f-]{36})(?:\/(archive|restore))?$/.exec(path);
  const asset = one && mediaAssets.get(one[1]);
  if (!asset) return send(404, { error: { code: "not_found", message: "Not found." } });
  if (req.method === "GET" && !one[2]) {
    res.writeHead(200, { "content-type": asset.content_type, "cache-control": "private, max-age=86400" });
    return res.end(asset.data);
  }
  if (!editor) return forbidden();
  if (one[2] === "archive") {
    if (mediaUsage(asset).length)
      return send(409, {
        error: {
          code: "conflict",
          message: "This image is used on a page. Remove it from those pages (and publish) first.",
        },
      });
    asset.archived_at = new Date().toISOString();
    return send(200, { id: asset.id });
  }
  if (one[2] === "restore") {
    asset.archived_at = null;
    return send(200, { id: asset.id });
  }
  const label = String(body.label ?? "").trim();
  const alt = String(body.alt_text ?? "").trim();
  if (!label || !alt)
    return send(422, {
      error: {
        code: "validation",
        message: "Some fields need attention.",
        fields: [{ field: "alt_text", code: "required", message: "Alt text is required." }],
      },
    });
  Object.assign(asset, { label, alt_text: alt });
  return send(200, { id: asset.id, label, alt_text: alt });
}

function serveAsset(res, asset, url) {
  // Icons and the 1200 × 630 sharing image are PNG renderings in the API.
  if (url?.searchParams.has("icon") || url?.searchParams.get("social") === "1") {
    res.writeHead(200, {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    });
    return res.end(ICON_PNG);
  }
  res.writeHead(200, {
    "content-type": asset.content_type,
    "cache-control": "public, max-age=31536000, immutable",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
  res.end(asset.data);
}

// Pages built from typed blocks (services/api/src/pages): drafts, approval,
// versions. Validation mirrors the API's main rules; rendering is simplified.
const pages = new Map(); // id -> page
// A subset of services/api/src/pages/templates.rs: the general set and the lending set.
const PAGE_TEMPLATES = [
  ["blank", "Blank page", "An empty page to build section by section.", "", "", null],
  ["home", "Home page", "Promise, capabilities, how it works and a call to action.", "Home", "", null],
  ["overview", "Platform overview", "How the platform fits together.", "Platform", "platform", null],
  ["features", "Features", "A grid of features with common questions.", "Features", "features", null],
  [
    "integrations",
    "Integrations",
    "The systems the product connects to today.",
    "Integrations",
    "integrations",
    null,
  ],
  ["contact", "Contact and demo", "What happens after someone gets in touch.", "Contact", "contact", null],
  ["lending_home", "Lending home page", "For lenders: the loan lifecycle.", "Home", "", "lending_credit"],
  [
    "borrower_journey",
    "Borrower journey",
    "Apply, assess, approve, disburse and repay.",
    "How it works",
    "how-it-works",
    "lending_credit",
  ],
  ["hr_home", "HR home page", "For people teams: the employee lifecycle.", "Home", "", "hr_workforce"],
].map(([id, label, description, title, path, category]) => ({
  id,
  label,
  description,
  title,
  path,
  category,
}));
const templatesFor = (category) => [
  ...PAGE_TEMPLATES.filter((t) => t.category === category),
  ...PAGE_TEMPLATES.filter((t) => !t.category),
];
const CTA_LABELS = {
  coming_soon: "Join the waitlist",
  beta: "Request early access",
  active: "Request a demo",
};
const sid = () => randomUUID().replace(/-/g, "");
function pageTemplate(template, site) {
  if (template === "blank") return { sections: [] };
  const cta = CTA_LABELS[site.status] ?? "Get in touch";
  return {
    sections: [
      {
        id: sid(),
        type: "hero",
        eyebrow: site.name,
        heading: site.tagline || "Replace with a one-line promise.",
        lead: "Replace with two sentences on who the product is for.",
        primary: { label: cta, href: "/enquire" },
      },
      {
        id: sid(),
        type: "feature_grid",
        heading: "What you can do",
        items: [{ title: "Replace with a capability", body: "Say what it does." }],
      },
      {
        id: sid(),
        type: "call_to_action",
        heading: `See ${site.name} in action`,
        cta: { label: cta, href: "/enquire" },
      },
    ],
  };
}
const PAGE_PATH = /^$|^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*){0,2}$/;
const safeHref = (h) =>
  typeof h === "string" &&
  ((h.startsWith("/") && !h.startsWith("//")) || h.startsWith("https://")) &&
  !/\s/.test(h);
function validateDoc(doc) {
  const problems = [];
  for (const s of doc?.sections ?? []) {
    const ctas = [s.primary, s.secondary, s.cta].filter(Boolean);
    if (ctas.some((c) => !safeHref(c.href)))
      problems.push("Links must be a page on the site (starting with /) or an https:// address.");
    if ((s.type === "hero" || s.type === "call_to_action") && !String(s.heading ?? "").trim())
      problems.push("Headings need 1–120 characters.");
    if (s.type === "image" && (!mediaAssets.get(s.image_id) || mediaAssets.get(s.image_id).archived_at))
      problems.push("Choose images from this website's media library (archived images can't be used).");
    if (s.type === "stats" && !String(s.source ?? "").trim())
      problems.push(
        "Say where the figures come from (1–200 characters): only verified figures are published.",
      );
  }
  return problems;
}
const escapeHtml = (t) =>
  String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const md = (t) =>
  String(t ?? "")
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`)
    .join("");
// Websites never receive hidden sections; Studio previews keep them (`includeHidden`).
// Old addresses of moved pages (services/api/src/pages: page_redirects): "slug:path" -> page id.
const pageRedirects = new Map();
const renderDoc = (doc, includeHidden = true) => ({
  ...doc,
  ...(doc.seo_image_id ? { seo_image: mediaInfo(mediaAssets.get(doc.seo_image_id)) } : {}),
  sections: doc.sections
    .filter((s) => includeHidden || !s.hidden)
    .map((s) => (s.type === "image" ? { ...s, media: mediaInfo(mediaAssets.get(s.image_id)) } : s))
    .filter((s) => includeHidden || s.type !== "image" || s.media)
    .map((s) =>
      s.type === "text"
        ? { ...s, body_html: md(s.body) }
        : s.type === "faq"
          ? { ...s, items: s.items.map((i) => ({ question: i.question, answer_html: md(i.answer) })) }
          : s,
    ),
});
const pageSummary = (p) => ({
  id: p.id,
  path: p.path,
  title: p.title,
  position: p.position,
  sections: p.draft.sections.length,
  published: Boolean(p.published),
  published_at: p.published_at,
  draft_differs: JSON.stringify(p.draft) !== JSON.stringify(p.published),
  pending: p.revisions.some((r) => r.state === "pending"),
  scheduled_at: p.revisions.find((r) => r.state === "scheduled")?.publish_at ?? null,
  archived_at: p.archived_at,
  draft_updated_at: p.draft_updated_at,
  offline: Boolean(p.offline),
  show_in_nav: p.show_in_nav !== false,
  hidden_sections: p.draft.sections.filter((s) => s.hidden).length,
});
const pageDetail = (p) => ({
  page: {
    id: p.id,
    path: p.path,
    title: p.title,
    draft: p.draft,
    draft_version: p.draft_version,
    draft_updated_at: p.draft_updated_at,
    draft_updated_by: null,
    published: p.published,
    published_revision: p.published_revision,
    published_at: p.published_at,
    archived_at: p.archived_at,
    offline: Boolean(p.offline),
    show_in_nav: p.show_in_nav !== false,
  },
  site: { slug: p.site.slug, name: p.site.name, theme: p.site.settings.theme },
  draft_differs: JSON.stringify(p.draft) !== JSON.stringify(p.published),
  preview: renderDoc(p.draft),
  revisions: p.revisions.slice().sort((a, b) => b.number - a.number),
  redirects: [...pageRedirects.entries()]
    .filter(([, id]) => id === p.id)
    .map(([key]) => ({ from_path: `/${key.split(":")[1]}`, created_at: new Date().toISOString() })),
});

/** Stands in for the API's scheduler: publishes approved changes that are due. */
function publishDuePages() {
  for (const page of pages.values()) {
    const due = page.revisions.find(
      (r) => r.state === "scheduled" && r.publish_at <= new Date().toISOString(),
    );
    if (!due || page.archived_at) continue;
    due.state = "published";
    Object.assign(page, {
      published: structuredClone(due.document),
      published_revision: due.id,
      published_at: new Date().toISOString(),
    });
  }
}

function pagesRoutes(path, req, body, user, send) {
  const unredirect = /^pages\/([0-9a-f-]{36})\/redirects\/remove$/.exec(path);
  if (unredirect) {
    if (RANKS[user.role] < RANKS.editor)
      return send(403, { error: { code: "forbidden", message: "You don't have permission to do that." } });
    const page = pages.get(unredirect[1]);
    const key = page && `${page.site.slug}:${String(body.from_path ?? "").replace(/^\/+|\/+$/g, "")}`;
    if (!page || pageRedirects.get(key) !== page.id)
      return send(404, { error: { code: "not_found", message: "Not found." } });
    pageRedirects.delete(key);
    return send(200, { removed: `/${key.split(":")[1]}` });
  }
  publishDuePages();
  const notFound = () => send(404, { error: { code: "not_found", message: "Not found." } });
  const forbidden = (message = "You don't have permission to do that.") =>
    send(403, { error: { code: "forbidden", message } });
  const conflict = (message) => send(409, { error: { code: "conflict", message } });
  const invalid = (fields) =>
    send(422, { error: { code: "validation", message: "Please check the highlighted fields.", fields } });
  const rank = RANKS[user.role];
  const now = () => new Date().toISOString();
  const pathTaken = (site, p, except) =>
    [...pages.values()].some((x) => x.site === site && x.path === p && !x.archived_at && x.id !== except);

  const siteMatch = /^sites\/([a-z0-9_-]+)\/pages(\/order)?$/.exec(path);
  if (siteMatch) {
    const site = sites.find((s) => s.slug === siteMatch[1]);
    if (!site) return notFound();
    const mine = [...pages.values()].filter((p) => p.site === site);
    if (!siteMatch[2] && req.method === "GET") {
      return send(200, {
        site: { slug: site.slug, name: site.name, category: site.category },
        pages: mine
          .sort((a, b) => Boolean(a.archived_at) - Boolean(b.archived_at) || a.position - b.position)
          .map(pageSummary),
        templates: templatesFor(site.category),
      });
    }
    if (rank < RANKS.editor) return forbidden();
    if (siteMatch[2]) {
      const live = mine
        .filter((p) => !p.archived_at)
        .map((p) => p.id)
        .sort();
      const given = [...new Set(body.ids ?? [])].sort();
      if (JSON.stringify(live) !== JSON.stringify(given))
        return conflict("The page list changed. Reload and try again.");
      body.ids.forEach((id, i) => (pages.get(id).position = i));
      return send(204, null);
    }
    const p = String(body.path ?? "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    const errors = [];
    if (!String(body.title ?? "").trim())
      errors.push({ field: "title", code: "length", message: "Page titles need 1–120 characters." });
    if (!PAGE_PATH.test(p))
      errors.push({
        field: "path",
        code: "format",
        message:
          "Use lower-case words joined by hyphens, with up to three levels (e.g. solutions/banks). Leave empty for the home page.",
      });
    else if (pathTaken(site, p))
      errors.push({
        field: "path",
        code: "taken",
        message: "Another page on this website already uses this address.",
      });
    const template = body.template ?? "blank";
    if (!templatesFor(site.category).some((t) => t.id === template))
      errors.push({ field: "template", code: "unknown", message: "Choose a template." });
    if (errors.length) return invalid(errors);
    const page = {
      id: randomUUID(),
      site,
      path: p,
      title: body.title.trim(),
      position: mine.length,
      draft: pageTemplate(body.template ?? "blank", site),
      draft_version: 1,
      draft_updated_at: now(),
      published: null,
      published_revision: null,
      published_at: null,
      archived_at: null,
      revisions: [],
    };
    pages.set(page.id, page);
    return send(201, { id: page.id });
  }

  const m =
    /^pages\/([0-9a-f-]{36})(?:\/(draft|submit|archive|restore|duplicate|offline|online|show-in-nav|hide-from-nav)|\/revisions\/([0-9a-f-]{36})\/(approve|reject|cancel|restore))?$/.exec(
      path,
    );
  const page = m && pages.get(m[1]);
  if (!page) return notFound();
  const [, , action, revisionId, revisionAction] = m;
  if (!action && !revisionId) return send(200, pageDetail(page));

  if (action === "draft") {
    if (rank < RANKS.editor) return forbidden();
    if (body.version !== page.draft_version)
      return conflict("Someone else changed this page. Reload to see their changes.");
    const p = String(body.path ?? "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    if (!PAGE_PATH.test(p))
      return invalid([{ field: "path", code: "format", message: "Use lower-case words joined by hyphens." }]);
    if (pathTaken(page.site, p, page.id))
      return invalid([
        { field: "path", code: "taken", message: "Another page on this website already uses this address." },
      ]);
    const problems = validateDoc(body.document);
    if (problems.length) return invalid([{ field: "sections", code: "invalid", message: problems[0] }]);
    pageRedirects.delete(`${page.site.slug}:${p}`);
    if (page.published && page.path !== p) pageRedirects.set(`${page.site.slug}:${page.path}`, page.id);
    Object.assign(page, {
      title: body.title.trim(),
      path: p,
      draft: body.document,
      draft_version: page.draft_version + 1,
      draft_updated_at: now(),
    });
    return send(200, { draft_version: page.draft_version, preview: renderDoc(page.draft) });
  }
  if (action === "submit") {
    if (rank < RANKS.editor) return forbidden();
    if (!String(body.note ?? "").trim())
      return invalid([
        { field: "note", code: "length", message: "Say what changed in up to 300 characters." },
      ]);
    if (!page.draft.sections.length) return conflict("Add at least one section before submitting.");
    if (page.revisions.some((r) => r.state === "pending" || r.state === "scheduled"))
      return conflict("A change to this page is already waiting for approval or scheduled.");
    const at = body.publish_at ? new Date(body.publish_at) : null;
    if (at && (Number.isNaN(at.getTime()) || at.getTime() <= Date.now() + 60_000))
      return invalid([
        { field: "publish_at", code: "range", message: "Choose a time at least a minute from now." },
      ]);
    if (at && at.getTime() > Date.now() + 366 * 864e5)
      return invalid([
        { field: "publish_at", code: "range", message: "Choose a time within the next year." },
      ]);
    const revision = {
      id: randomUUID(),
      number: Math.max(0, ...page.revisions.map((r) => r.number)) + 1,
      document: structuredClone(page.draft),
      note: body.note.trim(),
      state: "pending",
      requested_by: user.name,
      requested_by_id: user.id,
      decided_by: null,
      decision_note: null,
      created_at: now(),
      decided_at: null,
      publish_at: at ? at.toISOString() : null,
    };
    page.revisions.push(revision);
    return send(201, { id: revision.id });
  }
  if (action === "archive" || action === "restore") {
    if (rank < RANKS.reviewer) return forbidden();
    if (action === "restore" && pathTaken(page.site, page.path, page.id))
      return conflict("Another page now uses this address.");
    page.archived_at = action === "archive" ? now() : null;
    if (action === "archive")
      page.revisions
        .filter((r) => r.state === "pending" || r.state === "scheduled")
        .forEach((r) => (r.state = "cancelled"));
    return send(200, { id: page.id });
  }
  if (["offline", "online", "show-in-nav", "hide-from-nav"].includes(action)) {
    if (rank < RANKS.reviewer) return forbidden();
    if (page.archived_at) return conflict("Restore this page first.");
    if (action === "offline" && page.path === "")
      return conflict("The home page can't be taken offline: it is the website's front door.");
    if (action === "offline" || action === "online") page.offline = action === "offline";
    else page.show_in_nav = action === "show-in-nav";
    return send(200, { id: page.id });
  }
  if (action === "duplicate") {
    if (rank < RANKS.editor) return forbidden();
    const base = page.path || "home";
    let n = 1;
    let p = `${base}-copy`;
    while (pathTaken(page.site, p)) p = `${base}-copy-${++n}`;
    const copy = {
      ...structuredClone({ ...page, site: null }),
      site: page.site,
      id: randomUUID(),
      path: p,
      title: `${page.title} (copy)`,
      published: null,
      published_revision: null,
      published_at: null,
      revisions: [],
      position: [...pages.values()].filter((x) => x.site === page.site).length,
    };
    pages.set(copy.id, copy);
    return send(200, { id: copy.id });
  }
  const revision = page.revisions.find((r) => r.id === revisionId);
  if (!revision) return notFound();
  if (revisionAction === "restore") {
    if (revision.state !== "published") return conflict("Only published versions can be restored.");
    page.draft = structuredClone(revision.document);
    page.draft_version += 1;
    return send(200, { restored: revision.number });
  }
  const unschedule = revision.state === "scheduled" && revisionAction === "cancel";
  if (revision.state !== "pending" && !unschedule) return conflict("This change has already been decided.");
  const own = revision.requested_by_id === user.id;
  if (revisionAction === "cancel" && !own && user.role !== "owner" && !(unschedule && rank >= RANKS.reviewer))
    return forbidden("Only the requester or an owner can cancel this change.");
  if (revisionAction !== "cancel" && rank < RANKS.reviewer) return forbidden();
  if (revisionAction === "approve" && own && user.role !== "owner")
    return forbidden("A different reviewer must approve your own change (maker-checker).");
  const later = revisionAction === "approve" && revision.publish_at && revision.publish_at > now();
  Object.assign(revision, {
    state: later
      ? "scheduled"
      : { approve: "published", reject: "rejected", cancel: "cancelled" }[revisionAction],
    decided_by: user.name,
    decision_note: body.note ?? null,
    decided_at: now(),
  });
  if (revisionAction === "approve" && !later) {
    Object.assign(page, {
      published: structuredClone(revision.document),
      published_revision: revision.id,
      published_at: revision.decided_at,
    });
  }
  return send(200, { state: revision.state });
}

// Published pages for the product-site renderer's tests (synthetic copy).
function seedPublishedPage(slug, path, title, document, visibility = {}) {
  const site = sites.find((s) => s.slug === slug);
  const revision = randomUUID();
  const at = new Date().toISOString();
  // The same id as the map key, so seeded pages open in the editor.
  const id = randomUUID();
  pages.set(id, {
    ...visibility,
    id,
    site,
    path,
    title,
    position: pages.size,
    draft: document,
    draft_version: 1,
    draft_updated_at: at,
    published: document,
    published_revision: revision,
    published_at: at,
    archived_at: null,
    revisions: [
      {
        id: revision,
        number: 1,
        document,
        note: "Seeded for tests",
        state: "published",
        requested_by: null,
        requested_by_id: null,
        decided_by: null,
        decision_note: null,
        created_at: at,
        decided_at: at,
      },
    ],
  });
}
seedPublishedPage("ziwa", "", "Home", {
  seo_title: "Ziwa LMS — Lending that flows with your business",
  seo_description: "From application to repayment, one configurable lending platform.",
  sections: [
    {
      id: "hero",
      type: "hero",
      eyebrow: "Ziwa LMS",
      heading: "Every loan. A smoother journey.",
      lead: "From application to repayment, Ziwa brings your lending operations together in one intelligent, configurable platform.",
      primary: { label: "Explore Ziwa", href: "/platform" },
      secondary: { label: "Request a demo", href: "/contact" },
    },
    {
      id: "features",
      type: "feature_grid",
      // On Ziwa's brown brand band (P7-E1).
      tone: "brand",
      heading: "Built for the whole journey",
      items: [
        { title: "Guided onboarding", body: "Applications that collect what credit teams need." },
        { title: "Configurable products", body: "Fees, interest and schedules you define." },
      ],
    },
    {
      id: "faq",
      type: "faq",
      heading: "Questions",
      items: [
        { question: "Is Ziwa available today?", answer: "Ziwa is **coming soon**. Join the waitlist." },
      ],
    },
  ],
});
const [, ziwaTeam] = storeMedia(
  "ziwa",
  readFileSync(new URL("figbud-app-icon-official.png", SEED_DIR)),
  "image/png",
  "Ziwa team",
  "The Ziwa LMS team planning a loan product",
  "Seed",
);
seedPublishedPage("ziwa", "platform", "Platform", {
  seo_image_id: ziwaTeam.id,
  sections: [
    { id: "p-hero", type: "hero", eyebrow: "Platform", heading: "One platform for lending operations" },
    {
      id: "p-text",
      type: "text",
      heading: "How it fits together",
      body: "Origination, servicing and collections share **one record**.",
    },
    {
      id: "p-image",
      type: "image",
      image_id: ziwaTeam.id,
      caption: "Planning a loan product",
      size: "content",
    },
  ],
});

// Its old address forwards to it (P7-G1).
pageRedirects.set(
  "ziwa:lending-platform",
  [...pages.values()].find((p) => p.site?.slug === "ziwa" && p.path === "platform").id,
);

// Ziwa pages left out of the navigation, and taken offline (renderer tests).
seedPublishedPage(
  "ziwa",
  "resources",
  "Resources",
  { sections: [{ id: "r-hero", type: "hero", heading: "Ziwa resources" }] },
  { show_in_nav: false },
);
seedPublishedPage(
  "ziwa",
  "legacy",
  "Legacy",
  { sections: [{ id: "l-hero", type: "hero", heading: "An old page" }] },
  { offline: true },
);
// ZiraHR's home page, as the API imports it from the ZiraHR website (pages/import.rs).
seedPublishedPage("zirahr", "", "Home", {
  seo_title: "ZiraHR · People. Payroll. Progress. Connected.",
  sections: [
    {
      id: "z-hero",
      type: "hero",
      eyebrow: "The Connected Workforce",
      heading: "People. Payroll. Progress. Connected.",
      lead: "People aren't spreadsheets. Your HR platform shouldn't treat them like one.",
      primary: { label: "Book a demo", href: "/enquire" },
    },
    {
      id: "z-modules",
      type: "feature_grid",
      heading: "One platform for the whole employee journey",
      items: [
        {
          title: "Employee 360",
          body: "Onboarding, confirmation, promotion and departure in one complete record.",
        },
        {
          title: "Payroll and compliance",
          body: "Rules-based, effective-dated payroll, with Kenya as the starting point.",
        },
      ],
    },
    {
      id: "z-cta",
      type: "call_to_action",
      heading: "See ZiraHR with your own workflows",
      cta: { label: "Book a demo", href: "/enquire" },
    },
  ],
});

const listedSite = (slug) => sites.find((s) => s.slug === slug && !s.archived_at && SITE_CTA[s.status]);

function publicPages(url, send) {
  publishDuePages();
  if (url.pathname === "/v1/redirects") {
    const live = (slug, path) =>
      [...pages.values()].some(
        (p) => p.site?.slug === slug && p.path === path && p.published && !p.archived_at && !p.offline,
      );
    send(
      200,
      [...pageRedirects.entries()].flatMap(([key, id]) => {
        const [slug, from] = key.split(":");
        const target = pages.get(id);
        return target && target.published && !target.archived_at && !target.offline && !live(slug, from)
          ? [{ site: slug, from: `/${from}`, to: `/${target.path}` }]
          : [];
      }),
    );
    return true;
  }
  const list = /^\/v1\/sites\/([a-z0-9_-]+)\/pages$/.exec(url.pathname);
  const one = /^\/v1\/sites\/([a-z0-9_-]+)\/page$/.exec(url.pathname);
  const slug = (list ?? one)?.[1];
  if (!slug) return false;
  const site = listedSite(slug);
  const live = site
    ? [...pages.values()].filter((p) => p.site === site && p.published && !p.archived_at && !p.offline)
    : [];
  if (list) {
    send(
      200,
      live
        .sort((a, b) => a.position - b.position)
        .map((p) => ({
          path: p.path,
          title: p.title,
          published_at: p.published_at,
          show_in_nav: p.show_in_nav !== false,
          noindex: Boolean(p.published?.seo_noindex),
        })),
    );
    return true;
  }
  const path = (url.searchParams.get("path") ?? "").replace(/^\/+|\/+$/g, "");
  const page = live.find((p) => p.path === path);
  if (!page) send(404, { error: { code: "not_found", message: "Not found." } });
  else send(200, { ...renderDoc(page.published, false), title: page.title, published_at: page.published_at });
  return true;
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

// ---------------------------------------------------------------- privacy & cookies
// Mirrors services/api/src/privacy.rs: one settings document for every
// website; owners edit it; a newly enabled provider asks visitors again.
const PRIVACY_PROVIDERS = {
  plausible: { category: "analytics", id: /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/ },
  google_analytics: { category: "analytics", id: /^G-[A-Z0-9]{4,12}$/ },
  meta_pixel: { category: "marketing", id: /^\d{10,20}$/ },
  linkedin_insight: { category: "marketing", id: /^\d{4,12}$/ },
};
const privacy = {
  version: 0,
  updated_at: null,
  updated_by: null,
  config: {
    banner: {
      title: "Your privacy matters",
      body: "We use essential cookies to keep our website working. With your permission, we may also use optional cookies to understand website usage and improve your experience.",
    },
    categories: {
      necessary: {
        label: "Strictly necessary",
        description:
          "Keep the website working and secure: they remember your cookie choices, your theme and your language, and protect forms from abuse. Always on.",
      },
      analytics: {
        label: "Analytics",
        description:
          "Help us understand how the website is used, such as which pages are visited, so we can improve it.",
      },
      preferences: {
        label: "Preferences",
        description: "Remember optional personal settings beyond the essentials, to tailor your experience.",
      },
      marketing: {
        label: "Marketing",
        description: "Measure the reach of our marketing and show relevant FigBud content on other websites.",
      },
    },
    retention_days: 180,
    record_months: 24,
    privacy_url: "/legal/privacy",
    cookie_url: "/legal/cookies",
    // A test fixture: one enabled analytics provider, so the e2e tests can
    // show it loads only after consent (production starts with none).
    integrations: [{ provider: "plausible", tracking_id: "figbud.test", enabled: true }],
    policy_version: 1,
  },
};
const consentRecords = [];
const publicPrivacy = () => ({
  ...clone(privacy.config),
  record_months: undefined,
  integrations: privacy.config.integrations
    .filter((i) => i.enabled)
    .map((i) => ({ ...i, enabled: undefined, category: PRIVACY_PROVIDERS[i.provider].category })),
});

// Mirrors services/api/src/site_settings.rs: reviewers change a website's
// navigation, footer and enquiries directly; every change is audited.
function siteSettingsRoutes(slug, req, body, user, send) {
  const site = sites.find((s) => s.slug === slug);
  if (!site) return send(404, { error: { code: "not_found", message: "Not found." } });
  const read = () =>
    send(200, {
      settings: site.settings,
      version: site.settings_version,
      corporate: site.kind === "corporate",
      can_edit: RANKS[user.role] >= RANKS.reviewer && !site.archived_at,
      pages: [...pages.values()]
        .filter((p) => p.site === site && p.published && !p.archived_at && !p.offline)
        .map((p) => ({ path: `/${p.path}`, title: p.title, show_in_nav: p.show_in_nav !== false })),
    });
  if (req.method === "GET") return read();
  if (RANKS[user.role] < RANKS.reviewer)
    return send(403, { error: { code: "forbidden", message: "You don't have permission to do that." } });
  if (site.archived_at)
    return send(409, { error: { code: "conflict", message: "Restore this website first." } });
  if (body.version !== site.settings_version)
    return send(409, {
      error: {
        code: "conflict",
        message: "Someone changed these settings after you opened them. Reload to see the latest.",
      },
    });
  const next = clone(body.settings ?? {});
  next.navigation ??= { mode: "pages", items: [] };
  next.footer ??= { note: null, links: [] };
  next.enquiries ??= { open: true, closed_message: null };
  next.theme ??= { brand_section: null, soft_section: null };
  const fields = [];
  // The API also checks contrast (site_settings.rs); the mock checks the format.
  for (const key of ["brand_section", "soft_section"]) {
    const value = (next.theme[key] ?? "").trim().toLowerCase();
    next.theme[key] = value || null;
    if (value && !/^#[0-9a-f]{6}$/.test(value))
      fields.push({
        field: `theme.${key}`,
        code: "format",
        message: "Use a six-digit hex colour such as #4e2d17.",
      });
  }
  const linkOk = (href) => /^(\/(?!\/)[A-Za-z0-9/_.#-]*|https:\/\/[^\s<>"']+)$/.test(href ?? "");
  for (const [field, list] of [
    ["navigation.items", next.navigation.items ?? []],
    ["footer.links", next.footer.links ?? []],
  ]) {
    if (list.length > 8) fields.push({ field, code: "too_many", message: "Up to 8 links." });
    for (const link of list) {
      link.label = String(link.label ?? "").trim();
      link.href = String(link.href ?? "").trim();
      if (!link.label || link.label.length > 40)
        fields.push({ field, code: "label", message: "Every link needs a label of up to 40 characters." });
      if (!linkOk(link.href))
        fields.push({
          field,
          code: "href",
          message: "Links go to a page path such as /platform, or an https:// address.",
        });
    }
  }
  if (next.navigation.mode === "custom" && !next.navigation.items?.length)
    fields.push({
      field: "navigation.items",
      code: "required",
      message: "Add at least one link, or use the website's pages.",
    });
  if (site.kind === "corporate" && next.enquiries.open === false)
    fields.push({
      field: "enquiries.open",
      code: "corporate",
      message: "The corporate website always takes enquiries.",
    });
  if (fields.length)
    return send(422, { error: { code: "validation", message: "Some fields need attention.", fields } });
  next.footer.note = next.footer.note?.trim() || null;
  next.enquiries.closed_message = next.enquiries.closed_message?.trim() || null;
  const action =
    site.settings.enquiries.open && !next.enquiries.open
      ? "site.enquiries_closed"
      : !site.settings.enquiries.open && next.enquiries.open
        ? "site.enquiries_opened"
        : "site.settings_updated";
  audit.unshift({
    id: randomBytes(8).toString("hex"),
    action,
    actor_email: user.email,
    detail: { before: site.settings, after: next },
    created_at: new Date().toISOString(),
  });
  site.settings = next;
  site.settings_version += 1;
  return read();
}

function privacyRoutes(req, body, user, send) {
  const read = () => {
    const recent = consentRecords.filter((r) => Date.now() - r.at < 30 * 86_400_000);
    const latest = new Map(recent.map((r) => [r.consent_id, r]));
    const count = (f) => [...latest.values()].filter(f).length;
    return send(200, {
      config: privacy.config,
      version: privacy.version,
      updated_at: privacy.updated_at,
      updated_by: privacy.updated_by,
      can_edit: user.role === "owner",
      report: {
        days: 30,
        choices: {
          total: recent.length,
          accept_all: recent.filter((r) => r.action === "accept_all").length,
          reject_optional: recent.filter((r) => r.action === "reject_optional").length,
          custom: recent.filter((r) => r.action === "custom").length,
        },
        visitors: latest.size,
        allowed: {
          analytics: count((r) => r.analytics),
          preferences: count((r) => r.preferences),
          marketing: count((r) => r.marketing),
        },
      },
    });
  };
  if (req.method === "GET") return read();
  if (user.role !== "owner")
    return send(403, { error: { code: "forbidden", message: "You don't have permission to do that." } });
  if (body.version !== privacy.version) {
    return send(409, {
      error: {
        code: "conflict",
        message: "Someone changed these settings after you opened them. Reload to see the latest.",
      },
    });
  }
  const next = clone(body.config ?? {});
  const fields = [];
  const text = (v, field, max) => {
    if (typeof v !== "string" || !v.trim() || v.trim().length > max)
      fields.push({ field, code: "length", message: "Required, and within the length limit." });
  };
  text(next.banner?.title, "banner.title", 80);
  text(next.banner?.body, "banner.body", 400);
  for (const c of ["necessary", "analytics", "preferences", "marketing"]) {
    text(next.categories?.[c]?.label, `categories.${c}.label`, 40);
    text(next.categories?.[c]?.description, `categories.${c}.description`, 300);
  }
  if (!(next.retention_days >= 30 && next.retention_days <= 395))
    fields.push({
      field: "retention_days",
      code: "range",
      message: "Remember choices for 30 to 395 days (about 13 months).",
    });
  if (!(next.record_months >= 6 && next.record_months <= 60))
    fields.push({
      field: "record_months",
      code: "range",
      message: "Keep consent records for 6 to 60 months.",
    });
  for (const f of ["privacy_url", "cookie_url"]) {
    if (!/^(\/(?!\/)[A-Za-z0-9/_.#-]*|https:\/\/[^\s<>"']+)$/.test(next[f] ?? ""))
      fields.push({
        field: f,
        code: "format",
        message: "Use a path on the website such as /legal/privacy, or an https:// address.",
      });
  }
  for (const i of next.integrations ?? []) {
    if (!PRIVACY_PROVIDERS[i.provider]?.id.test(i.tracking_id ?? ""))
      fields.push({
        field: "integrations.tracking_id",
        code: "format",
        message: "That ID doesn't match the provider's format.",
      });
  }
  if (fields.length)
    return send(422, { error: { code: "validation", message: "Some fields need attention.", fields } });
  const wasOn = (p) => privacy.config.integrations.some((i) => i.provider === p && i.enabled);
  const reconsent = body.ask_again || next.integrations.some((i) => i.enabled && !wasOn(i.provider));
  for (const k of ["title", "body"]) next.banner[k] = next.banner[k].trim();
  next.policy_version = privacy.config.policy_version + (reconsent ? 1 : 0);
  privacy.config = next;
  privacy.version += 1;
  privacy.updated_at = new Date().toISOString();
  privacy.updated_by = user.email;
  return read();
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
  if (path.startsWith("pages/") || /^sites\/[a-z0-9_-]+\/pages/.test(path))
    return pagesRoutes(path, req, body, user, send);
  if (/^sites\/[a-z0-9_-]+\/brand/.test(path) || path.startsWith("brand/assets/"))
    return brandRoutes(path, req, res, url, body, raw, user, send);
  if (path === "privacy") return privacyRoutes(req, body, user, send);
  if (/^sites\/[a-z0-9_-]+\/media(\/uploads)?$/.test(path) || path.startsWith("media/"))
    return mediaRoutes(path, req, res, url, raw, body, user, send);
  const settingsPath = /^sites\/([a-z0-9_-]+)\/settings$/.exec(path);
  if (settingsPath) return siteSettingsRoutes(settingsPath[1], req, body, user, send);
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
  if (url.pathname === "/v1/privacy") return send(200, publicPrivacy());
  const mediaFile = /^\/v1\/media\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (mediaFile) {
    const asset = mediaAssets.get(mediaFile[1]);
    if (!mediaPublic(asset)) return send(404, { error: { code: "not_found", message: "Not found." } });
    res.writeHead(200, {
      "content-type": asset.content_type,
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
    return res.end(asset.data);
  }
  if (url.pathname === "/v1/privacy/consent" && req.method === "POST") {
    consentRecords.push({ ...body, at: Date.now() });
    res.writeHead(204);
    return res.end();
  }
  if (publicPages(url, send)) return;
  const logo = /^\/v1\/brand\/assets\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (logo) {
    const asset = brandAssets.get(logo[1]);
    const live = asset && assetIds(brands.get(asset.site)?.published).includes(asset.id);
    return live
      ? serveAsset(res, asset, url)
      : send(404, { error: { code: "not_found", message: "Not found." } });
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
