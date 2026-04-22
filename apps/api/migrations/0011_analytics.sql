-- Migrazione: Tabella Analytics per metriche Cloudflare-style
CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day_ts INTEGER NOT NULL,          -- Timestamp inizio giornata (Unix epoch)
    metric TEXT NOT NULL,             -- 'requests', 'visitors', 'bandwidth_mb'
    value INTEGER DEFAULT 0,
    UNIQUE(day_ts, metric)
);

CREATE INDEX IF NOT EXISTS idx_analytics_day ON analytics(day_ts);
