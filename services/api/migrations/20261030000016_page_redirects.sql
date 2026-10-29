-- Search settings per page (P7-G1): when a published page moves to a new
-- address, its old address forwards to it (301), so links and search results
-- keep working. A redirect points at the page, not at a path, so moving a
-- page again never creates chains. It only applies while no live page uses
-- the old address.
CREATE TABLE page_redirects (
    site_id     UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    from_path   TEXT        NOT NULL,
    page_id     UUID        NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
    created_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (site_id, from_path)
);

CREATE INDEX page_redirects_page_idx ON page_redirects (page_id);
