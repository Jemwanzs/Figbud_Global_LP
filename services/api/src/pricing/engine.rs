//! The pricing engine (P11-PR1): one price book per product website and the
//! calculation every calculator, quotation and public price uses. Money is
//! `rust_decimal::Decimal` throughout (never floating point) and serialised
//! as strings. The rules are documented in docs/PRICING.md; keep both in step.
//!
//! - Recurring items carry a rate per month or per year. A billing period of
//!   `m` months charges `m` monthly rates, or `m/12` of the yearly rate.
//! - A billing cycle's discount applies only when configured (none by
//!   default), and only to discountable items. An item with its own rate for
//!   that cycle uses it *instead of* any discount, so nothing is discounted
//!   twice. A fixed cycle discount comes off the subscription once.
//! - Quantity tiers are either volume (the tier that holds the quantity
//!   prices every unit) or graduated (each band at its own rate).
//! - Minimum charges apply per item; a minimum subscription tops the whole
//!   recurring subscription up, per month of the period.
//! - Each line is rounded to the currency's decimals (half away from zero),
//!   and totals are sums of rounded lines, so documents always add up.
//! - Unpriced items, custom quotes and "quoted on scope" one-offs never get an
//!   invented price: they are listed separately and block approval.

use chrono::NaiveDate;
use rust_decimal::{Decimal, RoundingStrategy};
use serde::{Deserialize, Serialize};

use crate::error::FieldError;

pub const MAX_ITEMS: usize = 120;
pub const MAX_TIERS: usize = 10;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    Core,
    AddOn,
    Implementation,
    Support,
    Integration,
    Custom,
}

/// What one unit of an item is.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Method {
    Flat,
    PerEmployee,
    PerUser,
    PerPayrollEmployee,
    PerEntity,
    PerCountry,
    PerUsageUnit,
    PerParticipant,
    PerSession,
    PerDay,
    CustomQuote,
}

impl Method {
    /// Counted from the employee / licence number unless a quantity is given.
    pub fn uses_headcount(self) -> bool {
        matches!(self, Self::PerEmployee | Self::PerUser | Self::PerPayrollEmployee)
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Billing {
    OneOff,
    Monthly,
    Annual,
}

/// Commercial readiness, reconciled with the product's confirmed scope.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Availability {
    #[default]
    Available,
    /// Shown internally with a "Planned" label; never quoted or public.
    Planned,
}

/// How a one-off item appears by default on a quotation.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum OneOffMode {
    #[default]
    Charged,
    Included,
    Optional,
    Scoped,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TierMode {
    #[default]
    Volume,
    Graduated,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Tier {
    /// Inclusive upper bound; `None` for the last tier.
    pub up_to: Option<u32>,
    pub rate: Decimal,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DiscountKind {
    #[default]
    None,
    Percent,
    Fixed,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct Discount {
    pub kind: DiscountKind,
    /// Percent (0–100) or an amount per billing period.
    pub value: Decimal,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum CycleKey {
    Monthly,
    Quarterly,
    SemiAnnual,
    Annual,
}

impl CycleKey {
    pub const ALL: [Self; 4] = [Self::Monthly, Self::Quarterly, Self::SemiAnnual, Self::Annual];
    pub fn months(self) -> u32 {
        match self {
            Self::Monthly => 1,
            Self::Quarterly => 3,
            Self::SemiAnnual => 6,
            Self::Annual => 12,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Cycle {
    pub key: CycleKey,
    pub enabled: bool,
    /// The cycle's discount on discountable items; none unless configured.
    #[serde(default)]
    pub discount: Discount,
}

/// An item's own terms for one billing cycle.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CycleTerms {
    pub cycle: CycleKey,
    /// Rate per month (or per year for annual items) when billed this way;
    /// replaces the cycle discount for this item.
    #[serde(default)]
    pub rate: Option<Decimal>,
    /// This item's discount for the cycle instead of the cycle's.
    #[serde(default)]
    pub discount: Option<Discount>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Item {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub category: Category,
    /// Implementation groups: setup, migration, training, integrations, deployment.
    #[serde(default)]
    pub group: Option<String>,
    pub method: Method,
    #[serde(default)]
    pub unit_label: String,
    pub billing: Billing,
    /// `None`: not priced yet (never invented).
    #[serde(default)]
    pub rate: Option<Decimal>,
    #[serde(default)]
    pub minimum_charge: Option<Decimal>,
    #[serde(default)]
    pub tiers: Vec<Tier>,
    #[serde(default)]
    pub tier_mode: TierMode,
    #[serde(default)]
    pub cycle_terms: Vec<CycleTerms>,
    #[serde(default)]
    pub min_qty: Option<u32>,
    #[serde(default)]
    pub max_qty: Option<u32>,
    #[serde(default = "yes")]
    pub taxable: bool,
    #[serde(default = "yes")]
    pub discountable: bool,
    #[serde(default)]
    pub one_off_mode: OneOffMode,
    #[serde(default)]
    pub effective_from: Option<NaiveDate>,
    #[serde(default)]
    pub availability: Availability,
    #[serde(default = "yes")]
    pub active: bool,
    #[serde(default)]
    pub public: bool,
}

fn yes() -> bool {
    true
}

/// A package of items (e.g. "Core HR + Payroll").
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Plan {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub item_ids: Vec<String>,
    #[serde(default)]
    pub public: bool,
    #[serde(default = "yes")]
    pub active: bool,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ModelKind {
    ImplementationSupport,
    Subscription,
    Enterprise,
}

/// A commercial model: a configurable preset, not a hard-coded formula.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Model {
    pub id: String,
    pub kind: ModelKind,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub item_ids: Vec<String>,
    pub default_cycle: CycleKey,
    #[serde(default = "yes")]
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TaxPresentation {
    #[default]
    Exclusive,
    Inclusive,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct Tax {
    pub name: String,
    /// Percent; `None` until configured (no tax is assumed).
    pub rate: Option<Decimal>,
    pub presentation: TaxPresentation,
}

impl Default for Tax {
    fn default() -> Self {
        Self {
            name: "VAT".into(),
            rate: None,
            presentation: TaxPresentation::Exclusive,
        }
    }
}

/// A manually maintained exchange rate: 1 unit of `currency` = `rate` of the base.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FxRate {
    pub currency: String,
    pub rate: Decimal,
    #[serde(default)]
    pub as_of: Option<NaiveDate>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PriceBook {
    pub currency: String,
    #[serde(default)]
    pub supported_currencies: Vec<String>,
    #[serde(default)]
    pub fx_source: String,
    #[serde(default)]
    pub fx_rates: Vec<FxRate>,
    #[serde(default)]
    pub tax: Tax,
    #[serde(default = "two")]
    pub decimals: u32,
    pub cycles: Vec<Cycle>,
    pub items: Vec<Item>,
    #[serde(default)]
    pub plans: Vec<Plan>,
    #[serde(default)]
    pub models: Vec<Model>,
    /// Per month, before tax; the subscription is topped up to it.
    #[serde(default)]
    pub minimum_monthly_subscription: Option<Decimal>,
    #[serde(default = "thirty")]
    pub quote_validity_days: u32,
    #[serde(default)]
    pub terms: String,
}

fn two() -> u32 {
    2
}
fn thirty() -> u32 {
    30
}

fn err(field: &'static str, code: &'static str, message: &'static str) -> FieldError {
    FieldError { field, code, message }
}

fn currency_code(code: &str) -> bool {
    code.len() == 3 && code.bytes().all(|b| b.is_ascii_uppercase())
}

fn non_negative(value: Option<Decimal>) -> bool {
    value.is_none_or(|v| v >= Decimal::ZERO)
}

fn valid_discount(d: &Discount) -> bool {
    match d.kind {
        DiscountKind::None => true,
        DiscountKind::Percent => d.value >= Decimal::ZERO && d.value <= Decimal::ONE_HUNDRED,
        DiscountKind::Fixed => d.value >= Decimal::ZERO,
    }
}

impl PriceBook {
    /// Checks and tidies an edited price book.
    pub fn normalise(mut self) -> Result<Self, Vec<FieldError>> {
        let mut e = Vec::new();
        self.currency = self.currency.trim().to_ascii_uppercase();
        if !currency_code(&self.currency) {
            e.push(err(
                "currency",
                "format",
                "Use a three-letter currency code such as KES.",
            ));
        }
        for c in &mut self.supported_currencies {
            *c = c.trim().to_ascii_uppercase();
        }
        if !self.supported_currencies.contains(&self.currency) {
            self.supported_currencies.insert(0, self.currency.clone());
        }
        self.supported_currencies.dedup();
        if self.supported_currencies.iter().any(|c| !currency_code(c)) {
            e.push(err(
                "supported_currencies",
                "format",
                "Currencies are three-letter codes.",
            ));
        }
        for fx in &mut self.fx_rates {
            fx.currency = fx.currency.trim().to_ascii_uppercase();
            if !currency_code(&fx.currency) || fx.rate <= Decimal::ZERO {
                e.push(err(
                    "fx_rates",
                    "invalid",
                    "Exchange rates need a currency code and a rate above zero.",
                ));
            }
        }
        if self.decimals > 4 {
            e.push(err("decimals", "range", "Round to at most 4 decimals."));
        }
        if self
            .tax
            .rate
            .is_some_and(|r| r < Decimal::ZERO || r > Decimal::ONE_HUNDRED)
        {
            e.push(err("tax.rate", "range", "Tax is a percentage from 0 to 100."));
        }
        self.tax.name = self.tax.name.trim().to_owned();
        for key in CycleKey::ALL {
            if self.cycles.iter().filter(|c| c.key == key).count() != 1 {
                e.push(err("cycles", "missing", "Keep one entry for each billing cycle."));
                break;
            }
        }
        if !self.cycles.iter().any(|c| c.enabled) {
            e.push(err("cycles", "none", "Enable at least one billing cycle."));
        }
        if self.cycles.iter().any(|c| !valid_discount(&c.discount)) {
            e.push(err(
                "cycles",
                "discount",
                "Discounts are 0–100% or an amount of zero or more.",
            ));
        }
        if !non_negative(self.minimum_monthly_subscription) {
            e.push(err(
                "minimum_monthly_subscription",
                "range",
                "Use an amount of zero or more.",
            ));
        }
        if self.quote_validity_days == 0 || self.quote_validity_days > 365 {
            e.push(err(
                "quote_validity_days",
                "range",
                "Quotations are valid for 1 to 365 days.",
            ));
        }
        if self.items.len() > MAX_ITEMS {
            e.push(err("items", "too_many", "Up to 120 items."));
        }
        let mut ids = std::collections::HashSet::new();
        for item in &mut self.items {
            item.id = item.id.trim().to_owned();
            item.name = item.name.trim().to_owned();
            item.description = item.description.trim().to_owned();
            item.unit_label = item.unit_label.trim().to_owned();
            if item.id.is_empty()
                || item.id.len() > 60
                || !item
                    .id
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-')
                || !ids.insert(item.id.clone())
            {
                e.push(err(
                    "items",
                    "id",
                    "Every item needs a unique id of lowercase letters, numbers, - or _.",
                ));
            }
            if item.name.is_empty()
                || item.name.chars().count() > 80
                || item.description.chars().count() > 400
            {
                e.push(err(
                    "items",
                    "name",
                    "Items need a name (up to 80 characters); descriptions up to 400.",
                ));
            }
            if !non_negative(item.rate) || !non_negative(item.minimum_charge) {
                e.push(err(
                    "items",
                    "rate",
                    "Rates and minimum charges are zero or more.",
                ));
            }
            if item.method == Method::CustomQuote && item.rate.is_some() {
                item.rate = None;
            }
            let one_off = item.billing == Billing::OneOff;
            let recurring_category = matches!(item.category, Category::Core | Category::AddOn);
            if one_off && recurring_category {
                e.push(err(
                    "items",
                    "billing",
                    "Modules and add-ons are recurring; use implementation or custom for one-off charges.",
                ));
            }
            if item.tiers.len() > MAX_TIERS {
                e.push(err("items", "tiers", "Up to 10 quantity tiers."));
            }
            if !item.tiers.is_empty() {
                let ordered = item.tiers.windows(2).all(|w| {
                    matches!((w[0].up_to, w[1].up_to), (Some(a), Some(b)) if a < b)
                        || matches!((w[0].up_to, w[1].up_to), (Some(_), None))
                });
                let open_end = item.tiers.last().is_some_and(|t| t.up_to.is_none());
                if !ordered || !open_end || item.tiers.iter().any(|t| t.rate < Decimal::ZERO) {
                    e.push(err(
                        "items",
                        "tiers",
                        "Tiers go up in order, end with an open tier and have rates of zero or more.",
                    ));
                }
            }
            if item.min_qty.zip(item.max_qty).is_some_and(|(a, b)| a > b) {
                e.push(err(
                    "items",
                    "quantity",
                    "The minimum quantity can't exceed the maximum.",
                ));
            }
            if item
                .cycle_terms
                .iter()
                .any(|t| !non_negative(t.rate) || t.discount.as_ref().is_some_and(|d| !valid_discount(d)))
                || one_off && !item.cycle_terms.is_empty()
            {
                e.push(err(
                    "items",
                    "cycle_terms",
                    "Cycle terms apply to recurring items, with rates and discounts of zero or more.",
                ));
            }
            if item.availability == Availability::Planned {
                item.public = false;
            }
        }
        for plan in &mut self.plans {
            plan.name = plan.name.trim().to_owned();
            if plan.name.is_empty()
                || plan.item_ids.is_empty()
                || plan.item_ids.iter().any(|id| !ids.contains(id))
            {
                e.push(err(
                    "plans",
                    "invalid",
                    "Plans need a name and items from the list.",
                ));
            }
        }
        for model in &mut self.models {
            model.name = model.name.trim().to_owned();
            if model.name.is_empty() || model.item_ids.iter().any(|id| !ids.contains(id)) {
                e.push(err(
                    "models",
                    "invalid",
                    "Commercial models need a name and items from the list.",
                ));
            }
        }
        self.terms = self.terms.trim().to_owned();
        if self.terms.chars().count() > 4000 {
            e.push(err(
                "terms",
                "length",
                "Commercial terms are up to 4,000 characters.",
            ));
        }
        if e.is_empty() { Ok(self) } else { Err(e) }
    }

    pub fn cycle(&self, key: CycleKey) -> Option<&Cycle> {
        self.cycles.iter().find(|c| c.key == key)
    }

    pub fn item(&self, id: &str) -> Option<&Item> {
        self.items.iter().find(|i| i.id == id)
    }

    /// Items customers may see when public pricing is switched on.
    pub fn public_view(&self) -> Self {
        let items: Vec<Item> = self
            .items
            .iter()
            .filter(|i| {
                i.public
                    && i.active
                    && i.availability == Availability::Available
                    && i.method != Method::CustomQuote
            })
            .filter(|i| i.rate.is_some() || !i.tiers.is_empty())
            .cloned()
            .collect();
        let ids: Vec<&str> = items.iter().map(|i| i.id.as_str()).collect();
        Self {
            fx_rates: Vec::new(),
            fx_source: String::new(),
            plans: self
                .plans
                .iter()
                .filter(|p| p.public && p.active && p.item_ids.iter().all(|id| ids.contains(&id.as_str())))
                .cloned()
                .collect(),
            models: Vec::new(),
            terms: String::new(),
            items,
            ..self.clone()
        }
    }
}

// ------------------------------------------------------------------ calculation

/// What the calculator asks for.
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CalcInput {
    /// The shared employee / licence count.
    pub employees: u32,
    pub cycle: CycleKey,
    #[serde(default)]
    pub currency: Option<String>,
    pub lines: Vec<LineInput>,
    /// Bill only part of the first period (days left of the period).
    #[serde(default)]
    pub proration: Option<Proration>,
    #[serde(default)]
    pub model_id: Option<String>,
    /// The calculation date (effective dates); today when absent.
    #[serde(default)]
    pub on: Option<NaiveDate>,
}

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LineInput {
    pub item_id: String,
    /// This item's own quantity instead of the shared employee count.
    #[serde(default)]
    pub quantity: Option<u32>,
    /// One-off items: charged, included, optional (left out) or scoped.
    #[serde(default)]
    pub mode: Option<OneOffMode>,
}

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Proration {
    pub days_remaining: u32,
    pub days_in_period: u32,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Line {
    pub item_id: String,
    pub name: String,
    pub category: Category,
    pub method: Method,
    pub billing: Billing,
    pub quantity: u32,
    pub unit_label: String,
    /// Average rate per unit for the item's own frequency.
    pub unit_rate: Decimal,
    /// For the billing period (recurring) or once (one-off), before discount.
    pub gross: Decimal,
    pub discount: Decimal,
    pub net: Decimal,
    pub tax: Decimal,
    /// "charged", "included", "minimum" (minimum charge applied) or "cycle_rate".
    pub notes: Vec<&'static str>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Unpriced {
    pub item_id: String,
    pub name: String,
    /// "rate_not_set", "custom_quote", "scoped" or "planned".
    pub reason: &'static str,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Calculation {
    pub currency: String,
    /// Base-currency units per 1 unit of `currency` (1 for the base).
    pub fx_rate: Decimal,
    pub cycle: CycleKey,
    pub months: u32,
    pub employees: u32,
    pub recurring: Vec<Line>,
    pub one_off: Vec<Line>,
    pub unpriced: Vec<Unpriced>,
    /// Recurring, for one billing period.
    pub subscription_subtotal: Decimal,
    pub discount_total: Decimal,
    /// Topped up to the minimum subscription, when one applies.
    pub minimum_adjustment: Decimal,
    pub subscription_net: Decimal,
    pub subscription_tax: Decimal,
    pub one_off_total: Decimal,
    pub one_off_tax: Decimal,
    pub tax_total: Decimal,
    pub tax_rate: Option<Decimal>,
    pub tax_presentation: TaxPresentation,
    /// First invoice: the (prorated) first period plus one-off charges, with tax.
    pub due_first_period: Decimal,
    /// Each following period, with tax.
    pub renewal_amount: Decimal,
    /// Subscription after discount over 12 months, before tax.
    pub annualized_subscription: Decimal,
    pub proration_factor: Option<Decimal>,
    pub warnings: Vec<String>,
}

#[derive(Debug, PartialEq)]
pub enum CalcError {
    CycleUnavailable,
    UnknownItem(String),
    Currency,
}

impl CalcError {
    pub fn message(&self) -> String {
        match self {
            Self::CycleUnavailable => "That billing cycle isn't offered.".into(),
            Self::UnknownItem(id) => format!("Unknown item: {id}"),
            Self::Currency => "That currency isn't supported, or has no exchange rate.".into(),
        }
    }
}

/// Rounds half away from zero and always shows the currency's decimals ("62500.00").
fn round(value: Decimal, decimals: u32) -> Decimal {
    let mut rounded = value.round_dp_with_strategy(decimals, RoundingStrategy::MidpointAwayFromZero);
    rounded.rescale(decimals);
    rounded
}

/// The amount for `qty` units at the item's rate or tiers, for its own frequency.
fn amount_for(item: &Item, qty: u32) -> Option<Decimal> {
    if item.tiers.is_empty() {
        return item.rate.map(|r| {
            if item.method == Method::Flat {
                r
            } else {
                r * Decimal::from(qty)
            }
        });
    }
    let q = Decimal::from(qty);
    match item.tier_mode {
        TierMode::Volume => {
            let tier = item.tiers.iter().find(|t| t.up_to.is_none_or(|up| qty <= up))?;
            Some(if item.method == Method::Flat {
                tier.rate
            } else {
                tier.rate * q
            })
        }
        TierMode::Graduated => {
            let mut total = Decimal::ZERO;
            let mut lower = 0u32;
            for tier in &item.tiers {
                let upper = tier.up_to.unwrap_or(u32::MAX).min(qty);
                if upper > lower {
                    total += tier.rate * Decimal::from(upper - lower);
                }
                if tier.up_to.is_none_or(|up| up >= qty) {
                    break;
                }
                lower = tier.up_to.unwrap_or(lower);
            }
            Some(total)
        }
    }
}

fn apply_discount(gross: Decimal, d: &Discount) -> Decimal {
    match d.kind {
        DiscountKind::None => Decimal::ZERO,
        DiscountKind::Percent => gross * d.value / Decimal::ONE_HUNDRED,
        DiscountKind::Fixed => d.value.min(gross),
    }
}

/// Calculates a quotation from a price book; the only place prices are computed.
pub fn calculate(book: &PriceBook, input: &CalcInput, today: NaiveDate) -> Result<Calculation, CalcError> {
    let cycle = book
        .cycle(input.cycle)
        .filter(|c| c.enabled)
        .ok_or(CalcError::CycleUnavailable)?;
    let months = input.cycle.months();
    let m = Decimal::from(months);
    let dp = book.decimals;
    let on = input.on.unwrap_or(today);
    let currency = input.currency.clone().unwrap_or_else(|| book.currency.clone());
    // Prices are kept in the base currency; another supported currency is
    // converted at its manual rate (base units per 1 unit of that currency).
    let fx_rate = if currency == book.currency {
        Decimal::ONE
    } else {
        if !book.supported_currencies.contains(&currency) {
            return Err(CalcError::Currency);
        }
        book.fx_rates
            .iter()
            .find(|f| f.currency == currency)
            .map(|f| f.rate)
            .ok_or(CalcError::Currency)?
    };
    let convert = |base: Decimal| base / fx_rate;
    let tax_rate = book.tax.rate;
    let inclusive = book.tax.presentation == TaxPresentation::Inclusive;
    let tax_of = |net: Decimal, taxable: bool| -> Decimal {
        match (tax_rate, taxable) {
            (Some(r), true) if inclusive => round(net * r / (Decimal::ONE_HUNDRED + r), dp),
            (Some(r), true) => round(net * r / Decimal::ONE_HUNDRED, dp),
            _ => round(Decimal::ZERO, dp),
        }
    };
    let proration_factor = input.proration.and_then(|p| {
        (p.days_in_period > 0 && p.days_remaining <= p.days_in_period)
            .then(|| Decimal::from(p.days_remaining) / Decimal::from(p.days_in_period))
    });

    let mut recurring = Vec::new();
    let mut one_off = Vec::new();
    let mut unpriced = Vec::new();
    let mut warnings = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for line in &input.lines {
        if !seen.insert(line.item_id.as_str()) {
            continue;
        }
        let item = book
            .item(&line.item_id)
            .filter(|i| i.active)
            .ok_or_else(|| CalcError::UnknownItem(line.item_id.clone()))?;
        let mark = |reason| Unpriced {
            item_id: item.id.clone(),
            name: item.name.clone(),
            reason,
        };
        if item.availability == Availability::Planned {
            unpriced.push(mark("planned"));
            continue;
        }
        if item.effective_from.is_some_and(|from| from > on) {
            warnings.push(format!(
                "{} is priced from {}.",
                item.name,
                item.effective_from.unwrap()
            ));
        }
        let qty = line.quantity.unwrap_or(if item.method.uses_headcount() {
            input.employees
        } else {
            1
        });
        if let Some(min) = item.min_qty.filter(|min| qty < *min) {
            warnings.push(format!(
                "{}: the minimum is {min} {}.",
                item.name, item.unit_label
            ));
        }
        if let Some(max) = item.max_qty.filter(|max| qty > *max) {
            warnings.push(format!(
                "{}: above {max} {}, contact sales for terms.",
                item.name, item.unit_label
            ));
        }
        let mode = line.mode.unwrap_or(item.one_off_mode);
        if item.method == Method::CustomQuote {
            unpriced.push(mark("custom_quote"));
            continue;
        }
        if item.billing == Billing::OneOff && mode == OneOffMode::Scoped {
            unpriced.push(mark("scoped"));
            continue;
        }
        if item.billing == Billing::OneOff && mode == OneOffMode::Optional {
            continue;
        }
        let terms = item.cycle_terms.iter().find(|t| t.cycle == input.cycle);
        let cycle_rate = terms.and_then(|t| t.rate);
        let base_amount = match cycle_rate {
            Some(rate) if item.method == Method::Flat => Some(rate),
            Some(rate) => Some(rate * Decimal::from(qty)),
            None => amount_for(item, qty),
        };
        let Some(mut amount) = base_amount else {
            unpriced.push(mark("rate_not_set"));
            continue;
        };
        let mut notes = Vec::new();
        if let Some(min) = item.minimum_charge.filter(|min| *min > amount) {
            amount = min;
            notes.push("minimum");
        }
        let unit_rate = if qty > 0 && item.method != Method::Flat {
            amount / Decimal::from(qty)
        } else {
            amount
        };
        if item.billing == Billing::OneOff {
            let included = mode == OneOffMode::Included;
            let gross = if included {
                Decimal::ZERO
            } else {
                round(convert(amount), dp)
            };
            notes.push(if included { "included" } else { "charged" });
            one_off.push(Line {
                item_id: item.id.clone(),
                name: item.name.clone(),
                category: item.category,
                method: item.method,
                billing: item.billing,
                quantity: qty,
                unit_label: item.unit_label.clone(),
                unit_rate: round(convert(unit_rate), dp),
                gross,
                discount: round(Decimal::ZERO, dp),
                net: gross,
                tax: tax_of(gross, item.taxable),
                notes,
            });
            continue;
        }
        // Recurring: the item's amount for one billing period.
        let per_period = match item.billing {
            Billing::Monthly => amount * m,
            Billing::Annual => amount * m / Decimal::from(12),
            Billing::OneOff => unreachable!(),
        };
        let gross = round(convert(per_period), dp);
        let discount = round(
            if cycle_rate.is_some() {
                notes.push("cycle_rate");
                Decimal::ZERO
            } else if item.discountable {
                let d = terms.and_then(|t| t.discount.as_ref());
                // A fixed cycle-level discount comes off the subscription once (below).
                match d {
                    Some(d) => round(apply_discount(gross, &converted(d, &convert)), dp),
                    None if cycle.discount.kind == DiscountKind::Percent => {
                        round(apply_discount(gross, &cycle.discount), dp)
                    }
                    None => Decimal::ZERO,
                }
            } else {
                Decimal::ZERO
            },
            dp,
        );
        let net = gross - discount;
        recurring.push(Line {
            item_id: item.id.clone(),
            name: item.name.clone(),
            category: item.category,
            method: item.method,
            billing: item.billing,
            quantity: qty,
            unit_label: item.unit_label.clone(),
            unit_rate: round(convert(unit_rate), dp),
            gross,
            discount,
            net,
            tax: Decimal::ZERO,
            notes,
        });
    }

    let subscription_subtotal: Decimal = recurring.iter().map(|l| l.gross).sum();
    let line_discounts: Decimal = recurring.iter().map(|l| l.discount).sum();
    // A fixed cycle discount, once, on what remains of discountable items.
    let mut cycle_fixed = Decimal::ZERO;
    if cycle.discount.kind == DiscountKind::Fixed {
        let discountable: Decimal = recurring
            .iter()
            .filter(|l| {
                book.item(&l.item_id).is_some_and(|i| i.discountable)
                    && !l.notes.contains(&"cycle_rate")
                    && l.discount.is_zero()
            })
            .map(|l| l.net)
            .sum();
        cycle_fixed = round(convert(cycle.discount.value).min(discountable), dp);
        // Spread over those lines in proportion, the remainder on the last, so lines still add up.
        if !cycle_fixed.is_zero() && !discountable.is_zero() {
            let mut left = cycle_fixed;
            let eligible: Vec<usize> = recurring
                .iter()
                .enumerate()
                .filter(|(_, l)| {
                    book.item(&l.item_id).is_some_and(|i| i.discountable)
                        && !l.notes.contains(&"cycle_rate")
                        && l.discount.is_zero()
                })
                .map(|(i, _)| i)
                .collect();
            for (n, &i) in eligible.iter().enumerate() {
                let share = if n + 1 == eligible.len() {
                    left
                } else {
                    round(cycle_fixed * recurring[i].net / discountable, dp)
                };
                recurring[i].discount += share;
                recurring[i].net -= share;
                left -= share;
            }
        }
    }
    let discount_total = line_discounts + cycle_fixed;
    let mut subscription_net = subscription_subtotal - discount_total;
    let mut minimum_adjustment = Decimal::ZERO;
    if let Some(min) = book.minimum_monthly_subscription
        && !recurring.is_empty()
    {
        let floor = round(convert(min) * m, dp);
        if subscription_net < floor {
            minimum_adjustment = floor - subscription_net;
            subscription_net = floor;
            warnings.push("The minimum subscription applies.".into());
        }
    }
    for line in &mut recurring {
        line.tax = tax_of(line.net, book.item(&line.item_id).is_some_and(|i| i.taxable));
    }
    // The minimum top-up is taxed like the (taxable) subscription.
    let adjustment_tax = tax_of(minimum_adjustment, true);
    let subscription_tax: Decimal = recurring.iter().map(|l| l.tax).sum::<Decimal>() + adjustment_tax;
    let one_off_total: Decimal = one_off.iter().map(|l| l.net).sum();
    let one_off_tax: Decimal = one_off.iter().map(|l| l.tax).sum();
    let tax_total = subscription_tax + one_off_tax;
    let add_tax = |net: Decimal, tax: Decimal| if inclusive { net } else { net + tax };
    let renewal_amount = add_tax(subscription_net, subscription_tax);
    let first_subscription = match proration_factor {
        Some(f) => round(renewal_amount * f, dp),
        None => renewal_amount,
    };
    let due_first_period = first_subscription + add_tax(one_off_total, one_off_tax);
    let annualized_subscription = round(subscription_net * Decimal::from(12) / m, dp);
    if !unpriced.is_empty() {
        warnings.push("Some items have no price yet and are left out of the totals.".into());
    }

    let z = |d: Decimal| round(d, dp);
    Ok(Calculation {
        currency,
        fx_rate,
        cycle: input.cycle,
        months,
        employees: input.employees,
        recurring,
        one_off,
        unpriced,
        subscription_subtotal: z(subscription_subtotal),
        discount_total: z(discount_total),
        minimum_adjustment: z(minimum_adjustment),
        subscription_net: z(subscription_net),
        subscription_tax: z(subscription_tax),
        one_off_total: z(one_off_total),
        one_off_tax: z(one_off_tax),
        tax_total: z(tax_total),
        tax_rate,
        tax_presentation: book.tax.presentation,
        due_first_period: z(due_first_period),
        renewal_amount: z(renewal_amount),
        annualized_subscription,
        proration_factor: proration_factor.map(|f| round(f, 4)),
        warnings,
    })
}

fn converted(d: &Discount, convert: &impl Fn(Decimal) -> Decimal) -> Discount {
    match d.kind {
        DiscountKind::Fixed => Discount {
            kind: d.kind,
            value: convert(d.value),
        },
        _ => d.clone(),
    }
}

// ------------------------------------------------------------------ the starting book

fn module(
    id: &str,
    name: &str,
    description: &str,
    method: Method,
    unit: &str,
    availability: Availability,
) -> Item {
    Item {
        id: id.into(),
        name: name.into(),
        description: description.into(),
        category: Category::Core,
        group: None,
        method,
        unit_label: unit.into(),
        billing: Billing::Monthly,
        rate: None,
        minimum_charge: None,
        tiers: Vec::new(),
        tier_mode: TierMode::Volume,
        cycle_terms: Vec::new(),
        min_qty: None,
        max_qty: None,
        taxable: true,
        discountable: true,
        one_off_mode: OneOffMode::Charged,
        effective_from: None,
        availability,
        active: true,
        public: false,
    }
}

fn one_off(id: &str, name: &str, group: &str, category: Category, method: Method, unit: &str) -> Item {
    Item {
        category,
        group: Some(group.into()),
        billing: Billing::OneOff,
        discountable: false,
        ..module(id, name, "", method, unit, Availability::Available)
    }
}

/// The catalogue a new product price book starts with: ZiraHR's confirmed
/// modules (available) and the brief's other modules (planned), every rate
/// unset. Nothing is priced until someone enters and approves a rate.
pub fn zirahr_starting_book() -> PriceBook {
    use Availability::{Available, Planned};
    use Method::*;
    let mut items = vec![
        module(
            "core_hr",
            "Core HR (Employee 360)",
            "Employee records from onboarding to exit.",
            PerEmployee,
            "employees",
            Available,
        ),
        module(
            "payroll",
            "Payroll & compliance",
            "Effective-dated payroll and statutory deductions.",
            PerPayrollEmployee,
            "payroll employees",
            Available,
        ),
        module(
            "leave",
            "Leave management",
            "Requests, balances and approvals.",
            PerEmployee,
            "employees",
            Available,
        ),
        module(
            "attendance",
            "Time & attendance",
            "Shifts, geofencing and clock-ins.",
            PerEmployee,
            "employees",
            Available,
        ),
        module(
            "performance",
            "Performance management",
            "Goals, reviews and progress.",
            PerEmployee,
            "employees",
            Available,
        ),
        module(
            "ess",
            "Employee self-service",
            "Payslips, requests and records for every employee.",
            PerEmployee,
            "employees",
            Available,
        ),
        module(
            "analytics",
            "Reporting & analytics",
            "Reports and executive workforce insight.",
            Flat,
            "organisation",
            Available,
        ),
        module(
            "recruitment",
            "Recruitment / ATS",
            "Not in the confirmed ZiraHR scope yet.",
            Flat,
            "organisation",
            Planned,
        ),
        module(
            "mobile_app",
            "Mobile app",
            "Not in the confirmed ZiraHR scope yet.",
            PerUser,
            "users",
            Planned,
        ),
        module(
            "salary_advances",
            "Salary advances",
            "Not in the confirmed ZiraHR scope yet.",
            PerEmployee,
            "employees",
            Planned,
        ),
        module(
            "salary_payments",
            "Digital salary payments",
            "Not in the confirmed ZiraHR scope yet.",
            PerUsageUnit,
            "payments",
            Planned,
        ),
        module(
            "ai_assistant",
            "AI assistant",
            "Not in the confirmed ZiraHR scope yet.",
            Flat,
            "organisation",
            Planned,
        ),
    ];
    for id in ["recruitment", "ai_assistant"] {
        if let Some(item) = items.iter_mut().find(|i| i.id == id) {
            item.category = Category::AddOn;
        }
    }
    use Category::{Implementation, Integration, Support};
    items.extend([
        one_off(
            "setup_configuration",
            "Initial system configuration",
            "setup",
            Implementation,
            Flat,
            "project",
        ),
        one_off(
            "setup_organisation",
            "Organisation and branch setup",
            "setup",
            Implementation,
            PerEntity,
            "entities",
        ),
        one_off(
            "setup_roles",
            "User roles and permissions",
            "setup",
            Implementation,
            Flat,
            "project",
        ),
        one_off(
            "setup_payroll",
            "Payroll and statutory configuration",
            "setup",
            Implementation,
            PerCountry,
            "countries",
        ),
        one_off(
            "setup_workflows",
            "Workflow configuration",
            "setup",
            Implementation,
            Flat,
            "project",
        ),
        one_off(
            "migration_employees",
            "Employee records migration",
            "migration",
            Implementation,
            PerEmployee,
            "employees",
        ),
        one_off(
            "migration_payroll",
            "Historical payroll migration",
            "migration",
            Implementation,
            Flat,
            "project",
        ),
        one_off(
            "migration_leave",
            "Leave balances migration",
            "migration",
            Implementation,
            Flat,
            "project",
        ),
        one_off(
            "migration_loans",
            "Loans and deductions migration",
            "migration",
            Implementation,
            Flat,
            "project",
        ),
        one_off(
            "migration_documents",
            "Documents and historical records",
            "migration",
            Implementation,
            Flat,
            "project",
        ),
        one_off(
            "training_virtual",
            "Virtual training",
            "training",
            Implementation,
            PerSession,
            "sessions",
        ),
        one_off(
            "training_onsite",
            "On-site training",
            "training",
            Implementation,
            PerDay,
            "days",
        ),
        one_off(
            "training_admin",
            "Administrator training",
            "training",
            Implementation,
            PerParticipant,
            "participants",
        ),
        one_off(
            "training_employee",
            "Employee training",
            "training",
            Implementation,
            PerParticipant,
            "participants",
        ),
        one_off(
            "training_materials",
            "Training materials",
            "training",
            Implementation,
            Flat,
            "set",
        ),
        one_off(
            "training_extra",
            "Additional training sessions",
            "training",
            Implementation,
            PerSession,
            "sessions",
        ),
        one_off(
            "integration_banking",
            "Banking and payment integration",
            "integrations",
            Integration,
            Flat,
            "integration",
        ),
        one_off(
            "integration_biometric",
            "Biometric devices",
            "integrations",
            Integration,
            PerUsageUnit,
            "devices",
        ),
        one_off(
            "integration_accounting",
            "Accounting system integration",
            "integrations",
            Integration,
            Flat,
            "integration",
        ),
        one_off(
            "integration_api",
            "External APIs",
            "integrations",
            Integration,
            Flat,
            "integration",
        ),
        one_off(
            "integration_custom",
            "Custom integrations",
            "integrations",
            Integration,
            CustomQuote,
            "scope",
        ),
        one_off(
            "deploy_uat",
            "Testing and UAT",
            "deployment",
            Implementation,
            Flat,
            "project",
        ),
        one_off(
            "deploy_golive",
            "Go-live support",
            "deployment",
            Support,
            PerDay,
            "days",
        ),
        one_off(
            "deploy_hypercare",
            "Hypercare",
            "deployment",
            Support,
            PerDay,
            "days",
        ),
        one_off(
            "deploy_support",
            "Additional technical support",
            "deployment",
            Support,
            PerDay,
            "days",
        ),
        one_off(
            "deploy_custom",
            "Customisation and development",
            "deployment",
            Implementation,
            CustomQuote,
            "scope",
        ),
    ]);
    items.push(Item {
        category: Category::Support,
        billing: Billing::Annual,
        discountable: false,
        ..module(
            "support_annual",
            "Annual support & maintenance",
            "For implementation + support agreements.",
            Flat,
            "year",
            Available,
        )
    });
    for (id, name) in [
        ("country_localisation", "Country localisation & compliance"),
        ("country_payroll_rules", "Country payroll & tax rules"),
    ] {
        items.push(Item {
            category: Category::Custom,
            billing: Billing::Annual,
            ..module(
                id,
                name,
                "Enterprise and multi-country agreements.",
                PerCountry,
                "countries",
                Available,
            )
        });
    }
    items.push(Item {
        category: Category::Custom,
        ..module(
            "regional_hosting",
            "Regional hosting & infrastructure",
            "Enterprise and multi-country agreements.",
            Flat,
            "month",
            Available,
        )
    });
    let ids = |list: &[&str]| list.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
    PriceBook {
        currency: "KES".into(),
        supported_currencies: vec!["KES".into()],
        fx_source: "Manual rates entered by FigBud".into(),
        fx_rates: Vec::new(),
        tax: Tax::default(),
        decimals: 2,
        cycles: CycleKey::ALL
            .iter()
            .map(|&key| Cycle {
                key,
                enabled: true,
                discount: Discount::default(),
            })
            .collect(),
        items,
        plans: Vec::new(),
        models: vec![
            Model {
                id: "implementation_support".into(),
                kind: ModelKind::ImplementationSupport,
                name: "Implementation + support".into(),
                description: "A one-off implementation fee with optional annual support and maintenance.".into(),
                item_ids: ids(&["setup_configuration", "setup_payroll", "migration_employees", "training_admin", "deploy_uat", "support_annual"]),
                default_cycle: CycleKey::Annual,
                enabled: true,
            },
            Model {
                id: "subscription".into(),
                kind: ModelKind::Subscription,
                name: "Subscription".into(),
                description: "Monthly or multi-period subscriptions, with optional implementation.".into(),
                item_ids: ids(&["core_hr", "payroll", "leave", "ess"]),
                default_cycle: CycleKey::Monthly,
                enabled: true,
            },
            Model {
                id: "enterprise".into(),
                kind: ModelKind::Enterprise,
                name: "Enterprise & multi-country".into(),
                description: "Priced by countries, entities, volumes, localisation, integrations, infrastructure and support.".into(),
                item_ids: ids(&["core_hr", "payroll", "country_localisation", "country_payroll_rules", "regional_hosting", "setup_organisation"]),
                default_cycle: CycleKey::Annual,
                enabled: true,
            },
        ],
        minimum_monthly_subscription: None,
        quote_validity_days: 30,
        terms: String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::dec;

    fn day() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, 1).unwrap()
    }

    /// A small book: two per-employee modules, a flat add-on, setup, VAT 16%.
    fn book() -> PriceBook {
        let mut b = zirahr_starting_book();
        let set = |b: &mut PriceBook, id: &str, rate: Decimal| {
            b.items.iter_mut().find(|i| i.id == id).unwrap().rate = Some(rate)
        };
        set(&mut b, "core_hr", dec!(100));
        set(&mut b, "payroll", dec!(150));
        set(&mut b, "analytics", dec!(5000));
        set(&mut b, "setup_configuration", dec!(80000));
        set(&mut b, "training_admin", dec!(2500));
        b.tax.rate = Some(dec!(16));
        b.normalise().unwrap()
    }

    fn input(cycle: CycleKey, items: &[&str]) -> CalcInput {
        CalcInput {
            employees: 250,
            cycle,
            currency: None,
            lines: items
                .iter()
                .map(|id| LineInput {
                    item_id: (*id).into(),
                    quantity: None,
                    mode: None,
                })
                .collect(),
            proration: None,
            model_id: None,
            on: None,
        }
    }

    #[test]
    fn starting_book_is_valid_kes_and_entirely_unpriced() {
        let b = zirahr_starting_book().normalise().unwrap();
        assert_eq!(b.currency, "KES");
        assert!(b.items.iter().all(|i| i.rate.is_none() && !i.public));
        assert!(b.cycles.iter().all(|c| c.discount.kind == DiscountKind::None));
        assert!(b.tax.rate.is_none(), "no tax is assumed");
        let planned: Vec<_> = b
            .items
            .iter()
            .filter(|i| i.availability == Availability::Planned)
            .map(|i| i.id.as_str())
            .collect();
        assert!(planned.contains(&"ai_assistant") && planned.contains(&"recruitment"));
        let calc = calculate(&b, &input(CycleKey::Monthly, &["core_hr", "ai_assistant"]), day()).unwrap();
        assert_eq!(calc.subscription_net, Decimal::ZERO);
        let reasons: Vec<_> = calc.unpriced.iter().map(|u| u.reason).collect();
        assert_eq!(reasons, ["rate_not_set", "planned"]);
    }

    #[test]
    fn per_employee_and_flat_modules_across_billing_cycles_without_discounts() {
        let b = book();
        // 250 × 100 + 250 × 150 + 5,000 = 67,500 per month.
        let monthly = calculate(
            &b,
            &input(CycleKey::Monthly, &["core_hr", "payroll", "analytics"]),
            day(),
        )
        .unwrap();
        assert_eq!(monthly.subscription_subtotal, dec!(67500.00));
        assert_eq!(monthly.discount_total, Decimal::ZERO);
        assert_eq!(monthly.subscription_tax, dec!(10800.00));
        assert_eq!(monthly.renewal_amount, dec!(78300.00));
        assert_eq!(monthly.annualized_subscription, dec!(810000.00));
        for (cycle, months) in [
            (CycleKey::Quarterly, 3),
            (CycleKey::SemiAnnual, 6),
            (CycleKey::Annual, 12),
        ] {
            let c = calculate(&b, &input(cycle, &["core_hr", "payroll", "analytics"]), day()).unwrap();
            assert_eq!(c.subscription_subtotal, dec!(67500) * Decimal::from(months));
            assert_eq!(
                c.annualized_subscription,
                dec!(810000.00),
                "same yearly price whatever the cycle"
            );
        }
    }

    #[test]
    fn cycle_discounts_apply_only_when_configured_and_never_twice() {
        let mut b = book();
        b.cycles
            .iter_mut()
            .find(|c| c.key == CycleKey::Annual)
            .unwrap()
            .discount = Discount {
            kind: DiscountKind::Percent,
            value: dec!(10),
        };
        // Payroll has its own annual rate: it replaces the 10% discount.
        b.items
            .iter_mut()
            .find(|i| i.id == "payroll")
            .unwrap()
            .cycle_terms = vec![CycleTerms {
            cycle: CycleKey::Annual,
            rate: Some(dec!(140)),
            discount: None,
        }];
        let c = calculate(&b, &input(CycleKey::Annual, &["core_hr", "payroll"]), day()).unwrap();
        let core = &c.recurring[0];
        assert_eq!((core.gross, core.discount), (dec!(300000.00), dec!(30000.00)));
        let payroll = &c.recurring[1];
        assert_eq!(
            (payroll.gross, payroll.discount),
            (dec!(420000.00), Decimal::ZERO)
        );
        assert!(payroll.notes.contains(&"cycle_rate"));
        assert_eq!(c.subscription_net, dec!(690000.00));
        // Monthly has no discount configured: none applies.
        let m = calculate(&b, &input(CycleKey::Monthly, &["core_hr"]), day()).unwrap();
        assert_eq!(m.discount_total, Decimal::ZERO);
    }

    #[test]
    fn a_fixed_cycle_discount_comes_off_once_and_lines_still_add_up() {
        let mut b = book();
        b.cycles
            .iter_mut()
            .find(|c| c.key == CycleKey::Quarterly)
            .unwrap()
            .discount = Discount {
            kind: DiscountKind::Fixed,
            value: dec!(10000),
        };
        let c = calculate(
            &b,
            &input(CycleKey::Quarterly, &["core_hr", "payroll", "analytics"]),
            day(),
        )
        .unwrap();
        assert_eq!(c.discount_total, dec!(10000.00));
        let lines: Decimal = c.recurring.iter().map(|l| l.net).sum();
        assert_eq!(lines, c.subscription_net);
        assert_eq!(c.subscription_net, dec!(202500) - dec!(10000));
    }

    #[test]
    fn quantity_tiers_volume_and_graduated_with_minimum_charges() {
        let mut b = book();
        let core = b.items.iter_mut().find(|i| i.id == "core_hr").unwrap();
        core.tiers = vec![
            Tier {
                up_to: Some(100),
                rate: dec!(120),
            },
            Tier {
                up_to: Some(500),
                rate: dec!(100),
            },
            Tier {
                up_to: None,
                rate: dec!(80),
            },
        ];
        core.tier_mode = TierMode::Volume;
        let c = calculate(&b, &input(CycleKey::Monthly, &["core_hr"]), day()).unwrap();
        assert_eq!(c.recurring[0].gross, dec!(25000.00), "250 at the 101–500 rate");
        b.items.iter_mut().find(|i| i.id == "core_hr").unwrap().tier_mode = TierMode::Graduated;
        let c = calculate(&b, &input(CycleKey::Monthly, &["core_hr"]), day()).unwrap();
        assert_eq!(c.recurring[0].gross, dec!(27000.00), "100 × 120 + 150 × 100");
        // A minimum charge lifts a small account.
        let mut small = input(CycleKey::Monthly, &["payroll"]);
        small.employees = 10;
        b.items
            .iter_mut()
            .find(|i| i.id == "payroll")
            .unwrap()
            .minimum_charge = Some(dec!(5000));
        let c = calculate(&b, &small, day()).unwrap();
        assert_eq!(c.recurring[0].gross, dec!(5000.00));
        assert!(c.recurring[0].notes.contains(&"minimum"));
    }

    #[test]
    fn one_off_charges_stay_separate_from_the_recurring_subscription() {
        let b = book();
        let mut i = input(
            CycleKey::Monthly,
            &[
                "core_hr",
                "setup_configuration",
                "training_admin",
                "integration_custom",
            ],
        );
        i.lines[2].quantity = Some(4);
        let c = calculate(&b, &i, day()).unwrap();
        assert_eq!(c.one_off_total, dec!(90000.00));
        assert_eq!(
            c.renewal_amount,
            dec!(29000.00),
            "renewals never include one-off charges"
        );
        assert_eq!(c.due_first_period, dec!(29000.00) + dec!(104400.00));
        assert_eq!(c.unpriced[0].reason, "custom_quote");
        // Included and optional one-offs.
        i.lines[1].mode = Some(OneOffMode::Included);
        i.lines[2].mode = Some(OneOffMode::Optional);
        let c = calculate(&b, &i, day()).unwrap();
        assert_eq!(c.one_off_total, Decimal::ZERO);
        assert_eq!(c.one_off.len(), 1);
        assert!(c.one_off[0].notes.contains(&"included"));
    }

    #[test]
    fn tax_inclusive_presentation_rounding_and_minimum_subscription() {
        let mut b = book();
        b.tax.presentation = TaxPresentation::Inclusive;
        let c = calculate(&b, &input(CycleKey::Monthly, &["analytics"]), day()).unwrap();
        // 5,000 includes 16% VAT: 5,000 × 16 / 116 = 689.655… → 689.66.
        assert_eq!(c.subscription_tax, dec!(689.66));
        assert_eq!(c.renewal_amount, dec!(5000.00));
        b.tax.presentation = TaxPresentation::Exclusive;
        b.minimum_monthly_subscription = Some(dec!(40000));
        let c = calculate(&b, &input(CycleKey::Quarterly, &["analytics"]), day()).unwrap();
        assert_eq!(c.minimum_adjustment, dec!(105000.00));
        assert_eq!(c.subscription_net, dec!(120000.00));
        assert_eq!(c.renewal_amount, dec!(139200.00));
    }

    #[test]
    fn proration_currency_conversion_and_effective_dates() {
        let mut b = book();
        let mut i = input(CycleKey::Monthly, &["core_hr"]);
        i.proration = Some(Proration {
            days_remaining: 15,
            days_in_period: 30,
        });
        let c = calculate(&b, &i, day()).unwrap();
        assert_eq!(c.due_first_period, dec!(14500.00));
        assert_eq!(c.renewal_amount, dec!(29000.00));
        // USD at a manual rate of 129.50 KES; unsupported currencies are refused.
        b.supported_currencies.push("USD".into());
        b.fx_rates.push(FxRate {
            currency: "USD".into(),
            rate: dec!(129.50),
            as_of: None,
        });
        let mut usd = input(CycleKey::Monthly, &["core_hr"]);
        usd.currency = Some("USD".into());
        let c = calculate(&b, &usd, day()).unwrap();
        assert_eq!(c.recurring[0].gross, dec!(193.05));
        usd.currency = Some("EUR".into());
        assert_eq!(calculate(&b, &usd, day()).unwrap_err(), CalcError::Currency);
        b.items
            .iter_mut()
            .find(|i| i.id == "core_hr")
            .unwrap()
            .effective_from = NaiveDate::from_ymd_opt(2027, 1, 1);
        let c = calculate(&b, &input(CycleKey::Monthly, &["core_hr"]), day()).unwrap();
        assert!(c.warnings[0].contains("priced from 2027-01-01"));
    }

    #[test]
    fn invalid_books_are_refused() {
        let mut b = book();
        b.items[0].id = "Core HR".into();
        b.cycles[0].discount = Discount {
            kind: DiscountKind::Percent,
            value: dec!(120),
        };
        b.items[1].tiers = vec![Tier {
            up_to: Some(10),
            rate: dec!(1),
        }];
        b.currency = "kes".into();
        let fields: Vec<_> = b
            .normalise()
            .unwrap_err()
            .iter()
            .map(|e| (e.field, e.code))
            .collect();
        assert!(fields.contains(&("items", "id")));
        assert!(fields.contains(&("cycles", "discount")));
        assert!(fields.contains(&("items", "tiers")));
        assert!(
            !fields.iter().any(|f| f.0 == "currency"),
            "lower-case codes are tidied"
        );
    }

    #[test]
    fn the_public_view_holds_only_public_available_priced_items() {
        let mut b = book();
        for id in ["core_hr", "payroll", "ai_assistant"] {
            b.items.iter_mut().find(|i| i.id == id).unwrap().public = true;
        }
        b.terms = "Internal terms".into();
        let b = b.normalise().unwrap();
        let view = b.public_view();
        let ids: Vec<_> = view.items.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(ids, ["core_hr", "payroll"], "planned items are never public");
        assert!(view.terms.is_empty() && view.fx_rates.is_empty());
    }
}
