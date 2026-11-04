//! The payroll estimate engine: one forward calculation (gross to net), and a
//! bounded search around that same calculation for net to gross, so the two
//! can never disagree. Exact decimals only. All statutory values come from a
//! dated rule set, never from code. Nothing is stored or logged.

use chrono::NaiveDate;
use rust_decimal::dec;
use rust_decimal::{Decimal, RoundingStrategy, prelude::ToPrimitive};
use serde::{Deserialize, Serialize};

use crate::error::FieldError;

/// The most a net-to-gross answer may differ from the target. Each component
/// rounds to the cent, so an exact match isn't always possible.
pub const TOLERANCE: Decimal = dec!(0.05);
/// Far above any salary; keeps the search bounded and refuses nonsense input.
pub const MAX_AMOUNT: Decimal = dec!(1000000000);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Nssf {
    /// Percent of pensionable pay, for the employee and matched by the employer.
    pub rate: Decimal,
    pub lower_limit: Decimal,
    pub upper_limit: Decimal,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Shif {
    pub rate: Decimal,
    pub minimum: Decimal,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct HousingLevy {
    pub employee_rate: Decimal,
    pub employer_rate: Decimal,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Band {
    /// The top of the band in taxable pay; `None` for the last, open band.
    pub up_to: Option<Decimal>,
    pub rate: Decimal,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Paye {
    pub bands: Vec<Band>,
    pub personal_relief: Decimal,
    pub insurance_relief_rate: Decimal,
    pub insurance_relief_cap: Decimal,
}

/// Monthly limits on what reduces taxable pay.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Limits {
    /// NSSF plus registered pension contributions.
    pub retirement: Decimal,
    pub mortgage_interest: Decimal,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EmployerLevy {
    pub name: String,
    pub amount: Decimal,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Source {
    pub label: String,
    pub url: String,
}

/// One statutory period: every value that can change, with where it came from.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RuleSet {
    pub label: String,
    pub effective_from: NaiveDate,
    pub nssf: Nssf,
    pub shif: Shif,
    pub housing_levy: HousingLevy,
    pub paye: Paye,
    pub limits: Limits,
    #[serde(default)]
    pub employer_levies: Vec<EmployerLevy>,
    #[serde(default)]
    pub sources: Vec<Source>,
    /// When a person checked this against the official sources. Nothing can be
    /// published until they have.
    #[serde(default)]
    pub verified_on: Option<NaiveDate>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    GrossToNet,
    NetToGross,
}

fn zero() -> Decimal {
    Decimal::ZERO
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CalcInput {
    pub mode: Mode,
    /// Gross cash pay, or the net pay wanted.
    pub amount: Decimal,
    /// Any day in the pay month; today when absent.
    #[serde(default)]
    pub pay_month: Option<NaiveDate>,
    /// Non-cash benefits: taxable, but never paid out.
    #[serde(default = "zero")]
    pub taxable_benefits: Decimal,
    /// Registered pension, taken from pay.
    #[serde(default = "zero")]
    pub pension: Decimal,
    /// Paid privately: reduces taxable pay only.
    #[serde(default = "zero")]
    pub mortgage_interest: Decimal,
    /// Paid privately: earns insurance relief only.
    #[serde(default = "zero")]
    pub insurance_premium: Decimal,
    /// After-tax deductions.
    #[serde(default = "zero")]
    pub other_deductions: Decimal,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct BandLine {
    pub from: Decimal,
    pub to: Option<Decimal>,
    pub rate: Decimal,
    pub taxed: Decimal,
    pub tax: Decimal,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct EmployerCost {
    pub nssf_tier1: Decimal,
    pub nssf_tier2: Decimal,
    pub housing_levy: Decimal,
    pub levies: Vec<EmployerLevy>,
    /// Gross pay plus everything above: never taken from the employee's pay.
    pub total_cost: Decimal,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Breakdown {
    pub gross: Decimal,
    pub taxable_benefits: Decimal,
    pub nssf_tier1: Decimal,
    pub nssf_tier2: Decimal,
    pub nssf: Decimal,
    pub shif: Decimal,
    pub housing_levy: Decimal,
    pub pension: Decimal,
    /// Pension that counted towards taxable pay, after the retirement limit.
    pub retirement_allowed: Decimal,
    pub mortgage_allowed: Decimal,
    pub allowable_deductions: Decimal,
    pub taxable_pay: Decimal,
    pub bands: Vec<BandLine>,
    pub tax_before_relief: Decimal,
    pub personal_relief: Decimal,
    pub insurance_relief: Decimal,
    pub paye: Decimal,
    pub other_deductions: Decimal,
    pub total_deductions: Decimal,
    pub net: Decimal,
    pub employer: EmployerCost,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Calculation {
    pub mode: Mode,
    pub breakdown: Breakdown,
    /// Net to gross only: what was asked for, and how far off the answer is.
    pub target_net: Option<Decimal>,
    pub difference: Option<Decimal>,
    pub tolerance: Decimal,
    pub rules: RulesUsed,
    pub warnings: Vec<&'static str>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct RulesUsed {
    pub label: String,
    pub effective_from: NaiveDate,
}

fn cents(value: Decimal) -> Decimal {
    value.round_dp_with_strategy(2, RoundingStrategy::MidpointAwayFromZero)
}

fn percent(of: Decimal, rate: Decimal) -> Decimal {
    of * rate / dec!(100)
}

/// The forward calculation, in the order Kenyan payroll applies it: NSSF, SHIF
/// and the Housing Levy come off before PAYE. Employer shares never touch net pay.
pub fn gross_to_net(rules: &RuleSet, input: &CalcInput, gross: Decimal) -> Breakdown {
    let nssf_tier1 = cents(percent(gross.min(rules.nssf.lower_limit), rules.nssf.rate));
    let nssf_tier2 = cents(percent(
        (gross.min(rules.nssf.upper_limit) - rules.nssf.lower_limit).max(Decimal::ZERO),
        rules.nssf.rate,
    ));
    let nssf = nssf_tier1 + nssf_tier2;
    // The minimum applies to anyone paid; no pay means no contribution.
    let shif = if gross > Decimal::ZERO {
        cents(percent(gross, rules.shif.rate)).max(rules.shif.minimum)
    } else {
        Decimal::ZERO
    };
    let housing_levy = cents(percent(gross, rules.housing_levy.employee_rate));

    let retirement_total = (nssf + input.pension).min(rules.limits.retirement);
    let retirement_allowed = (retirement_total - nssf).max(Decimal::ZERO);
    let mortgage_allowed = input.mortgage_interest.min(rules.limits.mortgage_interest);
    let allowable_deductions = nssf + retirement_allowed + shif + housing_levy + mortgage_allowed;
    let taxable_pay = (gross + input.taxable_benefits - allowable_deductions).max(Decimal::ZERO);

    let mut bands = Vec::with_capacity(rules.paye.bands.len());
    let mut from = Decimal::ZERO;
    let mut exact_tax = Decimal::ZERO;
    for band in &rules.paye.bands {
        let top = band.up_to.map_or(taxable_pay, |up_to| up_to.min(taxable_pay));
        let taxed = (top - from).max(Decimal::ZERO);
        let tax = percent(taxed, band.rate);
        exact_tax += tax;
        bands.push(BandLine {
            from,
            to: band.up_to,
            rate: band.rate,
            taxed,
            tax: cents(tax),
        });
        if let Some(up_to) = band.up_to {
            from = up_to;
        }
    }
    let tax_before_relief = cents(exact_tax);
    // Relief can't take PAYE below zero, and only what's used is shown.
    let personal_relief = rules.paye.personal_relief.min(tax_before_relief);
    let insurance_relief = cents(percent(input.insurance_premium, rules.paye.insurance_relief_rate))
        .min(rules.paye.insurance_relief_cap)
        .min(tax_before_relief - personal_relief);
    let paye = tax_before_relief - personal_relief - insurance_relief;

    let total_deductions = nssf + shif + housing_levy + input.pension + paye + input.other_deductions;
    let employer_levies = if gross > Decimal::ZERO {
        rules.employer_levies.clone()
    } else {
        Vec::new()
    };
    let employer_housing = cents(percent(gross, rules.housing_levy.employer_rate));
    let total_cost =
        gross + nssf + employer_housing + employer_levies.iter().map(|l| l.amount).sum::<Decimal>();

    Breakdown {
        gross,
        taxable_benefits: input.taxable_benefits,
        nssf_tier1,
        nssf_tier2,
        nssf,
        shif,
        housing_levy,
        pension: input.pension,
        retirement_allowed,
        mortgage_allowed,
        allowable_deductions,
        taxable_pay,
        bands,
        tax_before_relief,
        personal_relief,
        insurance_relief,
        paye,
        other_deductions: input.other_deductions,
        total_deductions,
        net: gross - total_deductions,
        employer: EmployerCost {
            nssf_tier1,
            nssf_tier2,
            housing_levy: employer_housing,
            levies: employer_levies,
            total_cost,
        },
    }
}

/// The smallest gross pay (to the cent) that reaches the target, found by
/// bisection over whole cents around the forward calculation. It stays correct
/// across band edges and minimums because it only ever evaluates that calculation.
fn solve_gross(rules: &RuleSet, input: &CalcInput, target: Decimal) -> Result<Breakdown, CalcError> {
    let net_at = |cents: i64| gross_to_net(rules, input, Decimal::new(cents, 2)).net;
    let mut low: i64 = 1;
    let mut high: i64 = (MAX_AMOUNT * dec!(100)).to_i64().unwrap_or(i64::MAX);
    if net_at(high) < target {
        return Err(CalcError::Unattainable(
            "That net pay is out of reach: the gross needed is above the calculator's limit.",
        ));
    }
    while low < high {
        let middle = low + (high - low) / 2;
        if net_at(middle) >= target {
            high = middle;
        } else {
            low = middle + 1;
        }
    }
    let breakdown = gross_to_net(rules, input, Decimal::new(low, 2));
    // The proof: the forward calculation must land on the target.
    if (breakdown.net - target).abs() > TOLERANCE {
        return Err(CalcError::Unattainable(
            "No gross pay gives exactly that net pay with these settings. Try a slightly different amount.",
        ));
    }
    Ok(breakdown)
}

#[derive(Debug, PartialEq)]
pub enum CalcError {
    Invalid(Vec<FieldError>),
    /// No rule set covers the pay month.
    NoRules,
    Unattainable(&'static str),
}

fn check_amount(errors: &mut Vec<FieldError>, value: Decimal, field: &'static str, message: &'static str) {
    if value < Decimal::ZERO || value > MAX_AMOUNT {
        errors.push(FieldError {
            field,
            code: "range",
            message,
        });
    }
}

/// The rule set in force for a month: the latest that has started by its last day.
pub fn rules_for(sets: &[RuleSet], month: NaiveDate) -> Option<&RuleSet> {
    use chrono::Datelike;
    let next = if month.month() == 12 {
        NaiveDate::from_ymd_opt(month.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(month.year(), month.month() + 1, 1)
    }?;
    sets.iter()
        .filter(|set| set.effective_from < next)
        .max_by_key(|set| set.effective_from)
}

pub fn calculate(sets: &[RuleSet], input: &CalcInput, today: NaiveDate) -> Result<Calculation, CalcError> {
    let mut errors = Vec::new();
    check_amount(
        &mut errors,
        input.amount,
        "amount",
        "Enter an amount between zero and one billion.",
    );
    if input.mode == Mode::NetToGross && input.amount <= Decimal::ZERO {
        errors.push(FieldError {
            field: "amount",
            code: "required",
            message: "Enter the net pay you want, above zero.",
        });
    }
    for (value, field) in [
        (input.taxable_benefits, "taxable_benefits"),
        (input.pension, "pension"),
        (input.mortgage_interest, "mortgage_interest"),
        (input.insurance_premium, "insurance_premium"),
        (input.other_deductions, "other_deductions"),
    ] {
        check_amount(
            &mut errors,
            value,
            field,
            "This can't be negative or above one billion.",
        );
    }
    if !errors.is_empty() {
        return Err(CalcError::Invalid(errors));
    }
    let rules = rules_for(sets, input.pay_month.unwrap_or(today)).ok_or(CalcError::NoRules)?;
    let (breakdown, target_net, difference) = match input.mode {
        Mode::GrossToNet => (gross_to_net(rules, input, cents(input.amount)), None, None),
        Mode::NetToGross => {
            let target = cents(input.amount);
            let breakdown = solve_gross(rules, input, target)?;
            let difference = breakdown.net - target;
            (breakdown, Some(target), Some(difference))
        }
    };
    let mut warnings = Vec::new();
    if breakdown.net < Decimal::ZERO {
        warnings.push("Deductions are more than this pay, so net pay is below zero.");
    }
    Ok(Calculation {
        mode: input.mode,
        breakdown,
        target_net,
        difference,
        tolerance: TOLERANCE,
        rules: RulesUsed {
            label: rules.label.clone(),
            effective_from: rules.effective_from,
        },
        warnings,
    })
}

fn invalid(errors: &mut Vec<FieldError>, code: &'static str, message: &'static str) {
    errors.push(FieldError {
        field: "rule_sets",
        code,
        message,
    });
}

/// Checks a rule set so an editing slip can't produce a wrong calculation.
pub fn validate_rules(set: &RuleSet, errors: &mut Vec<FieldError>) {
    let in_range = |rate: Decimal| rate >= Decimal::ZERO && rate <= dec!(100);
    if set.label.trim().is_empty() || set.label.chars().count() > 80 {
        invalid(
            errors,
            "label",
            "Every rule set needs a name of up to 80 characters.",
        );
    }
    if ![
        set.nssf.rate,
        set.shif.rate,
        set.housing_levy.employee_rate,
        set.housing_levy.employer_rate,
        set.paye.insurance_relief_rate,
    ]
    .into_iter()
    .all(in_range)
    {
        invalid(errors, "rate", "Rates are percentages from 0 to 100.");
    }
    if set.nssf.lower_limit < Decimal::ZERO || set.nssf.upper_limit < set.nssf.lower_limit {
        invalid(
            errors,
            "nssf",
            "The NSSF upper limit can't be below the lower limit.",
        );
    }
    if [
        set.shif.minimum,
        set.paye.personal_relief,
        set.paye.insurance_relief_cap,
        set.limits.retirement,
        set.limits.mortgage_interest,
    ]
    .iter()
    .any(|v| *v < Decimal::ZERO)
    {
        invalid(errors, "amount", "Amounts can't be negative.");
    }
    let bands = &set.paye.bands;
    if bands.is_empty() || bands.len() > 12 {
        invalid(errors, "bands", "PAYE needs between 1 and 12 bands.");
    } else {
        let mut previous = Decimal::ZERO;
        for (i, band) in bands.iter().enumerate() {
            if !in_range(band.rate) {
                invalid(errors, "rate", "Rates are percentages from 0 to 100.");
            }
            match band.up_to {
                Some(up_to) if up_to <= previous => {
                    invalid(errors, "bands", "PAYE bands must go up in order.");
                }
                Some(_) if i == bands.len() - 1 => {
                    invalid(errors, "bands", "The last PAYE band must have no upper limit.");
                }
                None if i != bands.len() - 1 => {
                    invalid(
                        errors,
                        "bands",
                        "Only the last PAYE band can have no upper limit.",
                    );
                }
                _ => {}
            }
            previous = band.up_to.unwrap_or(previous);
        }
    }
    if set.employer_levies.len() > 8
        || set
            .employer_levies
            .iter()
            .any(|l| l.name.trim().is_empty() || l.name.chars().count() > 60 || l.amount < Decimal::ZERO)
    {
        invalid(errors, "levies", "Employer levies need a name and an amount.");
    }
    if set.sources.len() > 12
        || set.sources.iter().any(|s| {
            s.label.trim().is_empty() || !s.url.starts_with("https://") || s.url.chars().count() > 500
        })
    {
        invalid(errors, "sources", "Sources need a name and an https:// address.");
    }
    if set.notes.as_ref().is_some_and(|n| n.chars().count() > 600) {
        invalid(errors, "notes", "Notes can be up to 600 characters.");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    fn rules(label: &str, from: NaiveDate, lower: Decimal, upper: Decimal) -> RuleSet {
        RuleSet {
            label: label.into(),
            effective_from: from,
            nssf: Nssf {
                rate: dec!(6),
                lower_limit: lower,
                upper_limit: upper,
            },
            shif: Shif {
                rate: dec!(2.75),
                minimum: dec!(300),
            },
            housing_levy: HousingLevy {
                employee_rate: dec!(1.5),
                employer_rate: dec!(1.5),
            },
            paye: Paye {
                bands: vec![
                    Band {
                        up_to: Some(dec!(24000)),
                        rate: dec!(10),
                    },
                    Band {
                        up_to: Some(dec!(32333)),
                        rate: dec!(25),
                    },
                    Band {
                        up_to: Some(dec!(500000)),
                        rate: dec!(30),
                    },
                    Band {
                        up_to: Some(dec!(800000)),
                        rate: dec!(32.5),
                    },
                    Band {
                        up_to: None,
                        rate: dec!(35),
                    },
                ],
                personal_relief: dec!(2400),
                insurance_relief_rate: dec!(15),
                insurance_relief_cap: dec!(5000),
            },
            limits: Limits {
                retirement: dec!(30000),
                mortgage_interest: dec!(30000),
            },
            employer_levies: vec![EmployerLevy {
                name: "NITA".into(),
                amount: dec!(50),
            }],
            sources: vec![],
            verified_on: None,
            notes: None,
        }
    }

    fn current() -> RuleSet {
        rules("Year 4", date(2026, 2, 1), dec!(9000), dec!(108000))
    }

    fn input(mode: Mode, amount: Decimal) -> CalcInput {
        CalcInput {
            mode,
            amount,
            pay_month: Some(date(2026, 11, 1)),
            taxable_benefits: Decimal::ZERO,
            pension: Decimal::ZERO,
            mortgage_interest: Decimal::ZERO,
            insurance_premium: Decimal::ZERO,
            other_deductions: Decimal::ZERO,
        }
    }

    fn forward(set: &RuleSet, amount: Decimal) -> Breakdown {
        gross_to_net(set, &input(Mode::GrossToNet, amount), amount)
    }

    /// An independent worked payslip: the reference document's June 2026
    /// example, which used an upper limit of 72,000.
    #[test]
    fn matches_an_independent_worked_payslip() {
        let set = rules("Reference", date(2025, 2, 1), dec!(8000), dec!(72000));
        let b = forward(&set, dec!(150000));
        assert_eq!(b.nssf, dec!(4320));
        assert_eq!(b.shif, dec!(4125));
        assert_eq!(b.housing_levy, dec!(2250));
        assert_eq!(b.taxable_pay, dec!(139305));
        assert_eq!(b.bands[0].tax, dec!(2400));
        assert_eq!(b.bands[1].tax, dec!(2083.25));
        assert_eq!(b.bands[2].taxed, dec!(106972));
        assert_eq!(b.bands[2].tax, dec!(32091.60));
        assert_eq!(b.tax_before_relief, dec!(36574.85));
        assert_eq!(b.paye, dec!(34174.85));
        assert_eq!(b.net, dec!(105130.15));
        assert_eq!(b.employer.total_cost, dec!(156620));
    }

    /// The figures on the website's illustrative payslip. If rules change,
    /// update `product-demos.tsx` with this test.
    #[test]
    fn matches_the_illustrative_payslip_on_the_website() {
        let b = forward(&current(), dec!(150000));
        assert_eq!(b.nssf_tier1, dec!(540));
        assert_eq!(b.nssf_tier2, dec!(5940));
        assert_eq!(b.nssf, dec!(6480));
        assert_eq!(b.shif, dec!(4125));
        assert_eq!(b.housing_levy, dec!(2250));
        assert_eq!(b.taxable_pay, dec!(137145));
        assert_eq!(b.tax_before_relief, dec!(35926.85));
        assert_eq!(b.paye, dec!(33526.85));
        assert_eq!(b.net, dec!(103618.15));
    }

    #[test]
    fn nssf_tiers_follow_the_limits_exactly() {
        let set = current();
        for (gross, tier1, tier2) in [
            (dec!(5000), dec!(300), dec!(0)),
            (dec!(9000), dec!(540), dec!(0)),
            (dec!(9000.01), dec!(540), dec!(0)),
            (dec!(50000), dec!(540), dec!(2460)),
            (dec!(108000), dec!(540), dec!(5940)),
            (dec!(500000), dec!(540), dec!(5940)),
        ] {
            let b = forward(&set, gross);
            assert_eq!((b.nssf_tier1, b.nssf_tier2), (tier1, tier2), "{gross}");
        }
    }

    #[test]
    fn shif_has_a_minimum_but_no_pay_means_no_contribution() {
        let set = current();
        assert_eq!(forward(&set, dec!(5000)).shif, dec!(300));
        assert_eq!(forward(&set, dec!(1000000)).shif, dec!(27500), "no upper cap");
        let zero = forward(&set, Decimal::ZERO);
        assert_eq!(zero.shif, Decimal::ZERO);
        assert_eq!(zero.net, Decimal::ZERO);
        assert_eq!(zero.employer.total_cost, Decimal::ZERO);
    }

    #[test]
    fn relief_never_takes_paye_below_zero() {
        let b = forward(&current(), dec!(20000));
        assert_eq!(b.paye, Decimal::ZERO);
        assert!(b.personal_relief <= b.tax_before_relief);
    }

    #[test]
    fn every_band_edge_is_taxed_once() {
        let b = forward(&current(), dec!(2000000));
        let taxed: Decimal = b.bands.iter().map(|x| x.taxed).sum();
        assert_eq!(taxed, b.taxable_pay);
        assert!(b.bands.iter().all(|x| x.taxed >= Decimal::ZERO));
    }

    #[test]
    fn employer_shares_never_reduce_net_pay() {
        let set = current();
        let mut richer = set.clone();
        richer.housing_levy.employer_rate = dec!(50);
        richer.employer_levies[0].amount = dec!(9999);
        assert_eq!(forward(&set, dec!(90000)).net, forward(&richer, dec!(90000)).net);
    }

    #[test]
    fn allowable_deductions_and_relief_follow_their_limits() {
        let set = current();
        let mut i = input(Mode::GrossToNet, dec!(300000));
        i.pension = dec!(50000);
        i.mortgage_interest = dec!(40000);
        i.insurance_premium = dec!(100000);
        i.other_deductions = dec!(1000);
        i.taxable_benefits = dec!(10000);
        let b = gross_to_net(&set, &i, dec!(300000));
        assert_eq!(b.retirement_allowed, dec!(30000) - b.nssf, "capped with NSSF");
        assert_eq!(b.mortgage_allowed, dec!(30000));
        assert_eq!(b.insurance_relief, dec!(5000));
        // Pension leaves pay in full; only part of it reduces tax.
        assert_eq!(
            b.net,
            dec!(300000) - b.nssf - b.shif - b.housing_levy - dec!(50000) - b.paye - dec!(1000)
        );
        // Benefits are taxed but never paid: mortgage interest and premiums aren't taken from pay.
        assert_eq!(
            b.taxable_pay,
            dec!(310000) - b.nssf - b.retirement_allowed - b.shif - b.housing_levy - dec!(30000)
        );
    }

    #[test]
    fn net_to_gross_reconciles_with_the_forward_calculation_everywhere() {
        let set = current();
        let sets = vec![set.clone()];
        let targets = [
            dec!(1),
            dec!(500),
            dec!(8000.33),
            dec!(20000),
            dec!(24000.01),
            dec!(32333),
            dec!(50000),
            dec!(100000),
            dec!(103618.15),
            dec!(350000),
            dec!(500000.55),
            dec!(750000),
            dec!(5000000),
        ];
        for target in targets {
            let result = calculate(&sets, &input(Mode::NetToGross, target), date(2026, 11, 1)).unwrap();
            let difference = result.difference.unwrap();
            assert!(difference.abs() <= TOLERANCE, "{target}: {difference}");
            // Solved by the same forward calculation, shown as the proof.
            let check = forward(&set, result.breakdown.gross);
            assert_eq!(check, result.breakdown, "{target}");
        }
        let exact = calculate(
            &sets,
            &input(Mode::NetToGross, dec!(103618.15)),
            date(2026, 11, 1),
        )
        .unwrap();
        assert!((exact.breakdown.gross - dec!(150000)).abs() <= dec!(0.05));
    }

    #[test]
    fn net_to_gross_reconciles_with_every_optional_input() {
        let set = current();
        let sets = vec![set];
        let mut i = input(Mode::NetToGross, dec!(90000));
        i.pension = dec!(5000);
        i.mortgage_interest = dec!(10000);
        i.insurance_premium = dec!(2000);
        i.other_deductions = dec!(3000);
        i.taxable_benefits = dec!(7000);
        let result = calculate(&sets, &i, date(2026, 11, 1)).unwrap();
        assert!(result.difference.unwrap().abs() <= TOLERANCE);
    }

    #[test]
    fn unattainable_and_invalid_inputs_are_explained() {
        let sets = vec![current()];
        let today = date(2026, 11, 1);
        assert!(matches!(
            calculate(&sets, &input(Mode::NetToGross, MAX_AMOUNT), today),
            Err(CalcError::Unattainable(_))
        ));
        for bad in [
            input(Mode::GrossToNet, dec!(-1)),
            input(Mode::NetToGross, Decimal::ZERO),
            input(Mode::GrossToNet, MAX_AMOUNT + dec!(1)),
            CalcInput {
                pension: dec!(-5),
                ..input(Mode::GrossToNet, dec!(100))
            },
        ] {
            assert!(matches!(
                calculate(&sets, &bad, today),
                Err(CalcError::Invalid(_))
            ));
        }
        let low = calculate(&sets, &input(Mode::GrossToNet, dec!(100)), today).unwrap();
        assert_eq!(low.warnings.len(), 1, "SHIF's minimum exceeds this pay");
    }

    #[test]
    fn the_pay_month_chooses_the_rules_and_changes_the_answer() {
        let older = rules("Year 3", date(2025, 2, 1), dec!(8000), dec!(72000));
        let newer = current();
        let sets = vec![newer, older];
        let at = |y, m, d| {
            let mut i = input(Mode::GrossToNet, dec!(150000));
            i.pay_month = Some(date(y, m, d));
            calculate(&sets, &i, date(2026, 11, 1))
        };
        let january = at(2026, 1, 31).unwrap();
        assert_eq!(january.rules.label, "Year 3");
        assert_eq!(january.breakdown.nssf, dec!(4320));
        // Any day in February uses February's rules: pay is by the month.
        assert_eq!(at(2026, 2, 1).unwrap().rules.label, "Year 4");
        assert_eq!(at(2026, 2, 28).unwrap().breakdown.nssf, dec!(6480));
        assert_eq!(at(2025, 2, 14).unwrap().rules.label, "Year 3");
        assert_eq!(at(2025, 1, 15), Err(CalcError::NoRules));
        // Absent: today's rules.
        let mut today = input(Mode::GrossToNet, dec!(150000));
        today.pay_month = None;
        assert_eq!(
            calculate(&sets, &today, date(2026, 1, 15)).unwrap().rules.label,
            "Year 3"
        );
    }

    #[test]
    fn broken_rules_are_refused() {
        let check = |change: fn(&mut RuleSet)| {
            let mut set = current();
            change(&mut set);
            let mut errors = Vec::new();
            validate_rules(&set, &mut errors);
            errors.len()
        };
        assert_eq!(check(|_| {}), 0);
        assert!(check(|s| s.nssf.rate = dec!(600)) > 0, "a slipped decimal");
        assert!(check(|s| s.nssf.upper_limit = dec!(1)) > 0);
        assert!(check(|s| s.paye.bands.clear()) > 0);
        assert!(
            check(|s| s.paye.bands[1].up_to = Some(dec!(10))) > 0,
            "out of order"
        );
        assert!(
            check(|s| s.paye.bands[4].up_to = Some(dec!(900000))) > 0,
            "no open band"
        );
        assert!(check(|s| s.paye.bands[0].up_to = None) > 0);
        assert!(check(|s| s.shif.minimum = dec!(-1)) > 0);
        assert!(check(|s| s.label.clear()) > 0);
        assert!(
            check(|s| s.sources.push(Source {
                label: "x".into(),
                url: "javascript:alert(1)".into()
            })) > 0
        );
    }
}
