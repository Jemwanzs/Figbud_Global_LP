//! ZiraHR's eight modules reach a price book saved before two of them
//! existed (owner's brief, 12 Nov 2026), once, unpriced and private.

mod common;

use common::database;
use serde_json::Value;

#[tokio::test]
async fn missing_modules_are_added_once_to_the_draft_unpriced_and_private() {
    let Some(pool) = database().await else { return };
    // A ZiraHR price book saved before Teams and Learning existed.
    let mut book = serde_json::to_value(figbud_api::pricing::engine::zirahr_starting_book()).unwrap();
    book["items"]
        .as_array_mut()
        .unwrap()
        .retain(|i| i["id"] != "teams" && i["id"] != "learning");
    sqlx::query(
        "INSERT INTO pricing_books (site_id, draft) SELECT id, $1 FROM sites WHERE slug = 'zirahr'
         ON CONFLICT (site_id) DO UPDATE SET draft = $1",
    )
    .bind(&book)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "DELETE FROM audit_log WHERE action = 'pricing.modules_added' AND site_id = (SELECT id FROM sites WHERE slug = 'zirahr')",
    )
    .execute(&pool)
    .await
    .unwrap();
    let published_before: Option<Value> = sqlx::query_scalar(
        "SELECT published FROM pricing_books WHERE site_id = (SELECT id FROM sites WHERE slug = 'zirahr')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    figbud_api::pricing::add_modules(&pool).await.unwrap();
    let draft: Value = sqlx::query_scalar(
        "SELECT draft FROM pricing_books WHERE site_id = (SELECT id FROM sites WHERE slug = 'zirahr')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    for id in ["teams", "learning"] {
        let item = draft["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["id"] == id)
            .expect(id);
        assert!(
            item["rate"].is_null() && item["public"] == false,
            "{id} unpriced and private"
        );
    }
    // What customers see is untouched.
    let published_after: Option<Value> = sqlx::query_scalar(
        "SELECT published FROM pricing_books WHERE site_id = (SELECT id FROM sites WHERE slug = 'zirahr')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(published_before, published_after);

    // Once: removing one afterwards keeps it removed.
    let mut edited = draft.clone();
    edited["items"]
        .as_array_mut()
        .unwrap()
        .retain(|i| i["id"] != "teams");
    sqlx::query(
        "UPDATE pricing_books SET draft = $1 WHERE site_id = (SELECT id FROM sites WHERE slug = 'zirahr')",
    )
    .bind(&edited)
    .execute(&pool)
    .await
    .unwrap();
    figbud_api::pricing::add_modules(&pool).await.unwrap();
    let draft: Value = sqlx::query_scalar(
        "SELECT draft FROM pricing_books WHERE site_id = (SELECT id FROM sites WHERE slug = 'zirahr')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
        !draft["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|i| i["id"] == "teams")
    );
}
