# Pricing guide (internal)

How FigBud prices its products in the Pricing Studio (Admin Studio → Websites → a product → **Pricing**). Every rule below is what the calculation engine does: `services/api/src/pricing/engine.rs`, with its tests. If you change one, change the other in the same commit.

Last updated: 31 Oct 2026.

## 1. Principles

- **One engine.** The Studio calculator, the full-screen workspace, quotations and the public calculator all call the API, which uses one engine with exact decimal arithmetic (`rust_decimal`, never floating point). Browsers only format the results.
- **Nothing is assumed:**
  - Rates start **unset**, and an unset rate is never priced.
  - There's no discount unless one is configured, and no tax until a rate is entered.
  - The MeridianHR reference document's USD figures are guidance only: they are never converted into KES selling prices.
- **Approval before use.** Prices reach calculators and quotations only after a reviewer approves a version (maker-checker). They reach the public website only when someone also switches that on.
- **Quotations never change.** Each one keeps a frozen snapshot of what was offered, from the version it was priced with.

## 2. The price book

One per product website, in its **base currency** (KES for ZiraHR). It has a working **draft** and published **versions**.

| Part | What it holds |
| --- | --- |
| Items | Modules, add-ons, support and one-off services (below) |
| Plans | Packages of modules, for example Core HR + Payroll |
| Billing cycles | Monthly (1 month), quarterly (3), semi-annual (6), annual (12): each enabled or not, with an optional discount |
| Commercial models | Calculator presets: starting items and default cycle |
| Currency | Base currency, other supported currencies with **manual** exchange rates and their source |
| Tax | Name, rate (unset by default), shown exclusive (added) or inclusive |
| Rounding | Decimals (2 by default) |
| Minimum subscription | Optional, per month |
| Quotations | Validity in days (30 by default) and default commercial terms |

## 3. Items

| Field | Meaning |
| --- | --- |
| Category | Core module, add-on, implementation, support, integration or custom |
| Pricing method | Flat rate, per employee, per user licence, per payroll employee, per entity, per country, per usage unit, per participant, per session, per day, or custom quote |
| Rate is per | One-off, month, quarter, six months or year. Any item can be charged once, modules included |
| Rate | Per unit (or the flat amount); **unset means not priced** |
| Minimum charge | The item never costs less than this, for its own frequency |
| Quantity tiers | Optional; replace the rate (§5) |
| Minimum / maximum quantity | Below the minimum or above the maximum, the calculation warns ("contact sales") |
| Per-cycle terms | Optional: a rate for one cycle, or this item's own discount for it (§6) |
| Taxable, discountable | Whether tax and cycle discounts apply |
| On quotations (one-offs) | Charged separately, included, optional (off by default) or quoted on scope |
| Effective from | The price applies from this date; earlier calculations warn |
| Availability | **Available**, or **planned**: shown internally but never quotable or public |
| Active, public | Whether it can be used at all, and whether it may be shown publicly |

**ZiraHR's catalogue.** It's reconciled with the confirmed product scope (BRAND_ASSETS / ZiraHR site).
- **Available:** Core HR (Employee 360), Payroll & compliance, Leave, Time & attendance, Performance, Employee self-service, and Reporting & analytics.
- **Planned (not confirmed for ZiraHR yet):** Recruitment / ATS, Mobile app, Salary advances, Digital salary payments, and the AI assistant.
- **One-off groups:**
  - A. Platform setup;
  - B. Data migration;
  - C. Training (per participant, session, day or fixed);
  - D. Integrations (custom ones quoted on scope);
  - E. Deployment & support.
- **Enterprise items:** annual support & maintenance, country localisation, country payroll rules, regional hosting.

## 4. Quantities

- Per-employee, per-user and per-payroll-employee items use the shared **employees / licences** number, unless a line has its own quantity (different counts per module).
- Other per-unit items need a quantity (1 if none is given). Flat items ignore quantity.

## 5. Tiers

- **Volume:** the tier that contains the quantity prices every unit. For example, with tiers 1–100 at 120, 101–500 at 100 and 501+ at 80, 250 employees cost 250 × 100.
- **Graduated:** each band at its own rate. The same 250 employees cost 100 × 120 + 150 × 100.
- Tiers go up in order and end with an open tier. A flat item's tier is a flat amount.

## 6. Billing cycles and discounts

A recurring item's charge for a billing period of `m` months is **rate × quantity × `m` / `k`**, where one rate covers `k` months:

| Rate is per | `k` | Over a quarter (`m` = 3) |
| --- | --- | --- |
| Month | 1 | 3 × the rate |
| Quarter | 3 | 1 × the rate |
| Six months | 6 | ½ × the rate |
| Year | 12 | ¼ × the rate |

So the yearly equivalent is the same whatever the cycle, before discounts. A yearly rate is never treated as monthly. One-off items are charged once, never multiplied by the period.

Discounts, in order:
1. **An item's own cycle rate** replaces the base rate *and* any discount for that cycle (it is already the agreed price), so nothing is discounted twice.
2. **An item's own discount** for the cycle replaces the cycle's discount for that item.
3. **The cycle's percentage discount** applies to every other discountable item.
4. **The cycle's fixed discount** comes off the subscription **once per period**. It's spread across the remaining discountable lines in proportion, so the lines still add up, and it never exceeds them.

Discounts never apply to items marked not discountable, nor to one-off charges.

## 7. Minimums

- An **item minimum charge** lifts that item's amount for its frequency.
- A **minimum subscription** (per month) applies after discounts. If the period's subscription is below `minimum × m`, a "minimum subscription top-up" line makes up the difference, and it's taxed like the subscription.

## 8. One-off charges

- One-off charges are listed and totalled **separately** from the subscription, and are never part of renewals.
- Included items show at zero, and optional items are left out.
- Items quoted on scope, and custom quotes, appear under **"Not included in the totals"**.

## 9. Tax, rounding and currency

- **Exclusive tax:** tax = net × rate.
- **Inclusive tax:** the amount already includes tax, so tax = net × rate / (100 + rate).
- **Rounding:** every line is rounded to the book's decimals, half away from zero, and always shows them ("62500.00"). Totals are sums of rounded lines, so a quotation always adds up.
- **Other currencies:** prices stay in the base currency. A quotation in another supported currency is converted at that currency's **manual** rate (base units per 1 unit) and rounded the same way. There are no automatic exchange rates.

## 10. The totals

Each total states its period, so monthly, per-period, yearly and one-off amounts are never added together without saying so.

| Total | Meaning |
| --- | --- |
| Subscription subtotal | Recurring items for one billing period, before discounts |
| Discount | All discounts for that period |
| Subscription after discount | Plus any minimum top-up |
| One-off charges | Charged once |
| Tax | Subscription tax and one-off tax |
| **Due for the first period** | First period (prorated when configured) + one-off charges, with tax |
| **Renewal per period** | Each following period, with tax, without one-off charges |
| **Annual subscription equivalent** | Subscription after discount × 12 / months, before tax |

**Proration.** When a calculation gives days remaining out of days in the period, only the first period's subscription is prorated.

## 11. Commercial models

These are configurable presets, not formulas:
- **Implementation + support:** one-off implementation, with annual support and maintenance.
- **Subscription:** recurring modules, with optional implementation.
- **Enterprise & multi-country:** priced per country and entity, plus localisation, hosting and support.

AI features can be priced as a fixed subscription (flat), as usage (per usage unit) or inside an enterprise package. The AI assistant is planned until confirmed.

## 12. Quotations

- **Creating one:** from the calculator, on the **published** book only, by an editor.
  - References look like `ZIRAHR-Q-2026-0001`.
  - The issue date is today, and the expiry date is the issue date plus the validity days.
  - Terms come from the book's terms by default.
- **Statuses:**
  - **Draft:** editable, and re-priced against the current published book when changed.
  - **Pending approval:** refused while any item has no price.
  - **Approved:** by a different reviewer; owners may approve their own.
  - **Sent:** marked, or when a customer link is created.
  - **Accepted / declined:** recorded by a reviewer when the customer replies.
  - **Expired:** approved or sent quotations past their expiry date.
- **Frozen:** the snapshot (lines, totals, tax, terms, model) never changes afterwards, even when prices change, are republished or are rolled back.
- **Customer links** (`/quote#t=…`):
  - The token is shown once, and only its hash is stored; it lives in the URL fragment, so it never reaches server logs.
  - A new link replaces the old one, and "Stop sharing" ends access.
  - Customers see the document only: never internal notes, inputs or the price book. Drafts and pending quotations can't be opened.
- **PDF:** "Print or save as PDF" uses a print-ready layout, both in the Studio and on the customer page.

## 13. One pricing source

- **Same component, same source.** The Studio's Calculator tab and "Open calculator in a new tab" are the same calculator, with the same **Saved draft prices / Published prices** switch.
  - The rates in the table come from the version being priced, and the API prices that same saved version.
  - The draft is for internal preview and testing. Published prices are what official quotations use, and "Create quotation" appears only on published prices.
- **Unsaved edits are never priced silently.** While the Studio has unsaved changes, the calculator says so, and keeps pricing the last saved draft until you save.
- **Every save recalculates at once.** Each calculation sends the version number, so a saved rate, quantity, item or billing-cycle change updates the totals immediately, without a refresh.
- **Restores and others' saves:** after a restore, or someone else's save, the editor takes the newer saved draft (unless you have unsaved edits).
- **Quantities:** per-employee, per-user and per-payroll-employee lines are linked to the employees / licences number and show it. Typing a number makes the line's quantity custom. "Use employee count" links it again. Unselected items are left out.
- **Missing rates:** an item without a rate shows **Rate not configured**, is listed by name under "Not included in the totals", and blocks official quotations. It's never treated as zero.
- **Size:** a full price book is large (up to 120 items with tiers and cycle terms), so pricing requests have their own 256 KB limit. The API's general 16 KB form limit refused full books before 31 Oct 2026; that's now covered by a regression test.

## 14. Publishing and visibility

There are two separate controls:
1. **Publish pricing configuration:** an editor asks for approval (with an optional effective date), and a different reviewer approves.
   - The version becomes available to calculators and new quotations.
   - The comparison shows what changed against the published version (added, removed and changed items, old → new rate, settings).
2. **Show pricing on the website:** a reviewer switch, **off by default**, and only possible once a version is published.
   - **Off:** the product's `/pricing` page invites visitors to request a quote and isn't indexed. Calculators and approved quotations keep working.
   - **On:** only items that are published, active, available, priced and marked public are shown, as cards plus an estimate calculator. Plans show only when all their modules are public. Internal terms, exchange rates and models never appear.

**Restore into draft:** copies an earlier version into the draft, which then needs approval again. It never changes quotations.

**Audit:** every save, request, approval, rejection, publication, rollback, visibility change and quotation action is recorded (`pricing.*` in the activity log).

## 15. Permissions

| Role (on the website) | Can |
| --- | --- |
| Viewer | See pricing, calculate, see quotations |
| Editor | Edit the draft, ask for approval, create and update draft quotations, submit them, create customer links, mark as sent |
| Reviewer | All of the above, plus approve or decline pricing and quotations (not their own request), switch website visibility, record accepted or declined |
| Owner | All of the above, and may approve their own requests |

## 16. Reusing the engine for other products

Every product website gets its own price book (an empty catalogue in KES to start). The site-kit components can be used on any product website:
- `PricingSummary`;
- `QuoteDocument`;
- `PublicPricing`;
- `useCalculation`.
