//! Start Now workspace requests and demo booking (P8-M8) against real
//! PostgreSQL (`TEST_DATABASE_URL`): availability, slots, atomic
//! reservation, the team's booking workflow, assignment, notes and the
//! overview. One test, in order, since every step shares ZiraHR's calendar.

mod common;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use common::{app_with, config, database, json_body};
use figbud_api::admin;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

struct World {
    app: Router,
    pool: PgPool,
    run: String,
}

impl World {
    async fn admin(&self, role: &str) -> (Uuid, String) {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, $3, $4)")
            .bind(id)
            .bind(format!(
                "{role}-{}-{}@figbud.test",
                self.run,
                &id.simple().to_string()[24..]
            ))
            .bind(format!("Booking {role}"))
            .bind(role)
            .execute(&self.pool)
            .await
            .unwrap();
        let admin_config = config("unused").admin.unwrap();
        let token = admin::create_session(&self.pool, &admin_config, id, "test", None)
            .await
            .unwrap();
        (id, format!("figbud_admin={token}"))
    }

    async fn call(
        &self,
        method: &str,
        uri: &str,
        cookie: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut request = Request::builder().method(method).uri(uri);
        if let Some(cookie) = cookie {
            request = request
                .header(header::COOKIE, cookie)
                .header(header::ORIGIN, "http://localhost:3000");
        }
        let request = match body {
            Some(body) => request
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_string())),
            None => request.body(Body::empty()),
        }
        .unwrap();
        let response = self.app.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    async fn submit(&self, body: Value) -> (StatusCode, Value) {
        let request = Request::post("/v1/enquiries")
            .header(header::CONTENT_TYPE, "application/json")
            .header("idempotency-key", Uuid::new_v4().to_string())
            .body(Body::from(body.to_string()))
            .unwrap();
        let response = self.app.clone().oneshot(request).await.unwrap();
        let status = response.status();
        (status, json_body(response).await)
    }

    fn demo(&self, name: &str, slot: &str) -> Value {
        json!({
            "kind": "demo_request",
            "product": "zirahr",
            "name": name,
            "email": "amina@example.co.ke",
            "company": format!("Mfano {}", self.run),
            "consent": true,
            "locale": "en",
            "elapsed_ms": 9000,
            "demo_slot": slot,
        })
    }

    async fn slots(&self) -> Vec<String> {
        let (status, body) = self.call("GET", "/v1/sites/zirahr/demo-slots", None, None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["enabled"], true, "{body}");
        body["days"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|d| {
                d["slots"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|s| s.as_str().unwrap().to_owned())
            })
            .collect()
    }
}

#[tokio::test]
async fn workspace_requests_and_demo_bookings() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let w = World {
        app: app_with(pool.clone(), config(&url)),
        pool,
        run: Uuid::new_v4().simple().to_string()[..10].to_owned(),
    };
    let (_, owner) = w.admin("owner").await;
    let (editor_id, editor) = w.admin("editor").await;
    let (_, viewer) = w.admin("viewer").await;

    // Off by default: no slots, and booking a time is refused.
    let (status, body) = w
        .call(
            "GET",
            "/v1/admin/enquiries/availability/zirahr",
            Some(&owner),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let version = body["version"].as_i64().unwrap();
    if version == 0 {
        let (_, public) = w.call("GET", "/v1/sites/zirahr/demo-slots", None, None).await;
        assert_eq!(public["enabled"], false);
    }

    // Rules are checked by the API, whoever sends them.
    let bad = json!({ "availability": { "enabled": true, "hours": [], "time_zone": "Mars/Base" }, "version": version });
    let (status, _) = w
        .call(
            "POST",
            "/v1/admin/enquiries/availability/zirahr",
            Some(&owner),
            Some(bad),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    // Editors can't change availability; reviewers and owners can.
    let open_all_day = json!({
        "availability": {
            "enabled": true,
            "time_zone": "Africa/Nairobi",
            "slot_minutes": 30,
            "buffer_minutes": 0,
            "notice_hours": 0,
            "days_ahead": 2,
            "hours": (1..=7).map(|d| json!({ "day": d, "start": "00:00", "end": "24:00" })).collect::<Vec<_>>(),
        },
        "version": version,
    });
    let (status, _) = w
        .call(
            "POST",
            "/v1/admin/enquiries/availability/zirahr",
            Some(&editor),
            Some(open_all_day.clone()),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, body) = w
        .call(
            "POST",
            "/v1/admin/enquiries/availability/zirahr",
            Some(&owner),
            Some(open_all_day.clone()),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(!body["preview"].as_array().unwrap().is_empty());
    // A stale version is refused rather than overwriting.
    let (status, _) = w
        .call(
            "POST",
            "/v1/admin/enquiries/availability/zirahr",
            Some(&owner),
            Some(open_all_day),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);

    let slots = w.slots().await;
    assert!(
        slots.len() >= 4,
        "a day and more of half-hour slots: {}",
        slots.len()
    );

    // Booking a slot: an enquiry with its booking; the slot disappears.
    let first = slots[2].clone();
    let (status, body) = w.submit(w.demo("Amina Wanjiku", &first)).await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let reference = body["reference"].as_str().unwrap().to_owned();
    assert!(!w.slots().await.contains(&first));
    let message: String = sqlx::query_scalar("SELECT message FROM enquiries WHERE reference = $1")
        .bind(&reference)
        .fetch_one(&w.pool)
        .await
        .unwrap();
    assert!(message.starts_with("Requested demo time: "), "{message}");
    assert!(message.contains("(Africa/Nairobi)"), "{message}");

    // The same slot again: refused, nothing stored.
    let (status, body) = w.submit(w.demo("Baraka Otieno", &first)).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error"]["code"], "slot_taken");
    // A time that was never offered, and a booking for another kind of enquiry.
    let (status, _) = w.submit(w.demo("Baraka Otieno", "2020-01-01T09:00:00Z")).await;
    assert_eq!(status, StatusCode::CONFLICT);
    let mut contact = w.demo("Baraka Otieno", &slots[3]);
    contact["kind"] = json!("sales");
    contact["message"] = json!("Pricing for 300 staff, please.");
    let (status, _) = w.submit(contact).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    // Two visitors at once for one slot: exactly one gets it.
    let race = slots[4].clone();
    let (a, b) = tokio::join!(
        w.submit(w.demo("Chao Li", &race)),
        w.submit(w.demo("Dalia Hassan", &race))
    );
    let mut outcomes = [a.0, b.0];
    outcomes.sort();
    assert_eq!(outcomes, [StatusCode::CREATED, StatusCode::CONFLICT]);
    let live: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM demo_bookings WHERE product = 'zirahr' AND starts_at = $1::timestamptz
            AND status IN ('pending', 'confirmed')",
    )
    .bind(&race)
    .fetch_one(&w.pool)
    .await
    .unwrap();
    assert_eq!(live, 1);

    // The team's workflow: viewers read, editors move bookings on.
    let (status, body) = w
        .call("GET", "/v1/admin/enquiries/bookings", Some(&viewer), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let booking = body["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["reference"] == reference.as_str())
        .unwrap()
        .clone();
    assert_eq!(booking["status"], "pending");
    let id = booking["id"].as_str().unwrap();
    let enquiry = booking["enquiry_id"].as_str().unwrap();
    let path = format!("/v1/admin/enquiries/bookings/{id}/status");
    let (status, _) = w
        .call(
            "POST",
            &path,
            Some(&viewer),
            Some(json!({ "status": "confirmed" })),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = w
        .call(
            "POST",
            &path,
            Some(&editor),
            Some(json!({ "status": "completed" })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "pending can't jump to completed");
    let (status, _) = w
        .call(
            "POST",
            &path,
            Some(&editor),
            Some(json!({ "status": "confirmed" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (_, detail) = w
        .call(
            "GET",
            &format!("/v1/admin/enquiries/{enquiry}"),
            Some(&viewer),
            None,
        )
        .await;
    assert_eq!(detail["enquiry"]["status"], "demo_scheduled");
    assert_eq!(detail["booking"]["status"], "confirmed");

    // Rescheduling: to a free slot yes, onto someone else's no.
    let reschedule = format!("/v1/admin/enquiries/bookings/{id}/reschedule");
    let (status, _) = w
        .call(
            "POST",
            &reschedule,
            Some(&editor),
            Some(json!({ "starts_at": race })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    let free = w
        .slots()
        .await
        .into_iter()
        .find(|s| *s != first && *s != race)
        .unwrap();
    let (status, body) = w
        .call(
            "POST",
            &reschedule,
            Some(&editor),
            Some(json!({ "starts_at": free })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(w.slots().await.contains(&first), "the old slot is free again");

    // Cancelling frees the slot; finished bookings stay finished.
    let (status, _) = w
        .call(
            "POST",
            &path,
            Some(&editor),
            Some(json!({ "status": "cancelled" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(w.slots().await.contains(&free));
    let (status, _) = w
        .call(
            "POST",
            &path,
            Some(&editor),
            Some(json!({ "status": "confirmed" })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Start Now: a workspace request needs the organisation and its size.
    let mut workspace = json!({
        "kind": "workspace_request",
        "product": "zirahr",
        "name": "Esther Njeri",
        "email": "esther@example.co.ke",
        "company": format!("Mfano Ltd {}", w.run),
        "consent": true,
        "locale": "en",
        "elapsed_ms": 9000,
    });
    let (status, body) = w.submit(workspace.clone()).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(body["error"]["fields"].to_string().contains("company_size"));
    workspace["company_size"] = json!("51-200");
    let (status, body) = w.submit(workspace).await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let (_, list) = w
        .call(
            "GET",
            "/v1/admin/enquiries?kind=workspace_request",
            Some(&viewer),
            None,
        )
        .await;
    let row = list["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["reference"] == body["reference"])
        .unwrap()
        .clone();
    let ws = row["id"].as_str().unwrap();

    // Assignment and notes: editors and up, recorded in the activity.
    let assign = format!("/v1/admin/enquiries/{ws}/assignee");
    let (status, _) = w
        .call(
            "POST",
            &assign,
            Some(&viewer),
            Some(json!({ "user_id": editor_id })),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = w
        .call(
            "POST",
            &assign,
            Some(&editor),
            Some(json!({ "user_id": Uuid::now_v7() })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = w
        .call(
            "POST",
            &assign,
            Some(&editor),
            Some(json!({ "user_id": editor_id })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let notes = format!("/v1/admin/enquiries/{ws}/notes");
    let (status, _) = w
        .call("POST", &notes, Some(&editor), Some(json!({ "note": "  " })))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _) = w
        .call(
            "POST",
            &notes,
            Some(&editor),
            Some(json!({ "note": "Called; sending the onboarding pack." })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let status_path = format!("/v1/admin/enquiries/{ws}/status");
    let (status, _) = w
        .call(
            "POST",
            &status_path,
            Some(&editor),
            Some(json!({ "status": "converted" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (_, detail) = w
        .call("GET", &format!("/v1/admin/enquiries/{ws}"), Some(&viewer), None)
        .await;
    assert_eq!(detail["enquiry"]["assigned_to"], json!(editor_id));
    let actions: Vec<&str> = detail["history"]
        .as_array()
        .unwrap()
        .iter()
        .map(|h| h["action"].as_str().unwrap())
        .collect();
    for action in ["enquiry.assigned", "enquiry.note_added", "enquiry.status_changed"] {
        assert!(actions.contains(&action), "{action} in {actions:?}");
    }

    // The overview counts what arrived, by kind, website and status.
    let (status, overview) = w
        .call("GET", "/v1/admin/enquiries/overview?days=7", Some(&viewer), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(overview["total"].as_i64().unwrap() >= 3);
    assert!(overview["converted"].as_i64().unwrap() >= 1);
    assert!(overview["demos"]["booked"].as_i64().unwrap() >= 2);
    assert!(overview["by_kind"].to_string().contains("workspace_request"));
    let (status, _) = w
        .call("GET", "/v1/admin/enquiries/overview?days=3", Some(&viewer), None)
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Switched off again (tidy for other runs); the public slots go with it.
    let (_, current) = w
        .call(
            "GET",
            "/v1/admin/enquiries/availability/zirahr",
            Some(&owner),
            None,
        )
        .await;
    let mut off = current["availability"].clone();
    off["enabled"] = json!(false);
    let (status, _) = w
        .call(
            "POST",
            "/v1/admin/enquiries/availability/zirahr",
            Some(&owner),
            Some(json!({ "availability": off, "version": current["version"] })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (_, public) = w.call("GET", "/v1/sites/zirahr/demo-slots", None, None).await;
    assert_eq!(public["enabled"], false);
}
