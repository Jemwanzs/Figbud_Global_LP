# SEO & search visibility

SEO is a release requirement, not a one-off task. Every website, page, product, campaign and article must meet the rules below before it counts as done. Checks run in the Studio (live health check) and in CI (quality gate).

Last updated: 30 Oct 2026.

## 1. Technical audit (30 Oct 2026)

What was checked, what was already right, and what changed.

| Area | Finding | Status |
| --- | --- | --- |
| Rendering | Corporate site and product sites render pages on the server (Next.js prerendering and streaming). Content isn't client-only. Campaigns render after load in reserved slots, so they never change indexed content. | ✅ Already right |
| Titles and descriptions | Every corporate page has its own title and description from the dictionaries. Studio pages have their own search title and description (P7-G1). | ✅ Now checked in CI for presence, length and uniqueness |
| Canonical URLs | Absolute canonicals on every page, from `NEXT_PUBLIC_SITE_URL` (corporate) and the website's own domain or renderer address (product sites). | ✅ Checked in CI |
| Sitemaps | Corporate: published pages in reviewed locales, plus blog articles, plus legal pages once published. Product sites: published pages that aren't hidden from search. Empty outside production. | ✅ Product websites with indexing switched off are now left out |
| Robots | `noindex` meta (not robots.txt) keeps drafts, unreviewed languages, pending legal pages, holding pages and the Studio out of search. robots.txt disallows everything outside production. | ✅ Checked in CI |
| Status codes | Unknown pages answer a real 404; moved Studio pages answer 308 to their new address (P7-G1). | ✅ Checked in CI |
| Internal links | Every internal link on the public corporate pages resolves. Studio pages are checked for links to unpublished pages. | ✅ New check |
| Structured data | Corporate: Organization (now with verified profiles), BreadcrumbList, Article. **Added:** WebSite (home), an ItemList of SoftwareApplication (Products). Product sites had none. **Added:** SoftwareApplication and WebSite (home), BreadcrumbList (inner pages), FAQPage (pages with questions). | ✅ No ratings, reviews, offers or prices anywhere |
| Images | Media-library images always carry alt text (required on upload); logos carry the brand name. | ✅ Already right |
| Hreflang | Corporate pages list their language alternates. Draft languages are `noindex` and left out of alternates and sitemaps. | ✅ Already right |
| Mobile | Phones are checked for horizontal overflow on the main pages; Lighthouse runs on a mobile profile in CI. | ✅ Already right |
| Slogan | Organization `slogan` used an old tagline. | ✅ Now "One Vision. Endless Solutions." |

## 2. Each website's own SEO

Studio → Websites → a website → **SEO** (or Studio → SEO → a website). Settings apply to that website only. Reviewers and owners change them; each change is version-checked and audited (`site.seo_updated`, with before and after).

- **Indexing switch:** off while a website is prepared. Every page is `noindex` and the website leaves the sitemap.
- **Search title template:** e.g. `%s · ZiraHR`, with a preview.
- **Default description:** for pages without their own.
- **Languages and target markets** (ISO countries).
- **Focus search phrases:** internal guidance for editors, never output as meta keywords.
- **Official profiles:** verified https addresses, used as `sameAs` in structured data.
- **Verification tokens:** Google Search Console and Bing Webmaster Tools tokens, output as verification meta tags.

Page-level settings stay on each page (Pages → a page → Search) and go through the normal approval: search title and description with a result preview, sharing image, "Hide from search engines", and old addresses that forward automatically.

## 3. Health check and overview

The Studio shows, per website, its live pages, how many are in search, and issues to **fix** (errors), **improve** (warnings) or **note**:
- the search title is too long or duplicated (after the template);
- the search description is missing, short or duplicated;
- there's no main heading (the page doesn't start with a hero);
- the page has very little text;
- a link goes to an unpublished page, or to an old address;
- the page is hidden from search;
- website-level: indexing off, no default description, no verification tag.

Studio → **SEO** lists every website (filtered by your website access) with these counts and its verification status.

**Search data:**
- Search Console (indexing, queries, impressions, clicks) and Bing data are marked **not connected**. Connecting them needs Google/Bing API access with least-privilege credentials (Q21).
- Analytics shows what's enabled in Privacy & Cookies; it loads only with consent.
- Core Web Vitals are measured by Lighthouse in CI.
- Nothing is estimated or invented.

## 4. Quality gate in CI

`apps/figbud-web/e2e/seo-quality.spec.ts`, plus the product-site checks in `apps/sites-web/e2e/sites.spec.ts`, run on every push. The CI Lighthouse job keeps its SEO and performance thresholds.

- **Public corporate pages:**
  - the h1 is in the server HTML, and there's exactly one;
  - the title is 10–70 characters and unique; the description is 50–170 characters and unique;
  - Open Graph title, an absolute canonical equal to the page address, parseable schema.org JSON-LD;
  - every internal link answers below 400.
- **Never indexable:** draft languages, pending legal pages and the Studio are `noindex`. Unknown pages are 404. robots.txt disallows everything outside production.
- **Structured data:**
  - the home page has Organization and WebSite; Products has ItemList and SoftwareApplication, never ratings, reviews or offers;
  - product sites: SoftwareApplication and WebSite on the home page, BreadcrumbList on inner pages;
  - the verification tag from the Studio is present.
- **Studio:** settings are validated, version-checked and audited, and the audit flags duplicate titles, missing descriptions, missing h1 and broken links (`services/api/tests/seo_audit.rs`).

## 5. Rules for content

- Write for people first: original, specific, accurate.
- No keyword stuffing, no near-duplicate pages for different keywords, and no location pages without real local relevance.
- Structured data only describes what the page visibly shows. Never add ratings, reviews, prices or offers that aren't published and true.
- Unreviewed translations stay `noindex` until reviewed (Q6).
- **Campaigns:** promotions render after load, and dialogs never cover the page on arrival (delay, scroll or exit triggers) or the cookie banner. Expired campaigns disappear on time. A campaign that needs an evergreen landing page gets a normal Studio page (with its own SEO), not a dialog.
- **AI-assisted discovery:** clear product explanations, direct answers (FAQ sections), accurate entities (Organization, SoftwareApplication) and transparent dates. No speculative tricks, and no claims of guaranteed inclusion.

## 6. Still to do

- **Search Console and Bing data connections:** OAuth, least-privilege service access and quota-aware reporting (Q21).
- **Production domains:** before indexing is enabled (`NEXT_PUBLIC_ALLOW_INDEXING`) and verification tags are added (Q1).
- **Topic clusters and regional landing pages:** once verified local content exists (content work, not code).
- **Translated metadata:** published with each reviewed language (Q6).
