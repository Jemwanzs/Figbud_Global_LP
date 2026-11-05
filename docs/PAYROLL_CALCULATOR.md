# Payroll Calculator

A public salary estimate for Kenya, gross to net and net to gross. Studio → Websites → ZiraHR → **Payroll Calculator**; public page at `/payroll-calculator`. It's separate from the subscription pricing calculator ([PRICING.md](PRICING.md)): different engine, routes and screens.

Last updated: 5 Nov 2026.

## 1. Principles

- **One engine.** `services/api/src/payroll/engine.rs` does every calculation with exact decimals. Browsers only collect inputs and lay out the answer.
- **No statutory value is in the calculation code.** Rates, limits and reliefs are dated rule sets, edited in the Studio.
- **Off until a person says otherwise.** Publishing needs a recorded check of every rule set and a second person's approval. The public page needs a further switch.
- **Nothing is kept.** Calculations aren't stored or logged, and no employee or tenant data is involved.

## 2. How gross to net works

Monthly, for a resident employee with one employer:

| Step | Rule |
| --- | --- |
| NSSF Tier I | Rate × pay up to the lower earnings limit |
| NSSF Tier II | Rate × pay between the lower and upper limits |
| SHIF | Rate × gross pay, at least the minimum. No pay means no contribution |
| Housing Levy | Employee rate × gross pay |
| Allowable deductions | NSSF plus pension (together up to the retirement limit), SHIF, Housing Levy, and mortgage interest (up to its limit) |
| Taxable pay | Gross + non-cash benefits − allowable deductions, never below zero |
| PAYE | Each band's rate on the pay within it, then less personal and insurance relief, never below zero |
| Net pay | Gross − NSSF − SHIF − Housing Levy − pension − PAYE − other deductions |
| Employer cost | Gross + matching NSSF + employer Housing Levy + employer levies. Shown separately; never taken from net pay |

Each component rounds to the cent, half up.

## 3. How net to gross works

A bisection over whole cents around that same forward calculation, between 0.01 and 1 billion. It finds the smallest gross that reaches the target. The result is proved by the forward calculation and must land within **KES 0.05** of the target (each component rounds, so an exact match isn't always possible). If it doesn't, the visitor gets an explanation, not a figure.

Because it only evaluates the forward calculation, band edges, limits and minimums need no special handling, and the two directions can't disagree.

## 4. Rule sets and selection

Each pay month uses the latest rule set that has started by the end of that month. The month is optional and defaults to today. A month before every rule set gets a clear message.

**Starting values are drafts, checked only as far as this:**

| Value | Starting value | Basis |
| --- | --- | --- |
| NSSF from Feb 2026 | 6%, limits 9,000 and 108,000 | NSSF Year 4 notice to employers |
| NSSF from Feb 2025 | 6%, limits 8,000 and 72,000 | PwC alert, February 2025 |
| SHIF | 2.75%, minimum 300, no cap | Secondary sources |
| Housing Levy | 1.5% employee, 1.5% employer | Secondary sources |
| Deductible before PAYE | NSSF, SHIF, Housing Levy | Tax Laws (Amendment) Act 2024, per Cliffe Dekker Hofmeyr |
| PAYE bands | 10% to 24,000; 25% to 32,333; 30% to 500,000; 32.5% to 800,000; 35% above | Secondary sources |
| Personal relief | 2,400 a month | Secondary sources |
| Insurance relief, retirement and mortgage limits | 15% up to 5,000; 30,000; 30,000 | Tax Laws (Amendment) Act 2024, per Sage's December 2024 note and other firms' alerts |
| NITA levy | 50 a month, employer | NITA's Levy Inspectorate page. Employer-only, so it never affects net pay |

**Checked on 5 Nov 2026** against the sources listed with the rules, at the owner's request, and recorded as the check date. This wasn't a legal opinion. Check again when a new Finance Act, NSSF year or SHIF ruling takes effect; the API refuses approval without a date.

**SHIF:** a High Court judgment has been reported as calling the deduction illegal, and the Ministry of Health says it remains in force. The owner confirmed on 5 Nov 2026 that it's being deducted now, so the calculator deducts it. It's a value in the rules, so a change is a Studio edit, not a code change.

## 5. Publishing

Draft → ask for approval → approved by a different reviewer (owners may approve their own) → published version. Any version can be made live again in one step, recorded as a new version. Everything is in the audit log (`payroll_calculator.*`).

The Studio's **Try it** panel runs the saved draft or the published version, never a mix.

## 6. Limits

Out of scope for this estimate: non-residents, secondary employment, irregular pay, exempt categories, and contracting out of NSSF Tier II. The page's notice states the assumption. Add them as rule-set options if you want them.

## 7. API

- Public: `GET /v1/sites/{slug}/payroll-calculator` (`{"calculator": null}` while off); `POST …/calculate`, rate limited per IP. The website calls it through its own `/payroll-calculate`.
- Studio: `GET /v1/admin/sites/{slug}/payroll-calculator`; `POST …/draft`, `…/calculate`, `…/visibility`, `…/{submit|publish|reject|rollback}`. Migration 27.

## 8. Tests

- **Independent check:** a worked payslip from the supplied reference (gross 150,000, net 105,130.15) reproduces to the cent.
- **Engine:** tier and band edges, the SHIF minimum, relief limits, employer shares, optional inputs, net to gross across 13 targets, unattainable amounts, and rules changing between periods.
- **API:** the verification gate, approval, draft and public separation, rollback, stale saves, the public switch.
- **Screens:** Studio flow; public page in both directions, errors clearing figures, pay month, both themes, axe.
