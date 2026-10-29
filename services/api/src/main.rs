use std::{net::SocketAddr, sync::Arc};

use figbud_api::{
    admin,
    config::{AppEnv, Config},
    email::{self, outbox},
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
    // First-run brand profiles from the supplied artwork; never blocks start-up.
    if let Err(err) = figbud_api::brand::seed::run(&pool).await {
        tracing::warn!(error = %err, "brand seeding failed");
    }
    // ZiraHR's home page, imported once into the Studio; never blocks start-up.
    if let Err(err) = figbud_api::pages::import::run(&pool).await {
        tracing::warn!(error = %err, "ZiraHR page import failed");
    }

    // `figbud-api admin invite --email <email> --role <role>`: bootstrap the
    // first owner (or any admin) without a running UI. Prints the link once.
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("admin") {
        return admin_command(&pool, &config, &args[1..]).await;
    }

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let worker = match email::build_sender(&config.email) {
        Some(sender) => Some(tokio::spawn(outbox::run_worker(
            pool.clone(),
            Arc::from(sender),
            config.email.clone(),
            shutdown_rx.clone(),
        ))),
        None => {
            tracing::warn!(
                "email delivery on hold (EMAIL_MODE=hold): messages are stored in the outbox                  and delivered once EMAIL_MODE=resend is configured"
            );
            None
        }
    };

    // Publishes approved page changes at their scheduled time.
    let scheduler = tokio::spawn(figbud_api::pages::run_scheduler(
        pool.clone(),
        std::time::Duration::from_secs(15),
        shutdown_rx,
    ));

    let bind_addr = config.bind_addr;
    let state = Arc::new(AppState::new(config, pool)?);

    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    tracing::info!(%bind_addr, "figbud-api listening");
    axum::serve(
        listener,
        routes::router(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    let _ = shutdown_tx.send(true);
    let _ = scheduler.await;
    if let Some(worker) = worker {
        let _ = worker.await;
    }
    Ok(())
}

async fn admin_command(
    pool: &sqlx::PgPool,
    config: &Config,
    args: &[String],
) -> Result<(), Box<dyn std::error::Error>> {
    const USAGE: &str =
        "usage: figbud-api admin invite --email <email> --role <owner|reviewer|editor|viewer>";
    let admin_config = config
        .admin
        .as_ref()
        .ok_or("admin is disabled: set ADMIN_ORIGIN")?;
    let flag = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    match args.first().map(String::as_str) {
        Some("invite") => {
            let email = flag("--email").ok_or(USAGE)?;
            let role = flag("--role")
                .as_deref()
                .and_then(admin::Role::parse)
                .ok_or(USAGE)?;
            if !figbud_api::enquiry::is_valid_email(&email) {
                return Err("invalid email address".into());
            }
            let (url, expires_at) = admin::create_invite(pool, admin_config, &email, role, None).await?;
            println!(
                "Invite for {email} ({}) — valid until {expires_at}:
{url}",
                role.as_str()
            );
            Ok(())
        }
        _ => Err(USAGE.into()),
    }
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
