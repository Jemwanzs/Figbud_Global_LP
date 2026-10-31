//! FigBud Global website API.
//!
//! Handles public enquiries (demo requests, contact, early access, waitlists,
//! partnerships, sales) and their transactional email, and serves published
//! Blog & Insights content. Operational customer
//! and tenant systems are deliberately out of scope: this service only ever
//! holds marketing-site data.

pub mod admin;
pub mod brand;
pub mod campaigns;
pub mod cms;
pub mod config;
pub mod email;
pub mod enquiry;
pub mod error;
pub mod media;
pub mod pages;
pub mod privacy;
pub mod proof;
pub mod rate_limit;
pub mod routes;
pub mod seo;
pub mod shared;
pub mod site_settings;
pub mod sites;
