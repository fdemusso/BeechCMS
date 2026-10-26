-- Universal soft delete: every content_{slug} table carries deleted_at (NULL = live).
-- Only the tables created by earlier migrations need it; engine-built tables get it from
-- generateCreateTable / planExtendSeed. Their inline slug UNIQUE stays: the _old_<ms> slug
-- rename on soft delete frees the slug without a partial index.
ALTER TABLE content_products    ADD COLUMN deleted_at INTEGER;
ALTER TABLE content_reviews     ADD COLUMN deleted_at INTEGER;
ALTER TABLE content_tasks       ADD COLUMN deleted_at INTEGER;
ALTER TABLE content_import_jobs ADD COLUMN deleted_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at    ON content_products(deleted_at);
CREATE INDEX IF NOT EXISTS idx_reviews_deleted_at     ON content_reviews(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at       ON content_tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_import_jobs_deleted_at ON content_import_jobs(deleted_at);
