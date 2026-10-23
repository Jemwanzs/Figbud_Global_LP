//! FigBud Global website API.
//!
//! Handles public enquiries (demo requests, contact, early access, waitlists,
//! partnerships, sales) and their transactional email, and serves published
//! Blog & Insights content. Operational customer
//! and tenant systems are deliberately out of scope: this service only ever
//! holds marketing-site data.

pub mod admin;
pub mod cms;
pub mod config;
pub mod email;
pub mod enquiry;
pub mod error;
pub mod rate_limit;
pub mod routes;
pub mod sites;
