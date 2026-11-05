# ZiraHR website: scope, content map and sign-off register

Reconciles the ZiraHR Website Content & Developer Guide (Enhanced, 5 Nov 2026) and the roadmap brief with what's built. The owner confirmed the guide's modules and instructed publishing on 5 Nov 2026 (ROADMAP Q24 to Q26). From here on the Studio owns the content.

Last updated: 5 Nov 2026.

## 1. Status at a glance

| Area | Existed before | Enhanced now | Tested | Still pending |
| --- | --- | --- | --- | --- |
| Website delivery | Renderer (`apps/sites-web`) built but not deployed | Deployed as its own Railway service on the owner's approval (DEPLOYMENT.md) | Renderer e2e | Real domain, then indexing on |
| Pages | Home only | Platform, About, Contact & Demo and Refer & earn published at start-up on 5 Nov 2026. **Home kept its 29 Oct version**, because someone had edited it in the Studio | API validation of every page; guard test for banned claims; go-live integration test; live checks | **Your decision:** keep Home, or use the guide's Home (with the connected-modules, payslip and pay-run demos and the calculator link) |
| Navigation | Pages or chosen links | Four primary pages. Calculator and Refer & earn are utility pages, linked from the footer | Renderer e2e | |
| Module catalogue | Six feature cards on Home | **Module catalogue** block: all eight modules, one open at a time | e2e, axe in both themes | |
| Demonstrations | Three hero designs | **Product demonstration** block, eight kinds: connected modules, pay run, payslip, payroll rules, self-service, what a run gives you, leave approval, team calendar. Original art direction, synthetic and labelled | e2e with keyboard, axe in both themes | |
| Heroes | Three designs, one published (P12) | Unchanged | Hero e2e | Choose and publish one |
| Payroll Calculator | None | Complete and published: [PAYROLL_CALCULATOR.md](PAYROLL_CALCULATOR.md) | Engine unit tests, API integration, Studio and public e2e | Re-check when the law changes |
| Pricing | Pricing Studio and quotations (P11) | Reviewed against the brief (§5); one quotation defect found and fixed | Existing engine and API tests, plus a regression test | Approved KES rates (Q23) |
| Hover previews | Built (UI-NAV2) | The guide's wording, published | e2e | |
| Refer & earn | None | Page and form reaching the enquiry inbox; earn after the deal closes; no amounts | API validation test, e2e, axe | **The contact number** (Q25) |
| Insights / blog | Corporate blog only | **Not built** for ZiraHR | | Decide per-product or shared; the guide's article ideas need verified references |
| Contact & demo | Corporate enquiry form, pre-filled for the product, with server validation | Contact & Demo page leads to that form | Existing form tests | On-page form if you want one |
| Testimonials, partners, banners | Trusted By, testimonials and metrics; campaigns | Unchanged; nothing renders until approved records are published | Existing tests | Approved records (Q22) |
| SEO | Per-page metadata, canonical URLs, sitemap, structured data, indexing controls | Titles and descriptions on every draft; calculator page in the sitemap only while on | Renderer e2e | Kenya targeting needs the live domain (Q1) and Search Console (Q21) |

## 2. Where the guide and the brief differ

Decisions taken, for you to overrule if you prefer:

| Topic | Guide | Brief | Done |
| --- | --- | --- | --- |
| Primary navigation | Six items, including ESS, Referral and Insights | At most four pages | **Four:** Home, Platform, About, Contact & Demo. ESS sits within Platform |
| Hero line | "Your people. Your payroll. One smarter way to work." | "HR Simplified. Business Amplified." | The live Home still leads with "People. Payroll. Progress. Connected.". The guide's Home would use the guide's line as the headline and the slogan as the eyebrow |
| Payroll stages | Draft to locked | n/a | Five stages, matching the published hero design. The Meridian reference's wording wasn't reused |
| Spelling | US ("organization") | n/a | British/Kenyan English in drafts, matching the rest of the site |

## 3. Content map

| Guide section | Where it lives | State |
| --- | --- | --- |
| §2 Home: hero, platform overview, why ZiraHR, closing | Guide's Home written, but **not published**: the live Home was edited in the Studio and was left alone | Your decision |
| §2 Trust strip | **Left out:** its sector list and "teams that mean business" need customer evidence. The Trusted By section appears when approved records exist | Pending Q22 |
| §3 Eight modules | Platform: Module catalogue | Published |
| §4 Employee Self-Service | Platform: self-service, leave and calendar demos | Published |
| §5 Payroll Calculator | Built-in page at `/payroll-calculator`, linked from Home and the footer | Published |
| §6 Referral Programme | Refer & earn page at `/refer`, linked from the footer | Published, without amounts |
| §7 About | About | Published |
| §8 Insights | Not built | Pending |
| §9 Contact | Contact & Demo | Published |
| §10 Hover wording | Hover Previews (Platform, About, Contact) | Published |
| §10 Footer groups | Footer links to the calculator and Refer & earn. The guide's "no invented contact numbers" holds: none added | Published |

Editing: Websites → ZiraHR → Pages (sections, approval, versions), Hero Design Studio, Navigation & forms → Hover Previews, Payroll Calculator, Pricing, and Marketing for proof and campaigns.

Demonstration figures are fixed in code, not typed in the Studio, so nothing can present made-up numbers as real. The payslip is tested against the calculator engine. If the rules change, update `product-demos.tsx` together with the test `matches_the_illustrative_payslip_on_the_website`.

## 4. Sign-off register

Decided items say so. The rest still need a decision or a check by you:

| Item | Why | Handling until then |
| --- | --- | --- |
| Module availability | The guide said to confirm Teams & Collaboration, Recruitment, and Learning & Development | **Owner confirmed, 5 Nov 2026:** all available |
| Salary advances | "Where enabled" in the guide | **Owner confirmed, 5 Nov 2026:** in the self-service wording, "where enabled" |
| Attendance, biometric devices, overtime sync, P9 forms, document alerts | The guide asked for production readiness to be validated | **Owner confirmed, 5 Nov 2026**, with the guide's "where supported" wording |
| Referral amounts | Source page 20: up to KSh 100,000 or 20% of ACV. Page 21: up to KSh 250,000 or 10% of ACV | **Terms decided, amounts not:** earn after the deal closes, no amounts anywhere |
| Contact number | The owner wants people to follow a deal by phone, and we don't invent numbers | **Needed.** Set it on the Refer & earn page's form block in the Studio |
| Sample features outside the guide | Bank files, tax-authority formats, payslip designer, proration, tenure and carry-forward leave rules | Not shown. Tell us if ZiraHR does them and they can be added |
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

The supplied samples informed ideas only: a line-by-line payslip, payroll rates as visible settings, a stepped pay run, modules around one record, outputs from a run, a request moving through approvers, and a team calendar. No layouts, artwork, wording or colours were copied. ZiraHR uses its own cyan brand colour, Outfit, and a "signal line" motif instead of the sample's orange dot-matrix art.
