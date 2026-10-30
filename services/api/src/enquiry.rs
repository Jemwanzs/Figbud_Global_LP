//! Enquiry domain model: parsing, normalisation and server-side validation of
//! public form submissions. Validation never trusts the browser.

use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::error::FieldError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EnquiryKind {
    DemoRequest,
    Contact,
    EarlyAccess,
    Waitlist,
    Partnership,
    Sales,
}

impl EnquiryKind {
    pub fn parse(raw: &str) -> Option<Self> {
        Some(match raw {
            "demo_request" => Self::DemoRequest,
            "contact" => Self::Contact,
            "early_access" => Self::EarlyAccess,
            "waitlist" => Self::Waitlist,
            "partnership" => Self::Partnership,
            "sales" => Self::Sales,
            _ => return None,
        })
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::DemoRequest => "demo_request",
            Self::Contact => "contact",
            Self::EarlyAccess => "early_access",
            Self::Waitlist => "waitlist",
            Self::Partnership => "partnership",
            Self::Sales => "sales",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::DemoRequest => "Demo request",
            Self::Contact => "Contact enquiry",
            Self::EarlyAccess => "Early-access request",
            Self::Waitlist => "Waitlist registration",
            Self::Partnership => "Partnership enquiry",
            Self::Sales => "Sales enquiry",
        }
    }

    fn requires_company(self) -> bool {
        matches!(self, Self::DemoRequest | Self::Partnership | Self::Sales)
    }

    fn requires_message(self) -> bool {
        matches!(self, Self::Contact | Self::Partnership | Self::Sales)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Product {
    Figbud,
    Zirahr,
    Jasiri,
    ExpenseNow,
    Ziwa,
}

impl Product {
    pub fn parse(raw: &str) -> Option<Self> {
        Some(match raw {
            "figbud" => Self::Figbud,
            "zirahr" => Self::Zirahr,
            "jasiri" => Self::Jasiri,
            "expense_now" => Self::ExpenseNow,
            "ziwa" => Self::Ziwa,
            _ => return None,
        })
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Figbud => "figbud",
            Self::Zirahr => "zirahr",
            Self::Jasiri => "jasiri",
            Self::ExpenseNow => "expense_now",
            Self::Ziwa => "ziwa",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Figbud => "FigBud Global",
            Self::Zirahr => "ZiraHR",
            Self::Jasiri => "Jasiri LMS",
            Self::ExpenseNow => "Expense Now",
            Self::Ziwa => "Ziwa LMS",
        }
    }
}

pub const SUPPORTED_LOCALES: [&str; 5] = ["en", "sw", "fr", "ar", "zh"];
const COMPANY_SIZES: [&str; 6] = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

/// Raw submission as posted by a browser. Every field is optional at the
/// deserialisation layer so that missing values surface as field errors
/// rather than opaque JSON rejections.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct EnquiryInput {
    pub kind: String,
    pub product: String,
    pub name: String,
    pub email: String,
    pub company: Option<String>,
    pub job_title: Option<String>,
    pub phone: Option<String>,
    pub country: Option<String>,
    pub company_size: Option<String>,
    pub message: Option<String>,
    pub locale: Option<String>,
    pub source_path: Option<String>,
    pub consent: bool,
    /// Honeypot. Hidden from people, attractive to bots. Must stay empty.
    pub website: Option<String>,
    /// Milliseconds between the form rendering and its submission.
    pub elapsed_ms: Option<u64>,
    /// The campaign that brought the visitor (attribution), if any.
    pub campaign: Option<String>,
    /// ISO 3166-1 alpha-2 country of `phone` when it isn't written in
    /// international form (`+…`).
    pub phone_country: Option<String>,
    /// A second number (needs a first one; never the same number).
    pub phone_secondary: Option<String>,
    pub phone_secondary_country: Option<String>,
}

/// Phone numbers an enquiry can carry.
pub const MAX_PHONES: usize = 2;

/// An ISO 3166-1 alpha-2 code known to the telephone numbering metadata.
pub fn country_id(code: &str) -> Option<phonenumber::country::Id> {
    let code = code.trim();
    if code.len() != 2 || !code.bytes().all(|b| b.is_ascii_alphabetic()) {
        return None;
    }
    code.to_ascii_uppercase().parse().ok()
}

/// A phone number validated with libphonenumber metadata for its country
/// (from `+…`, else `region`), in E.164 form (`+254712345678`). Syntax and
/// numbering-plan validity only: it doesn't prove the line exists.
pub fn normalize_phone(raw: &str, region: Option<&str>) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > 32 {
        return None;
    }
    let region = region.and_then(country_id);
    if region.is_none() && !raw.starts_with('+') {
        return None;
    }
    let number = phonenumber::parse(region, raw).ok()?;
    phonenumber::is_valid(&number).then(|| number.format().mode(phonenumber::Mode::E164).to_string())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Enquiry {
    pub kind: EnquiryKind,
    pub product: Product,
    pub name: String,
    pub email: String,
    pub company: Option<String>,
    pub job_title: Option<String>,
    /// E.164.
    pub phone: Option<String>,
    /// E.164; only with `phone`, never the same number.
    pub phone_secondary: Option<String>,
    /// ISO 3166-1 alpha-2, upper case.
    pub country: Option<String>,
    pub company_size: Option<String>,
    pub message: Option<String>,
    pub locale: String,
    pub source_path: Option<String>,
}

impl EnquiryInput {
    /// Signals that the submission came from automation rather than a person.
    pub fn looks_automated(&self, min_fill_ms: u64) -> bool {
        let honeypot_filled = self.website.as_deref().is_some_and(|v| !v.trim().is_empty());
        let too_fast = self.elapsed_ms.is_some_and(|ms| ms < min_fill_ms);
        honeypot_filled || too_fast
    }

    pub fn validate(self) -> Result<Enquiry, Vec<FieldError>> {
        let mut errors = Vec::new();
        let mut fail = |field, code, message| errors.push(FieldError { field, code, message });

        let kind = EnquiryKind::parse(self.kind.trim());
        if kind.is_none() {
            fail("kind", "invalid", "Choose what you'd like to talk about.");
        }
        let product = Product::parse(self.product.trim());
        if product.is_none() {
            fail("product", "invalid", "Choose a product.");
        }

        let name = clean_line(&self.name);
        if name.chars().count() < 2 {
            fail("name", "required", "Enter your full name.");
        } else if name.chars().count() > 120 {
            fail("name", "too_long", "Name must be 120 characters or fewer.");
        }

        let email = self.email.trim().to_owned();
        if email.is_empty() {
            fail("email", "required", "Enter your work email address.");
        } else if !is_valid_email(&email) {
            fail(
                "email",
                "invalid",
                "Enter a valid email address, like name@company.com.",
            );
        }

        let company = optional_line(self.company.as_deref());
        if company.as_ref().is_some_and(|c| c.chars().count() > 160) {
            fail(
                "company",
                "too_long",
                "Company name must be 160 characters or fewer.",
            );
        } else if company.is_none() && kind.is_some_and(EnquiryKind::requires_company) {
            fail("company", "required", "Enter your company or organisation.");
        }

        let job_title = optional_line(self.job_title.as_deref());
        if job_title.as_ref().is_some_and(|t| t.chars().count() > 120) {
            fail(
                "job_title",
                "too_long",
                "Job title must be 120 characters or fewer.",
            );
        }

        let country = optional_line(self.country.as_deref());
        if country.as_deref().is_some_and(|c| country_id(c).is_none()) {
            fail("country", "invalid", "Choose a country from the list.");
        }
        let country = country.map(|c| c.to_ascii_uppercase());

        // Numbers are read with their own country (or, failing that, the chosen
        // country) and stored in E.164; a second number needs a first one.
        let region = |own: &Option<String>| own.clone().or_else(|| country.clone());
        let raw_phone = optional_line(self.phone.as_deref());
        let phone = raw_phone
            .as_deref()
            .map(|p| normalize_phone(p, region(&self.phone_country).as_deref()));
        if phone.as_ref().is_some_and(Option::is_none) {
            fail(
                "phone",
                "invalid",
                "Enter a valid phone number for the selected country.",
            );
        }
        let phone = phone.flatten();
        let raw_secondary = optional_line(self.phone_secondary.as_deref());
        let phone_secondary = match (&raw_phone, raw_secondary.as_deref()) {
            // A second number without a first one is dropped, as the form does.
            (None, _) | (_, None) => None,
            (Some(_), Some(raw)) => {
                let normalized = normalize_phone(raw, region(&self.phone_secondary_country).as_deref());
                if normalized.is_none() {
                    fail(
                        "phone_secondary",
                        "invalid",
                        "Enter a valid second phone number for the selected country.",
                    );
                } else if phone.is_some() && normalized == phone {
                    fail(
                        "phone_secondary",
                        "duplicate",
                        "The second number is the same as the first.",
                    );
                }
                normalized
            }
        };

        let company_size = optional_line(self.company_size.as_deref());
        if company_size
            .as_deref()
            .is_some_and(|s| !COMPANY_SIZES.contains(&s))
        {
            fail("company_size", "invalid", "Choose a company size from the list.");
        }

        let message = self
            .message
            .as_deref()
            .map(clean_multiline)
            .filter(|m| !m.is_empty());
        match &message {
            Some(m) if m.chars().count() > 5000 => {
                fail(
                    "message",
                    "too_long",
                    "Message must be 5,000 characters or fewer.",
                );
            }
            Some(m) if m.chars().count() < 10 && kind.is_some_and(EnquiryKind::requires_message) => {
                fail(
                    "message",
                    "too_short",
                    "Tell us a little more (at least 10 characters).",
                );
            }
            None if kind.is_some_and(EnquiryKind::requires_message) => {
                fail("message", "required", "Tell us how we can help.");
            }
            _ => {}
        }

        if !self.consent {
            fail(
                "consent",
                "required",
                "Please agree so we can respond to your enquiry.",
            );
        }

        let locale = self
            .locale
            .as_deref()
            .map(str::trim)
            .filter(|l| SUPPORTED_LOCALES.contains(l))
            .unwrap_or("en")
            .to_owned();

        let source_path =
            optional_line(self.source_path.as_deref()).filter(|p| p.starts_with('/') && p.len() <= 300);

        match (kind, product) {
            (Some(kind), Some(product)) if errors.is_empty() => Ok(Enquiry {
                kind,
                product,
                name,
                email,
                company,
                job_title,
                phone,
                phone_secondary,
                country,
                company_size,
                message,
                locale,
                source_path,
            }),
            _ => Err(errors),
        }
    }
}

/// Human-friendly, non-sequential reference shown to the visitor, e.g. `FBG-2610-7KQ3MX`.
pub fn new_reference(now: chrono::DateTime<chrono::Utc>) -> String {
    const ALPHABET: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let mut rng = rand::rng();
    let suffix: String = (0..6)
        .map(|_| ALPHABET[rng.random_range(0..ALPHABET.len())] as char)
        .collect();
    format!("FBG-{}-{suffix}", now.format("%y%m"))
}

fn clean_line(raw: &str) -> String {
    raw.chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn optional_line(raw: Option<&str>) -> Option<String> {
    raw.map(clean_line).filter(|v| !v.is_empty())
}

fn clean_multiline(raw: &str) -> String {
    raw.chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .collect::<String>()
        .trim()
        .to_owned()
}

pub fn is_valid_email(email: &str) -> bool {
    if email.len() > 254 || email.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return false;
    }
    let Some((local, domain)) = email.rsplit_once('@') else {
        return false;
    };
    if local.is_empty() || local.len() > 64 || local.contains('@') {
        return false;
    }
    let labels: Vec<&str> = domain.split('.').collect();
    labels.len() >= 2
        && labels.iter().all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label.chars().all(|c| c.is_alphanumeric() || c == '-')
        })
        && labels.last().is_some_and(|tld| tld.len() >= 2)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_input() -> EnquiryInput {
        EnquiryInput {
            kind: "demo_request".into(),
            product: "zirahr".into(),
            name: "  Amina   Wanjiru ".into(),
            email: "amina@example.co.ke".into(),
            company: Some("Example Ltd".into()),
            consent: true,
            locale: Some("sw".into()),
            elapsed_ms: Some(9_000),
            ..Default::default()
        }
    }

    #[test]
    fn accepts_and_normalises_a_valid_demo_request() {
        let enquiry = valid_input().validate().expect("valid");
        assert_eq!(enquiry.name, "Amina Wanjiru");
        assert_eq!(enquiry.kind, EnquiryKind::DemoRequest);
        assert_eq!(enquiry.product, Product::Zirahr);
        assert_eq!(enquiry.locale, "sw");
    }

    #[test]
    fn reports_every_invalid_field() {
        let input = EnquiryInput {
            kind: "spam".into(),
            product: "unknown".into(),
            email: "not-an-email".into(),
            ..Default::default()
        };
        let fields: Vec<_> = input
            .validate()
            .unwrap_err()
            .into_iter()
            .map(|e| e.field)
            .collect();
        assert_eq!(fields, ["kind", "product", "name", "email", "consent"]);
    }

    #[test]
    fn contact_enquiries_require_a_message() {
        let mut input = valid_input();
        input.kind = "contact".into();
        let errors = input.validate().unwrap_err();
        assert!(
            errors
                .iter()
                .any(|e| e.field == "message" && e.code == "required")
        );
    }

    #[test]
    fn demo_requests_require_a_company() {
        let mut input = valid_input();
        input.company = Some("   ".into());
        let errors = input.validate().unwrap_err();
        assert_eq!(errors[0].field, "company");
    }

    #[test]
    fn rejects_malformed_phone_numbers() {
        let mut input = valid_input();
        input.phone = Some("call me maybe".into());
        assert_eq!(input.validate().unwrap_err()[0].field, "phone");

        let mut input = valid_input();
        input.phone = Some("+254 (0) 712-345-678".into());
        assert_eq!(input.validate().unwrap().phone.as_deref(), Some("+254712345678"));
    }

    #[test]
    fn phones_are_validated_per_country_and_stored_in_e164() {
        // A national number with its country.
        let mut input = valid_input();
        input.phone = Some("0712 345 678".into());
        input.phone_country = Some("ke".into());
        assert_eq!(input.validate().unwrap().phone.as_deref(), Some("+254712345678"));
        // No country and no "+": refused rather than guessed.
        let mut input = valid_input();
        input.phone = Some("0712345678".into());
        assert_eq!(input.validate().unwrap_err()[0].field, "phone");
        // The chosen country is the fallback; too short for Kenya is refused.
        let mut input = valid_input();
        input.country = Some("KE".into());
        input.phone = Some("07123".into());
        assert_eq!(input.validate().unwrap_err()[0].field, "phone");
        // Shared dialling codes: a US and a Canadian number under +1.
        for (number, region) in [("(201) 555-0123", "US"), ("(604) 555-0123", "CA")] {
            let mut input = valid_input();
            input.phone = Some(number.into());
            input.phone_country = Some(region.into());
            assert!(
                input.validate().unwrap().phone.unwrap().starts_with("+1"),
                "{region}"
            );
        }
    }

    #[test]
    fn second_numbers_need_a_first_and_must_differ() {
        let mut input = valid_input();
        input.phone = Some("+254712345678".into());
        input.phone_secondary = Some("+256 772 123 456".into());
        let enquiry = input.validate().unwrap();
        assert_eq!(enquiry.phone_secondary.as_deref(), Some("+256772123456"));
        // The same number twice (written differently) is refused.
        let mut input = valid_input();
        input.phone = Some("+254712345678".into());
        input.phone_secondary = Some("0712 345678".into());
        input.phone_secondary_country = Some("KE".into());
        assert_eq!(input.validate().unwrap_err()[0].code, "duplicate");
        // Without a first number, a second one is dropped.
        let mut input = valid_input();
        input.phone_secondary = Some("+256772123456".into());
        assert_eq!(input.validate().unwrap().phone_secondary, None);
    }

    #[test]
    fn countries_are_iso_codes() {
        let mut input = valid_input();
        input.country = Some("ke".into());
        assert_eq!(input.validate().unwrap().country.as_deref(), Some("KE"));
        for bad in ["Kenya", "XX", "K"] {
            let mut input = valid_input();
            input.country = Some(bad.into());
            assert_eq!(input.validate().unwrap_err()[0].field, "country", "{bad}");
        }
    }

    #[test]
    fn unknown_locale_falls_back_to_english() {
        let mut input = valid_input();
        input.locale = Some("de".into());
        assert_eq!(input.validate().unwrap().locale, "en");
    }

    #[test]
    fn email_rules() {
        for ok in ["a@b.co", "first.last+tag@sub.example.org", "x@mfano.co.ke"] {
            assert!(is_valid_email(ok), "{ok}");
        }
        for bad in ["", "plain", "@x.com", "a@b", "a@-b.com", "a b@c.com", "a@b.c"] {
            assert!(!is_valid_email(bad), "{bad}");
        }
    }

    #[test]
    fn detects_automation_signals() {
        let mut input = valid_input();
        assert!(!input.looks_automated(2_500));
        input.website = Some("http://spam.example".into());
        assert!(input.looks_automated(2_500));

        let mut input = valid_input();
        input.elapsed_ms = Some(300);
        assert!(input.looks_automated(2_500));
    }

    #[test]
    fn references_are_well_formed() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-10-22T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        let reference = new_reference(now);
        assert!(reference.starts_with("FBG-2610-"));
        assert_eq!(reference.len(), "FBG-2610-XXXXXX".len());
    }
}
