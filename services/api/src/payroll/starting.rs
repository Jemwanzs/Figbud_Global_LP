//! What a website's calculator starts with. `verified_on` starts empty, and
//! publishing refuses until it's filled in. From here on the Studio owns the values.

use chrono::NaiveDate;
use rust_decimal::dec;

use super::{
    CalculatorConfig,
    engine::{Band, EmployerLevy, HousingLevy, Limits, Nssf, Paye, RuleSet, Shif, Source},
};

fn sources() -> Vec<Source> {
    let source = |label: &str, url: &str| Source {
        label: label.into(),
        url: url.into(),
    };
    vec![
        source(
            "NSSF: Notice to employers, Year 4 (2026) contribution rates",
            "https://gaa.go.ke/sites/default/files/2026-02/Notice%20To%20Employers%20%E2%80%94%20Year%204%20(2026)%20NSSF%20Contribution%20Rates%20.pdf",
        ),
        source(
            "Cliffe Dekker Hofmeyr: Housing Levy and SHIF become allowable deductions (Tax Laws (Amendment) Act 2024)",
            "https://www.cliffedekkerhofmeyr.com/en/news/publications/2025/Practice/Tax-Exchange-Control/tax-exchange-control-alert-21-February-2025-2025-payslip-overhaul-housing-levy-and-shif-become-allowable-deductions-as-nssf-contributions-surge",
        ),
        source(
            "PwC Worldwide Tax Summaries: Kenya, other taxes",
            "https://taxsummaries.pwc.com/kenya/individual/other-taxes",
        ),
        source(
            "PwC: updated NSSF rates, February 2025",
            "https://pwc.com/ke/en/assets/pdf/tax-alert-updated-nssf-rates-feb-2025.pdf",
        ),
        source(
            "PwC: NSSF Year 4 rates, 2026",
            "https://www.pwc.com/ke/en/assets/pdf/tax-alert-year-4nssf-rates-2026.pdf",
        ),
        source(
            "Sage: Kenya PAYE changes, December 2024 (pension, mortgage and insurance limits)",
            "https://communityhub.sage.com/za/sage-vip-payroll-hr/f/announcements/239226/kenya-paye-tax-changes---december-2024",
        ),
        source(
            "NITA: Levy Inspectorate (industrial training levy)",
            "https://nita.go.ke/our-services/levy-inspectorate.html",
        ),
    ]
}

fn rule_set(
    label: &str,
    from: (i32, u32, u32),
    lower: rust_decimal::Decimal,
    upper: rust_decimal::Decimal,
    notes: &str,
) -> RuleSet {
    RuleSet {
        label: label.into(),
        effective_from: NaiveDate::from_ymd_opt(from.0, from.1, from.2).expect("a real date"),
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
            name: "NITA levy".into(),
            amount: dec!(50),
        }],
        sources: sources(),
        verified_on: None,
        notes: Some(notes.into()),
    }
}

pub fn config() -> CalculatorConfig {
    CalculatorConfig {
        rule_sets: vec![
            rule_set(
                "NSSF Year 4 rates",
                (2026, 2, 1),
                dec!(9000),
                dec!(108000),
                "SHIF is deducted as a current statutory contribution, as the owner confirmed on 5 Nov 2026. Review when a new Finance Act, NSSF year or SHIF ruling takes effect.",
            ),
            rule_set(
                "NSSF Year 3 rates",
                (2025, 2, 1),
                dec!(8000),
                dec!(72000),
                "For pay months before February 2026. Limits per PwC's February 2025 alert.",
            ),
        ],
        intro: "Explore a transparent Kenyan payroll estimate in either direction: start with gross pay to see net pay, or start with the net pay you want to see the gross needed. Every step is visible.".into(),
        disclaimer: "Estimate only. For a resident employee with one employer, paid monthly. It isn't payroll, tax or legal advice: check the current official guidance before relying on these figures.".into(),
        example_gross: dec!(100000),
        example_net: dec!(75000),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_starting_rules_are_valid_but_cant_be_published_unchecked() {
        let config = config();
        assert!(config.validate().is_ok());
        assert!(config.rule_sets.iter().all(|s| s.verified_on.is_none()));
        assert!(config.require_verified().is_err());
    }
}
