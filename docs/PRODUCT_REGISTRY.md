# FigBud product registry

The websites FigBud runs, in their public order. The live source of truth is the `sites` table, managed in **Admin → Websites**; this page records what was decided and why. Delivery status: [ROADMAP.md](ROADMAP.md). Branding: [BRAND_ASSETS.md](BRAND_ASSETS.md).

| # | Website | Slug | Kind | Category | Template | Marketing status | Website destination |
| - | ------- | ---- | ---- | -------- | -------- | ---------------- | ------------------- |
| 1 | FigBud Global | `figbud` | corporate | Corporate | corporate | Active (always) | Corporate site (Railway URL until the domain is set, Q1) |
| 2 | ZiraHR | `zirahr` | product | HR & Workforce | hr | Active | `NEXT_PUBLIC_ZIRAHR_URL` (site built, not deployed yet) |
| 3 | Jasiri LMS | `jasiri` | product | Lending & Credit | lending | Active | `NEXT_PUBLIC_JASIRI_URL` (site not built yet) |
| 4 | Expense Now | `expense_now` | product | Finance & Payments | finance | Coming soon | `NEXT_PUBLIC_EXPENSE_NOW_URL` |
| 5 | Ziwa LMS | `ziwa` | product | Lending & Credit | lending | Coming soon | `NEXT_PUBLIC_ZIWA_URL` |

Rules that apply to every website:

- **Slugs are permanent.** Enquiries, brand files and links refer to them.
- **Marketing status is not operational readiness (D19).** "Active" changes what the marketing website offers; it never switches on the product, payments or sign-ups.
- **The order is the `position` in the registry.** Product menus, the homepage tabs and hero, the Products page and the Studio all follow it.
- **Status changes go through Admin → Websites** with maker-checker approval. Draft, retired and archived websites disappear from every public listing.
- **Each website has its own brand profile, enquiry routing (`EMAIL_RECIPIENTS_<PRODUCT>`) and content.** Nothing is shared between products' customer data. The marketing API holds website data only.

## Ziwa LMS (added 24 October 2026)

**Status:** listed as **coming soon** (waitlist), pending confirmation of its commercial launch readiness (Q19). Its logo is a proposed concept, not approved (BRAND_ASSETS.md §3b).

**Positioning:** Lending that flows with your business.

- **Hero:** Every loan. A smoother journey.
- **Supporting copy:** From application to repayment, Ziwa brings your lending operations together in one intelligent, configurable platform.
- **Calls to action:** Explore Ziwa · Request a demo. Until launch, the corporate site offers the waitlist.

**Where it appears today:**
- The corporate header and footer product menus.
- The homepage hero (a fourth product node, with the layout rebalanced so two products sit each side of the core) and the homepage product tabs (its own "loan flow" preview, distinct from Jasiri's portfolio view).
- The Products page card and comparison.
- The contact form's product list.
- Organisation structured data and meta descriptions.
- The Studio's Websites and Branding pages.

**Same lending foundation, different identity.** Ziwa and Jasiri cover the same lending capabilities:
- individual, business and group lending, including check-off and employer-backed lending;
- origination, scoring, approvals, disbursement, servicing, collections and analytics.

Asset financing stays marked as planned until confirmed (Q11). The plan is one shared lending website template (P4-L1): the same components, content schemas and demonstrations, with independent records per product for brand, navigation, copy, SEO, forms, announcements and publication. A change to a shared component improves both sites.

**Avoiding near-duplicate pages.** Jasiri's voice is decisions and portfolio control ("Every loan. Every decision. Connected."). Ziwa's is the borrower and operator journey ("Every loan. A smoother journey."). Their headlines, examples and demonstrations differ, each page has its own canonical URL, and neither copies the other's text.

**Ziwa website pages (P4-W):** Home, Platform, Lending Solutions, Features, Integrations, Resources, Contact. These are defined in `productSites.ziwa` and will be built on the shared lending template once Ziwa's capabilities and launch are confirmed (Q19).
