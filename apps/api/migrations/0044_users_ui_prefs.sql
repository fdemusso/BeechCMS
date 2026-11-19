-- =============================================================================
-- ADD users.ui_prefs — per-user UI preferences container
--
--     Closed keys, validated by the API against @beechcms/core's
--     uiPreferencesSchema. Deliberately separate from notification_prefs:
--     the two containers are never reused or mixed.
--
--     Existing rows read the default '{}', so there is no backfill; a user
--     starts from an empty container.
-- =============================================================================

ALTER TABLE users ADD COLUMN ui_prefs TEXT NOT NULL DEFAULT '{}';
