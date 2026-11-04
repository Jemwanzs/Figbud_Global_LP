# ZiraHR website: scope, content map and sign-off register

Reconciles the ZiraHR Website Content & Developer Guide (Enhanced, 5 Nov 2026) and the roadmap brief with what's built. The guide is **proposed content**: its copy is in the Studio as unpublished drafts, and nothing reaches visitors until a person checks the claims and a reviewer approves it.

Last updated: 5 Nov 2026.

## 1. Status at a glance

| Area | Existed before | Enhanced now | Tested | Still pending |
| --- | --- | --- | --- | --- |
| Website delivery | Renderer (`apps/sites-web`) built but not deployed; published Home page in the Studio | Nothing changed in delivery | Renderer e2e | **Your approval** to deploy the renderer as a Railway service. Until then the ZiraHR website isn't public |
| Pages | Home only | Platform, About and Contact & Demo as **drafts**, plus a Home draft. The published Home is untouched | API validation of every draft; guard test for banned claims | Claims check and approval of each page |
| Navigation | Pages or chosen links | Four primary pages come from published pages marked for navigation | Renderer e2e | Appears when the pages are published |
| Module catalogue | Six feature cards on Home | **Module catalogue** block: all eight modules, one open at a time, planned ones labelled | e2e, axe in both themes | Confirm module availability (Q26) |
| Demonstrations | Three hero designs | **Product demonstration** block: connected modules, pay run, payslip, payroll rules, self-service. Original art direction, synthetic and labelled | e2e with keyboard, axe in both themes | |
| Heroes | Three designs, one published (P12) | Unchanged | Hero e2e | Choose and publish one |
| Payroll Calculator | None | Complete: [PAYROLL_CALCULATOR.md](PAYROLL_CALCULATOR.md) | Engine unit tests, API integration, Studio and public e2e | Check rules against official sources, legal view on SHIF (Q24), approval, switch on |
| Pricing | Pricing Studio and quotations (P11) | Reviewed against the brief (§5); one quotation defect found and fixed | Existing engine and API tests, plus a regression test | Approved KES rates (Q23) |
| Hover previews | Built (UI-NAV2) | The guide's wording as a draft | e2e | Publish, once pages are live |
| Referral Programme | None | **Not built:** the source terms conflict, so there's nothing safe to publish | | Commercial decision (Q25) |
| Insights / blog | Corporate blog only | **Not built** for ZiraHR | | Decide per-product or shared; the guide's article ideas need verified references |
| Contact & demo | Corporate enquiry form, pre-filled for the product, with server validation | Contact & Demo draft page leads to that form | Existing form tests | On-page form if you want one |
| Testimonials, partners, banners | Trusted By, testimonials and metrics; campaigns | Unchanged; nothing renders until approved records are published | Existing tests | Approved records (Q22) |
| SEO | Per-page metadata, canonical URLs, sitemap, structured data, indexing controls | Titles and descriptions on every draft; calculator page in the sitemap only while on | Renderer e2e | Kenya targeting needs the live domain (Q1) and Search Console (Q21) |

## 2. Where the guide and the brief differ

Decisions taken, for you to overrule if you prefer:

| Topic | Guide | Brief | Done |
| --- | --- | --- | --- |
| Primary navigation | Six items, including ESS, Referral and Insights | At most four pages | **Four:** Home, Platform, About, Contact & Demo. ESS sits within Platform |
| Hero line | "Your people. Your payroll. One smarter way to work." | "HR Simplified. Business Amplified." | The guide's line as the headline, the slogan as the eyebrow. Your published "People. Payroll. Progress. Connected." stays until you approve the draft |
| Payroll stages | Draft to locked | n/a | Five stages, matching the published hero design. The Meridian reference's wording wasn't reused |
| Spelling | US ("organization") | n/a | British/Kenyan English in drafts, matching the rest of the site |

## 3. Content map

| Guide section | Where it lives | State |
| --- | --- | --- |
| §2 Home: hero, platform overview, why ZiraHR, closing | Home draft: Hero, connected-modules demo, payslip demo, feature grid, pay-run demo, call to action | Draft |
| §2 Trust strip | **Left out:** its sector list and "teams that mean business" need customer evidence. The Trusted By section appears when approved records exist | Pending Q22 |
| §3 Eight modules | Platform draft: Module catalogue | Draft |
| §4 Employee Self-Service | Platform draft: self-service demo | Draft |
| §5 Payroll Calculator | Built-in page at `/payroll-calculator`, linked as a utility page | Off |
| §6 Referral Programme | Not built | Q25 |
| §7 About | About draft | Draft |
| §8 Insights | Not built | Pending |
| §9 Contact | Contact & Demo draft | Draft |
| §10 Hover wording | Hover Previews draft (Platform, About, Contact) | Draft |
| §10 Footer groups | Website settings when pages are live. The guide's "no invented contact numbers" holds: none added | Pending |

Editing: Websites → ZiraHR → Pages (sections, approval, versions), Hero Design Studio, Navigation & forms → Hover Previews, Payroll Calculator, Pricing, and Marketing for proof and campaigns.

Demonstration figures are fixed in code, not typed in the Studio, so nothing can present made-up numbers as real. The payslip is tested against the calculator engine. If the rules change, update `product-demos.tsx` together with the test `matches_the_illustrative_payslip_on_the_website`.

## 4. Sign-off register

Nothing here is published. Each needs a decision or a check by you:

| Item | Why | Handling until then |
| --- | --- | --- |
| Module availability | The guide says to confirm Teams & Collaboration, Recruitment, and Learning & Development. The pricing catalogue already lists Recruitment as planned | Marked **Planned** on the page |
| Salary advances | Planned in the pricing catalogue, "where enabled" in the guide | Left out of the drafts |
| Attendance, biometric devices, overtime sync, P9 forms, document alerts | The guide asks for production readiness to be validated | In drafts with "where supported" wording; check before approving |
| Referral terms | Source page 20: up to KSh 100,000 or 20% of ACV. Page 21: up to KSh 250,000 or 10% of ACV | No page, no amounts |
| Testimonials and client logos | Anonymous quotes without authorisation | Not used |
| "100% statutory compliance", "reduce payroll work by days" | Unsubstantiated | Not used; a test refuses "100%" and "guarantee" in the drafts |
| Outsourcing, consultancy, native apps | ZiraHR is cloud SaaS with web self-service only | Not used; a test refuses those words in the drafts |
| Incomplete source pages 23 to 26 | "Let us add content", and a missing PDF | Not treated as reviewed |
| Logo and company facts | The ZiraHR file is missing "HR" (Q18) | Existing published assets unchanged |

## 5. Pricing Studio review

Checked against the brief's list. Existing tests cover each item, so nothing was rewritten, apart from one fix found while testing:

| Requirement | Result |
| --- | --- |
| Rates save and come back | Regression test for the 31 Oct size-limit defect |
| Monthly, quarterly, six-monthly, annual and one-off charges | Supported per item (P11-PR8) |
| Billing-cycle discounts | Calculated by one engine, with tests |
| Calculator refreshes on every change | Each calculation carries the version; a save recalculates |
| Unset prices are never zero | Shown as "Rate not configured", and they block official quotations |
| Quotations use the published version | Frozen snapshot per quotation |
| Hidden from the public by default | Separate switch, off by default |
| Separate from the payroll calculator | Different engine, routes and Studio page |

**Fixed:** quotation numbers were counted per website, but references must be unique across websites and use the first six characters of the website's address. Two websites sharing those characters would collide, and the quotation would fail with a 503. Numbers now follow the prefix, and two quotations at the same moment retry instead of failing.

## 6. Design direction

The supplied samples informed ideas only: a line-by-line payslip, payroll rates as visible settings, a stepped pay run, and modules around one record. No layouts, artwork, wording or colours were copied. ZiraHR uses its own cyan brand colour, Outfit, and a "signal line" motif instead of the sample's orange dot-matrix art.
