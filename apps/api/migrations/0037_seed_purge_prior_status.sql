-- A purge job records the seed's status at start so a failed DROP restores it instead of
-- reactivating a seed the user had soft-deleted before hard-deleting it.
ALTER TABLE seed_media_purge_jobs
    ADD COLUMN prior_status TEXT NOT NULL DEFAULT 'active' CHECK (prior_status IN ('active', 'deleted'));
