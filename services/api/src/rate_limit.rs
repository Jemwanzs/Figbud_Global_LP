//! In-process fixed-window rate limiter keyed by client identity.
//!
//! Suitable for a single replica. When the API scales horizontally, move the
//! counters to PostgreSQL or Redis (tracked in docs/ROADMAP.md).

use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::Mutex,
    time::{Duration, Instant},
};

use axum::http::HeaderMap;

pub struct RateLimiter {
    limit: u32,
    window: Duration,
    buckets: Mutex<HashMap<IpAddr, Bucket>>,
}

struct Bucket {
    started: Instant,
    count: u32,
}

impl RateLimiter {
    pub fn new(limit: u32, window: Duration) -> Self {
        Self {
            limit,
            window,
            buckets: Mutex::new(HashMap::new()),
        }
    }

    /// Records a hit. Returns `Err(retry_after)` when the caller is over the limit.
    pub fn check(&self, key: IpAddr) -> Result<(), Duration> {
        self.check_at(key, Instant::now())
    }

    fn check_at(&self, key: IpAddr, now: Instant) -> Result<(), Duration> {
        let mut buckets = self
            .buckets
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if buckets.len() > 10_000 {
            buckets.retain(|_, b| now.duration_since(b.started) < self.window);
        }
        let bucket = buckets.entry(key).or_insert(Bucket {
            started: now,
            count: 0,
        });
        if now.duration_since(bucket.started) >= self.window {
            *bucket = Bucket {
                started: now,
                count: 0,
            };
        }
        if bucket.count >= self.limit {
            return Err(self.window.saturating_sub(now.duration_since(bucket.started)));
        }
        bucket.count += 1;
        Ok(())
    }
}

/// Resolves the client address. `X-Forwarded-For` is only honoured when the
/// API runs behind a trusted proxy, otherwise it is trivially spoofable.
pub fn client_ip(headers: &HeaderMap, peer: SocketAddr, trust_proxy: bool) -> IpAddr {
    if trust_proxy {
        let forwarded = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .and_then(|v| v.trim().parse().ok());
        if let Some(ip) = forwarded {
            return ip;
        }
    }
    peer.ip()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_after_limit_and_resets_after_window() {
        let limiter = RateLimiter::new(2, Duration::from_secs(60));
        let ip: IpAddr = "203.0.113.7".parse().unwrap();
        let t0 = Instant::now();
        assert!(limiter.check_at(ip, t0).is_ok());
        assert!(limiter.check_at(ip, t0).is_ok());
        let retry = limiter.check_at(ip, t0 + Duration::from_secs(10)).unwrap_err();
        assert_eq!(retry, Duration::from_secs(50));

        let other: IpAddr = "203.0.113.8".parse().unwrap();
        assert!(limiter.check_at(other, t0).is_ok());

        assert!(limiter.check_at(ip, t0 + Duration::from_secs(61)).is_ok());
    }

    #[test]
    fn forwarded_header_only_trusted_behind_proxy() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "198.51.100.4, 10.0.0.1".parse().unwrap());
        let peer: SocketAddr = "10.0.0.1:5000".parse().unwrap();
        assert_eq!(
            client_ip(&headers, peer, true),
            "198.51.100.4".parse::<IpAddr>().unwrap()
        );
        assert_eq!(client_ip(&headers, peer, false), peer.ip());
    }
}
