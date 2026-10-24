//! Helpers shared by the HTTP integration test binaries.
#![allow(dead_code)]

use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{Router, extract::connect_info::MockConnectInfo};
use figbud_api::{
    config::{AppEnv, Config, EmailConfig, EmailMode},
    routes::{AppState, router},
};
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;

pub fn config(database_url: &str) -> Config {
    Config {
        app_env: AppEnv::Development,
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        database_url: database_url.into(),
        database_max_connections: 2,
        cors_allowed_origins: vec!["http://localhost:3000".into()],
        trust_proxy: false,
        ip_hash_salt: "test".into(),
        enquiry_rate_limit: 100,
        enquiry_rate_window: Duration::from_secs(60),
        min_form_fill: Duration::from_millis(2500),
        admin: Some(figbud_api::config::AdminConfig {
            origin: "http://localhost:3000".parse().unwrap(),
            rp_id: "localhost".into(),
            session_ttl: Duration::from_secs(3600),
        }),
        email: EmailConfig {
            mode: EmailMode::Log,
            from: "FigBud <no-reply@localhost>".into(),
            reply_to: None,
            team_recipients: vec!["team@example.com".into()],
            zirahr_recipients: vec![],
            jasiri_recipients: vec![],
            expense_now_recipients: vec![],
            ziwa_recipients: vec![],
            partnership_recipients: vec![],
            send_acknowledgements: true,
            worker_interval: Duration::from_secs(5),
        },
    }
}

pub fn app_with(pool: sqlx::PgPool, config: Config) -> Router {
    let state = Arc::new(AppState::new(config, pool).unwrap());
    router(state).layer(MockConnectInfo(SocketAddr::from(([203, 0, 113, 9], 4000))))
}

/// An app whose pool never connects: for tests that must not need a database.
pub fn lazy_app() -> Router {
    let url = "postgres://nobody:nothing@127.0.0.1:1/none";
    let pool = PgPoolOptions::new()
        .acquire_timeout(Duration::from_millis(300))
        .connect_lazy(url)
        .unwrap();
    app_with(pool, config(url))
}

pub async fn json_body(response: axum::response::Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

/// The test database (migrated), or `None` when `TEST_DATABASE_URL` is unset.
pub async fn database() -> Option<sqlx::PgPool> {
    let url = std::env::var("TEST_DATABASE_URL").ok()?;
    let pool = PgPoolOptions::new().max_connections(4).connect(&url).await.ok()?;
    sqlx::migrate!("./migrations").run(&pool).await.ok()?;
    Some(pool)
}
