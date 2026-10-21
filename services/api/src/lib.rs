//! FigBud Global website API.
//!
//! Handles public enquiries (demo requests, contact, early access, waitlists,
//! partnerships, sales) and their transactional email. Operational customer
//! and tenant systems are deliberately out of scope: this service only ever
//! holds marketing-site data.

pub mod config;
pub mod email;
pub mod enquiry;
pub mod error;
pub mod rate_limit;
pub mod routes;
