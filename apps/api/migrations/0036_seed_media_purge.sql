-- Media keys must survive the content-table DROP so R2 cleanup can be retried.
CREATE TABLE seed_media_purge_jobs (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    definition TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('live', 'drafts', 'purging', 'done', 'failed')),
    cursor INTEGER NOT NULL DEFAULT 0,
    staged_count INTEGER NOT NULL DEFAULT 0,
    purged_count INTEGER NOT NULL DEFAULT 0,
    lease_token TEXT,
    lease_until INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX seed_media_purge_active_slug
    ON seed_media_purge_jobs (slug) WHERE phase IN ('live', 'drafts', 'purging');

CREATE TABLE seed_media_purge_keys (
    job_id TEXT NOT NULL REFERENCES seed_media_purge_jobs(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL,
    PRIMARY KEY (job_id, object_key)
);

-- A seed cannot be recreated while its old tables are being staged or purged.
CREATE TRIGGER seed_purge_block_insert BEFORE INSERT ON seeds
WHEN NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM seed_media_purge_jobs WHERE slug = NEW.slug AND phase IN ('live', 'drafts', 'purging')
)
BEGIN
    SELECT RAISE(ABORT, 'seed_purge_in_progress');
END;

CREATE TRIGGER seed_purge_block_reactivation BEFORE UPDATE OF status ON seeds
WHEN NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM seed_media_purge_jobs WHERE slug = NEW.slug AND phase IN ('live', 'drafts', 'purging')
)
BEGIN
    SELECT RAISE(ABORT, 'seed_purge_in_progress');
END;
