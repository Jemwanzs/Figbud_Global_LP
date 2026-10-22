-- Content management for the Blog & Insights section: authors, categories,
-- tags, localised articles with an approval workflow, scheduling and a
-- version history. Public endpoints only ever read published articles whose
-- publication time has passed.

CREATE TABLE cms_authors (
    id          UUID PRIMARY KEY,
    slug        TEXT        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name        TEXT        NOT NULL,
    role        TEXT,
    bio         TEXT,
    avatar_url  TEXT        CHECK (avatar_url IS NULL OR avatar_url ~ '^https://'),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cms_categories (
    id          UUID PRIMARY KEY,
    slug        TEXT        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name        TEXT        NOT NULL,
    description TEXT,
    position    INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cms_tags (
    id          UUID PRIMARY KEY,
    slug        TEXT        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cms_articles (
    id               UUID PRIMARY KEY,
    slug             TEXT        NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    locale           TEXT        NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'sw', 'fr', 'ar', 'zh')),
    title            TEXT        NOT NULL,
    excerpt          TEXT        NOT NULL,
    body_markdown    TEXT        NOT NULL,
    cover_image_url  TEXT        CHECK (cover_image_url IS NULL OR cover_image_url ~ '^https://'),
    cover_image_alt  TEXT,
    seo_title        TEXT,
    seo_description  TEXT,
    author_id        UUID        REFERENCES cms_authors (id) ON DELETE SET NULL,
    category_id      UUID        REFERENCES cms_categories (id) ON DELETE SET NULL,
    -- draft -> in_review -> published (approved); archived hides it again.
    status           TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN (
                         'draft', 'in_review', 'published', 'archived')),
    -- A future published_at schedules the article; it goes live at that time.
    published_at     TIMESTAMPTZ,
    approved_by      TEXT,
    approved_at      TIMESTAMPTZ,
    version          INTEGER     NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    search           TSVECTOR GENERATED ALWAYS AS (
                         setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                         setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B') ||
                         setweight(to_tsvector('simple', coalesce(body_markdown, '')), 'C')) STORED,
    UNIQUE (locale, slug),
    -- Nothing is published without an approval and a publication time.
    CONSTRAINT cms_articles_published_requires_approval CHECK (
        status <> 'published' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND published_at IS NOT NULL))
);

-- Public listing: newest visible articles per locale.
CREATE INDEX cms_articles_public_idx ON cms_articles (locale, published_at DESC) WHERE status = 'published';
CREATE INDEX cms_articles_category_idx ON cms_articles (category_id);
CREATE INDEX cms_articles_search_idx ON cms_articles USING GIN (search);

CREATE TABLE cms_article_tags (
    article_id  UUID NOT NULL REFERENCES cms_articles (id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES cms_tags (id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, tag_id)
);

CREATE INDEX cms_article_tags_tag_idx ON cms_article_tags (tag_id);

-- Every saved revision, for history and rollback.
CREATE TABLE cms_article_versions (
    id             UUID PRIMARY KEY,
    article_id     UUID        NOT NULL REFERENCES cms_articles (id) ON DELETE CASCADE,
    version        INTEGER     NOT NULL,
    title          TEXT        NOT NULL,
    excerpt        TEXT        NOT NULL,
    body_markdown  TEXT        NOT NULL,
    edited_by      TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (article_id, version)
);
