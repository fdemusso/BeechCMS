-- =============================================================================
-- Beech CMS v0.4.0 — Notification Type Success Support
-- Updates notifications CHECK constraint to include 'success'
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications_dg_tmp (
    id         TEXT    NOT NULL PRIMARY KEY,
    title      TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    type       TEXT    NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
    is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO notifications_dg_tmp (id, title, message, type, is_read, created_at)
SELECT id, title, message, type, is_read, created_at FROM notifications;

DROP TABLE notifications;

ALTER TABLE notifications_dg_tmp RENAME TO notifications;

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(is_read);
