-- Aggiunge la dimensione seed alle analytics per il tracking del traffico per content type.
-- Ricrea la tabella per modificare il vincolo UNIQUE da (day_ts, metric)
-- a (day_ts, metric, seed). seed = '' indica metriche globali (non per-seed).
-- NOTA: SQLite tratta NULL come distinto da NULL nei UNIQUE index,
-- quindi si usa stringa vuota come sentinel per le metriche globali.

CREATE TABLE IF NOT EXISTS analytics_v2 (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    day_ts  INTEGER NOT NULL,
    metric  TEXT NOT NULL,
    seed    TEXT NOT NULL DEFAULT '',   -- '' = metrica globale, 'articoli' = per-seed
    value   INTEGER DEFAULT 0,
    UNIQUE(day_ts, metric, seed)
);

INSERT OR IGNORE INTO analytics_v2 (id, day_ts, metric, seed, value)
SELECT id, day_ts, metric, '', value FROM analytics;

DROP TABLE analytics;
ALTER TABLE analytics_v2 RENAME TO analytics;

CREATE INDEX IF NOT EXISTS idx_analytics_day  ON analytics(day_ts);
CREATE INDEX IF NOT EXISTS idx_analytics_seed ON analytics(seed, day_ts);
