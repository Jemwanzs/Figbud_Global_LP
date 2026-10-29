//! Brand profiles and the logo library against real PostgreSQL (`TEST_DATABASE_URL`).

mod common;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use common::{app_with, config, database};
use figbud_api::{admin, brand};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

const ORIGIN: &str = "http://localhost:3000";

struct Studio {
    app: Router,
    pool: PgPool,
    run: String,
}

impl Studio {
    async fn new() -> Option<Self> {
        let pool = database().await?;
        brand::seed::run(&pool).await.unwrap();
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        Some(Self {
            app: app_with(pool.clone(), config(&url)),
            pool,
            run: Uuid::new_v4().simple().to_string()[..8].to_owned(),
        })
    }

    async fn admin(&self, role: &str) -> String {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Brand Tester', $3)")
            .bind(id)
            .bind(format!(
                "brand-{role}-{}-{}@figbud.test",
                self.run,
                &id.simple().to_string()[24..]
            ))
            .bind(role)
            .execute(&self.pool)
            .await
            .unwrap();
        let admin_config = config("unused").admin.unwrap();
        let token = admin::create_session(&self.pool, &admin_config, id, "test", None)
            .await
            .unwrap();
        format!("figbud_admin={token}")
    }

    async fn send(&self, req: Request<Body>) -> (StatusCode, Vec<u8>, Option<String>) {
        let response = self.app.clone().oneshot(req).await.unwrap();
        let status = response.status();
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v.to_str().unwrap().to_owned());
        let bytes = axum::body::to_bytes(response.into_body(), 8 << 20).await.unwrap();
        (status, bytes.to_vec(), content_type)
    }

    async fn call(
        &self,
        method: &str,
        uri: &str,
        cookie: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut req = Request::builder()
            .method(method)
            .uri(uri)
            .header(header::ORIGIN, ORIGIN);
        if let Some(cookie) = cookie {
            req = req.header(header::COOKIE, cookie);
        }
        let req = match body {
            Some(body) => req
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_string())),
            None => req.body(Body::empty()),
        }
        .unwrap();
        let (status, bytes, _) = self.send(req).await;
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    async fn upload(
        &self,
        slug: &str,
        cookie: &str,
        content_type: &str,
        bytes: Vec<u8>,
        query: &str,
    ) -> (StatusCode, Value) {
        let req = Request::builder()
            .method("POST")
            .uri(format!("/v1/admin/sites/{slug}/brand/uploads?{query}"))
            .header(header::ORIGIN, ORIGIN)
            .header(header::COOKIE, cookie)
            .header(header::CONTENT_TYPE, content_type)
            .body(Body::from(bytes))
            .unwrap();
        let (status, body, _) = self.send(req).await;
        (status, serde_json::from_slice(&body).unwrap_or(Value::Null))
    }

    /// A fresh product website (so tests never fight over the seeded ones).
    async fn product(&self, owner: &str) -> String {
        let slug = format!("brand_{}", self.run);
        let (status, _) = self
            .call(
                "POST",
                "/v1/admin/sites",
                Some(owner),
                Some(json!({ "name": format!("Brand {}", self.run), "slug": slug, "category": "custom_enterprise" })),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED);
        slug
    }
}

fn svg(fill: &str) -> Vec<u8> {
    format!(r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40"><rect width="120" height="40" rx="8" fill="{fill}"/></svg>"##).into_bytes()
}

#[tokio::test]
async fn seeded_official_logos_are_published_and_proposals_stay_in_draft() {
    let Some(s) = Studio::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (_, sites) = s.call("GET", "/v1/sites", None, None).await;
    let site = |slug: &str| {
        sites
            .as_array()
            .unwrap()
            .iter()
            .find(|x| x["slug"] == slug)
            .unwrap()
            .clone()
    };

    let figbud = site("figbud");
    let logo = &figbud["brand"]["logos"]["horizontal"]["on_dark"];
    assert_eq!(logo["alt"], "FigBud Global");
    assert_eq!(logo["content_type"], "image/png");
    assert!(
        figbud["brand"]["logos"]["horizontal"]["on_light"].is_null(),
        "recoloured variants are proposals"
    );
    assert!(site("zirahr")["brand"]["logos"]["symbol"]["on_dark"]["url"].is_string());
    assert!(site("jasiri")["brand"]["logos"]["horizontal"]["on_dark"]["url"].is_string());
    assert!(
        site("expense_now")["brand"].is_null(),
        "the Expense Now concept is not approved"
    );
    // The final Ziwa LMS identity (29 Oct 2026) is published.
    let ziwa = site("ziwa")["brand"].clone();
    for slot in [
        &ziwa["logos"]["horizontal"]["on_dark"],
        &ziwa["logos"]["horizontal"]["on_light"],
        &ziwa["logos"]["symbol"]["on_dark"],
        &ziwa["favicon"],
        &ziwa["app_icon"],
    ] {
        assert_eq!(slot["content_type"], "image/svg+xml", "{ziwa}");
    }
    assert_ne!(
        ziwa["logos"]["horizontal"]["on_dark"]["url"], ziwa["logos"]["horizontal"]["on_light"]["url"],
        "white and brown wordmarks"
    );
    assert_eq!(ziwa["colors"]["primary"], "#fb7a1a");
    assert_eq!(ziwa["colors"]["secondary"], "#ffc642");

    // Favicons and app icons from the official symbols (added once, as a
    // recorded revision, for profiles seeded before icons existed).
    for slug in ["figbud", "zirahr"] {
        let brand = &site(slug)["brand"];
        assert!(brand["favicon"]["url"].is_string(), "{slug} favicon");
        assert!(brand["app_icon"]["url"].is_string(), "{slug} app icon");
        assert_eq!(
            brand["favicon"]["width"], brand["favicon"]["height"],
            "favicons are square"
        );
    }
    brand::seed::run(&s.pool).await.unwrap();
    let markers: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_log a JOIN sites s ON s.id = a.site_id
          WHERE s.slug = 'figbud' AND a.action = 'brand.icons_seeded'",
    )
    .fetch_one(&s.pool)
    .await
    .unwrap();
    assert_eq!(markers, 1, "the icon upgrade runs once");

    // Databases seeded with an earlier Ziwa identity are upgraded once: the
    // final identity is published as a new revision and replaces the draft,
    // and the superseded seeded files are archived (Studio uploads are kept).
    sqlx::query(
        "DELETE FROM audit_log WHERE action = 'brand.ziwa_final_identity_seeded'
            AND site_id = (SELECT id FROM sites WHERE slug = 'ziwa')",
    )
    .execute(&s.pool)
    .await
    .unwrap();
    let ziwa_site: Uuid = sqlx::query_scalar("SELECT id FROM sites WHERE slug = 'ziwa'")
        .fetch_one(&s.pool)
        .await
        .unwrap();
    let old_seeded: Uuid = sqlx::query_scalar(
        "INSERT INTO brand_assets (id, site_id, label, alt_text, content_type, width, height, has_alpha,
                                   byte_size, sha256, data, origin)
         VALUES ($1, $2, 'Ziwa LMS logo (blue and green)', 'Ziwa LMS', 'image/svg+xml', 40, 20, true, 4,
                 $3, 'test', 'official')
         RETURNING id",
    )
    .bind(Uuid::now_v7())
    .bind(ziwa_site)
    // Unique per run, so the test can run again on the same database.
    .bind(Uuid::new_v4().to_string())
    .fetch_one(&s.pool)
    .await
    .unwrap();
    let uploaded: Uuid = sqlx::query_scalar(
        "INSERT INTO brand_assets (id, site_id, label, alt_text, content_type, width, height, has_alpha,
                                   byte_size, sha256, data, origin)
         VALUES ($1, $2, 'Campaign banner', 'Ziwa LMS', 'image/svg+xml', 40, 20, true, 4,
                 $3, 'test', 'upload')
         RETURNING id",
    )
    .bind(Uuid::now_v7())
    .bind(ziwa_site)
    // Unique per run, so the test can run again on the same database.
    .bind(Uuid::new_v4().to_string())
    .fetch_one(&s.pool)
    .await
    .unwrap();
    sqlx::query(
        "UPDATE site_brands SET draft_note = 'Proposed Ziwa LMS logo concept: not approved.'
          WHERE site_id = (SELECT id FROM sites WHERE slug = 'ziwa')",
    )
    .execute(&s.pool)
    .await
    .unwrap();
    let revisions = || async {
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM brand_revisions r JOIN sites s ON s.id = r.site_id
              WHERE s.slug = 'ziwa' AND r.state = 'published'",
        )
        .fetch_one(&s.pool)
        .await
        .unwrap()
    };
    let before = revisions().await;
    brand::seed::run(&s.pool).await.unwrap();
    brand::seed::run(&s.pool).await.unwrap();
    assert_eq!(revisions().await, before + 1, "the Ziwa upgrade runs once");
    let note: Option<String> = sqlx::query_scalar(
        "SELECT b.draft_note FROM site_brands b JOIN sites s ON s.id = b.site_id WHERE s.slug = 'ziwa'",
    )
    .fetch_one(&s.pool)
    .await
    .unwrap();
    assert!(note.is_none(), "the concept draft is replaced");
    let archived: bool = sqlx::query_scalar("SELECT archived_at IS NOT NULL FROM brand_assets WHERE id = $1")
        .bind(old_seeded)
        .fetch_one(&s.pool)
        .await
        .unwrap();
    assert!(archived, "the blue and green files are archived");
    let kept: bool = sqlx::query_scalar("SELECT archived_at IS NULL FROM brand_assets WHERE id = $1")
        .bind(uploaded)
        .fetch_one(&s.pool)
        .await
        .unwrap();
    assert!(kept, "files uploaded in the Studio are kept");
    let live: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM brand_assets WHERE site_id = $1 AND archived_at IS NULL AND origin = 'official'",
    )
    .bind(ziwa_site)
    .fetch_one(&s.pool)
    .await
    .unwrap();
    assert_eq!(live, 9, "the final identity's nine files stay in the library");

    // The FigBud Global parent palette replaces the old amber defaults once;
    // a palette chosen in the Studio would be kept.
    let figbud_colours = || async {
        sqlx::query_scalar::<_, String>(
            "SELECT b.published->'colors'->>'primary' FROM site_brands b JOIN sites s ON s.id = b.site_id
              WHERE s.slug = 'figbud'",
        )
        .fetch_one(&s.pool)
        .await
        .unwrap()
    };
    assert_eq!(figbud_colours().await, "#22c55e");
    let set_figbud = |primary: &'static str| {
        sqlx::query(
            "UPDATE site_brands SET published = jsonb_set(jsonb_set(jsonb_set(published,
                    '{colors,primary}', to_jsonb($1::text)), '{colors,secondary}', '\"#a66538\"'),
                    '{colors,accent}', '\"#f6bd82\"')
              WHERE site_id = (SELECT id FROM sites WHERE slug = 'figbud')",
        )
        .bind(primary)
    };
    let clear_marker = || {
        sqlx::query(
            "DELETE FROM audit_log WHERE action = 'brand.figbud_palette_seeded'
                AND site_id = (SELECT id FROM sites WHERE slug = 'figbud')",
        )
    };
    set_figbud("#f0a65d").execute(&s.pool).await.unwrap();
    clear_marker().execute(&s.pool).await.unwrap();
    brand::seed::run(&s.pool).await.unwrap();
    assert_eq!(
        figbud_colours().await,
        "#22c55e",
        "old amber defaults are upgraded"
    );
    set_figbud("#123456").execute(&s.pool).await.unwrap();
    clear_marker().execute(&s.pool).await.unwrap();
    brand::seed::run(&s.pool).await.unwrap();
    assert_eq!(
        figbud_colours().await,
        "#123456",
        "a palette chosen in the Studio is kept"
    );
    // Leave the shared test database on the parent palette.
    sqlx::query(
        "UPDATE site_brands SET published = jsonb_set(published, '{colors}',
                '{\"primary\":\"#22c55e\",\"secondary\":\"#3b82f6\",\"accent\":\"#a855f7\"}')
          WHERE site_id = (SELECT id FROM sites WHERE slug = 'figbud')",
    )
    .execute(&s.pool)
    .await
    .unwrap();

    // Published files are public (and cache forever); renditions are WebP.
    let url = logo["url"].as_str().unwrap();
    let get = |uri: String| Request::builder().uri(uri).body(Body::empty()).unwrap();
    let (status, bytes, content_type) = s.send(get(url.to_owned())).await;
    assert_eq!(
        (status, content_type.as_deref()),
        (StatusCode::OK, Some("image/png"))
    );
    assert!(bytes.starts_with(b"\x89PNG"));
    // Square PNG icons for browsers and devices, rendered from any published logo.
    let favicon = site("ziwa")["brand"]["favicon"]["url"]
        .as_str()
        .unwrap()
        .to_owned();
    for size in [16u32, 32, 180, 512] {
        let (status, bytes, content_type) = s.send(get(format!("{favicon}?icon={size}"))).await;
        assert_eq!(
            (status, content_type.as_deref()),
            (StatusCode::OK, Some("image/png"))
        );
        assert_eq!(
            &bytes[16..24],
            [size.to_be_bytes(), size.to_be_bytes()].concat(),
            "{size}x{size}"
        );
    }
    let (status, _, _) = s.send(get(format!("{favicon}?icon=100"))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _, content_type) = s.send(get(format!("{url}?w=64"))).await;
    assert_eq!(
        (status, content_type.as_deref()),
        (StatusCode::OK, Some("image/webp"))
    );

    // Draft-only files are not.
    let owner = s.admin("owner").await;
    let (_, studio) = s
        .call("GET", "/v1/admin/sites/expense_now/brand", Some(&owner), None)
        .await;
    let concept = studio["draft"]["logos"]["horizontal"]["on_dark"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(studio["draft_note"].as_str().unwrap().contains("not approved"));
    let (status, _, _) = s.send(get(format!("/v1/brand/assets/{concept}"))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let asset = studio["assets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|a| a["id"] == concept.as_str())
        .unwrap();
    assert_eq!(asset["origin"], "proposed");
    assert_eq!(
        asset["used_in"]["draft"][0],
        json!({ "slot": "horizontal", "theme": "dark" })
    );
}

#[tokio::test]
async fn upload_validation_and_permissions() {
    let Some(s) = Studio::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (owner, editor, viewer) = (
        s.admin("owner").await,
        s.admin("editor").await,
        s.admin("viewer").await,
    );
    let slug = s.product(&owner).await;
    let query = "label=Primary%20logo&alt=Brand";

    let (status, _) = s
        .upload(&slug, &viewer, "image/svg+xml", svg("#22d3ee"), query)
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "viewers can't upload");
    let (status, body) = s.upload(&slug, &editor, "image/png", svg("#22d3ee"), query).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        body["error"]["fields"][0]["field"], "file",
        "declared type must match the bytes"
    );
    let (status, body) = s
        .upload(&slug, &editor, "image/svg+xml", svg("#22d3ee"), "label=x")
        .await;
    assert_eq!(
        (status, body["error"]["fields"][0]["field"].as_str()),
        (StatusCode::UNPROCESSABLE_ENTITY, Some("alt_text"))
    );
    let hostile =
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><script>alert(1)</script></svg>"#
            .to_vec();
    let (status, _) = s.upload(&slug, &editor, "image/svg+xml", hostile, query).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    let (status, asset) = s
        .upload(&slug, &editor, "image/svg+xml", svg("#22d3ee"), query)
        .await;
    assert_eq!(status, StatusCode::CREATED, "{asset}");
    assert_eq!(
        (asset["width"].as_i64(), asset["height"].as_i64()),
        (Some(120), Some(40))
    );
    assert_eq!(asset["origin"], "upload");
    let (status, again) = s
        .upload(&slug, &editor, "image/svg+xml", svg("#22d3ee"), query)
        .await;
    assert_eq!(
        (status, &again["id"]),
        (StatusCode::OK, &asset["id"]),
        "identical files are stored once"
    );

    // The stored SVG is the sanitised copy and is served with a locked-down policy.
    let id = asset["id"].as_str().unwrap();
    let req = Request::builder()
        .uri(format!("/v1/admin/brand/assets/{id}"))
        .header(header::COOKIE, &viewer)
        .body(Body::empty())
        .unwrap();
    let response = s.app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(
        response.headers()[header::CONTENT_SECURITY_POLICY]
            .to_str()
            .unwrap()
            .contains("sandbox")
    );

    let over = vec![b'a'; 3 * 1024 * 1024];
    let (status, _) = s.upload(&slug, &editor, "image/png", over, query).await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn draft_publish_rollback_and_archive() {
    let Some(s) = Studio::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (owner, editor, reviewer) = (
        s.admin("owner").await,
        s.admin("editor").await,
        s.admin("reviewer").await,
    );
    let slug = s.product(&owner).await;
    let base = format!("/v1/admin/sites/{slug}/brand");
    let (_, first) = s
        .upload(
            &slug,
            &editor,
            "image/svg+xml",
            svg("#22d3ee"),
            "label=First&alt=Brand",
        )
        .await;
    let (_, second) = s
        .upload(
            &slug,
            &editor,
            "image/svg+xml",
            svg("#f97316"),
            "label=Second&alt=Brand",
        )
        .await;

    let (_, studio) = s.call("GET", &base, Some(&editor), None).await;
    assert_eq!(studio["publishable"], false, "no logo yet");
    let mut config = studio["draft"].clone();
    config["logos"]["horizontal"]["on_dark"] = first["id"].clone();

    let save = |config: Value, version: Value| json!({ "config": config, "version": version });
    let (status, saved) = s
        .call(
            "POST",
            &format!("{base}/draft"),
            Some(&editor),
            Some(save(config.clone(), studio["draft_version"].clone())),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["publishable"], true);
    let (status, _) = s
        .call(
            "POST",
            &format!("{base}/draft"),
            Some(&editor),
            Some(save(config.clone(), studio["draft_version"].clone())),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "stale drafts are refused");

    let mut bad = config.clone();
    bad["colors"]["primary"] = json!("#130f0d");
    let (status, saved_bad) = s
        .call(
            "POST",
            &format!("{base}/draft"),
            Some(&editor),
            Some(save(bad, saved["draft_version"].clone())),
        )
        .await;
    assert_eq!(
        (status, saved_bad["publishable"].as_bool()),
        (StatusCode::OK, Some(false)),
        "too dark to see on the dark theme"
    );
    let (status, _) = s
        .call(
            "POST",
            &format!("{base}/submit"),
            Some(&editor),
            Some(json!({ "note": "Dark primary" })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "required checks block submission");
    let (status, _) = s
        .call(
            "POST",
            &format!("{base}/draft"),
            Some(&editor),
            Some(save(config.clone(), saved_bad["draft_version"].clone())),
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    // Autosave never publishes.
    let (_, studio) = s.call("GET", &base, Some(&editor), None).await;
    assert!(studio["published"].is_null());

    // Submit → the editor can't approve, the reviewer can.
    let (status, created) = s
        .call(
            "POST",
            &format!("{base}/submit"),
            Some(&editor),
            Some(json!({ "note": "First logo" })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    let revision = created["id"].as_str().unwrap().to_owned();
    let (status, _) = s
        .call(
            "POST",
            &format!("{base}/revisions/{revision}/approve"),
            Some(&editor),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = s
        .call(
            "POST",
            &format!("{base}/submit"),
            Some(&editor),
            Some(json!({ "note": "Again" })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "one pending change at a time");
    let (status, _) = s
        .call(
            "POST",
            &format!("{base}/assets/{}/archive", first["id"].as_str().unwrap()),
            Some(&editor),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "files in use can't be archived");
    let (status, decided) = s
        .call(
            "POST",
            &format!("{base}/revisions/{revision}/approve"),
            Some(&reviewer),
            None,
        )
        .await;
    assert_eq!(
        (status, decided["state"].as_str()),
        (StatusCode::OK, Some("published"))
    );

    // Replace with the second file; publish it (owner self-approves, audited).
    let (_, studio) = s.call("GET", &base, Some(&owner), None).await;
    assert_eq!(studio["draft_differs"], false);
    let mut replaced = studio["draft"].clone();
    replaced["logos"]["horizontal"]["on_dark"] = second["id"].clone();
    s.call(
        "POST",
        &format!("{base}/draft"),
        Some(&owner),
        Some(save(replaced, studio["draft_version"].clone())),
    )
    .await;
    let (_, created) = s
        .call(
            "POST",
            &format!("{base}/submit"),
            Some(&owner),
            Some(json!({ "note": "Second logo" })),
        )
        .await;
    let (status, _) = s
        .call(
            "POST",
            &format!("{base}/revisions/{}/approve", created["id"].as_str().unwrap()),
            Some(&owner),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    // The replaced file is no longer public; it stays in the library for rollback.
    let first_id = first["id"].as_str().unwrap();
    let req = Request::builder()
        .uri(format!("/v1/brand/assets/{first_id}"))
        .body(Body::empty())
        .unwrap();
    assert_eq!(s.send(req).await.0, StatusCode::NOT_FOUND);
    let (status, _) = s
        .call(
            "POST",
            &format!("{base}/assets/{first_id}/archive"),
            Some(&editor),
            None,
        )
        .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "no longer used anywhere, so it can be archived"
    );

    // Rollback: restoring version 1 needs the archived file back first.
    let (_, studio) = s.call("GET", &base, Some(&owner), None).await;
    let v1 = studio["revisions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["number"] == 1)
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let (status, _) = s
        .call(
            "POST",
            &format!("{base}/revisions/{v1}/restore"),
            Some(&editor),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    s.call(
        "POST",
        &format!("{base}/assets/{first_id}/restore"),
        Some(&editor),
        None,
    )
    .await;
    let (status, restored) = s
        .call(
            "POST",
            &format!("{base}/revisions/{v1}/restore"),
            Some(&editor),
            None,
        )
        .await;
    assert_eq!((status, restored["restored"].as_i64()), (StatusCode::OK, Some(1)));
    let (_, studio) = s.call("GET", &base, Some(&owner), None).await;
    assert_eq!(studio["draft"]["logos"]["horizontal"]["on_dark"], first["id"]);
    assert_eq!(
        studio["published"]["logos"]["horizontal"]["on_dark"], second["id"],
        "restoring changes the draft only"
    );
    assert_eq!(studio["draft_note"], "Restored from version 1");

    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT a.action FROM audit_log a JOIN sites s ON s.id = a.site_id WHERE s.slug = $1 AND a.action LIKE 'brand.%' ORDER BY a.created_at, a.id",
    )
    .bind(&slug)
    .fetch_all(&s.pool)
    .await
    .unwrap();
    for expected in [
        "brand.asset_uploaded",
        "brand.draft_saved",
        "brand.submitted",
        "brand.published",
        "brand.asset_archived",
        "brand.version_restored",
    ] {
        assert!(actions.iter().any(|a| a == expected), "{expected} in {actions:?}");
    }
    let detail: Value = sqlx::query_scalar(
        "SELECT a.detail FROM audit_log a JOIN sites s ON s.id = a.site_id WHERE s.slug = $1 AND a.action = 'brand.published' ORDER BY a.created_at DESC LIMIT 1",
    )
    .bind(&slug)
    .fetch_one(&s.pool)
    .await
    .unwrap();
    assert_eq!(
        detail["from"]["logos"]["horizontal"]["on_dark"], first["id"],
        "audit keeps previous and new values"
    );
    assert_eq!(detail["to"]["logos"]["horizontal"]["on_dark"], second["id"]);
    assert_eq!(detail["self_approved"], true);
}
