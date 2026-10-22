use std::{net::SocketAddr, sync::Arc};

use figbud_api::{
    config::{AppEnv, Config},
    email::{self, outbox},
    rate_limit::RateLimiter,
    routes::{self, AppState},
};
use sqlx::postgres::PgPoolOptions;
use tokio::sync::watch;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::dotenv();
    let config = Config::from_env()?;
    init_tracing(config.app_env);

    let pool = PgPoolOptions::new()
        .max_connections(config.database_max_connections)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&config.database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    tracing::info!("database migrations applied");

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let worker = match email::build_sender(&config.email) {
        Some(sender) => Some(tokio::spawn(outbox::run_worker(
            pool.clone(),
            Arc::from(sender),
            config.email.clone(),
            shutdown_rx,
        ))),
        None => {
            tracing::warn!(
                "email delivery on hold (EMAIL_MODE=hold): messages are stored in the outbox                  and delivered once EMAIL_MODE=resend is configured"
            );
            None
        }
    };

    let bind_addr = config.bind_addr;
    let state = Arc::new(AppState {
        enquiry_limiter: RateLimiter::new(config.enquiry_rate_limit, config.enquiry_rate_window),
        config,
        pool,
    });

    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    tracing::info!(%bind_addr, "figbud-api listening");
    axum::serve(
        listener,
        routes::router(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    let _ = shutdown_tx.send(true);
    if let Some(worker) = worker {
        let _ = worker.await;
    }
    Ok(())
}

fn init_tracing(env: AppEnv) {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("figbud_api=info,tower_http=info,sqlx=warn"));
    let registry = tracing_subscriber::registry().with(filter);
    if env.is_production() {
        registry.with(tracing_subscriber::fmt::layer().json()).init();
    } else {
        registry.with(tracing_subscriber::fmt::layer().compact()).init();
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            signal.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
    tracing::info!("shutdown signal received");
}
