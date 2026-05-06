-- Seed data per Analytics (ultimi 30 giorni)
-- Questo permette di vedere il trend nella dashboard immediatamente

INSERT OR IGNORE INTO analytics (day_ts, metric, value) VALUES (1713312000, 'visitors', 120);
INSERT OR IGNORE INTO analytics (day_ts, metric, value) VALUES (1713225600, 'visitors', 145);
INSERT OR IGNORE INTO analytics (day_ts, metric, value) VALUES (1713139200, 'visitors', 98);
INSERT OR IGNORE INTO analytics (day_ts, metric, value) VALUES (1713052800, 'visitors', 210);
INSERT OR IGNORE INTO analytics (day_ts, metric, value) VALUES (1712966400, 'visitors', 180);
INSERT OR IGNORE INTO analytics (day_ts, metric, value) VALUES (1712880000, 'visitors', 165);
INSERT OR IGNORE INTO analytics (day_ts, metric, value) VALUES (1712793600, 'visitors', 190);
-- Aggiungiamo dati per oggi (simulati)
INSERT OR IGNORE INTO analytics (day_ts, metric, value) VALUES (strftime('%s', 'now', 'start of day'), 'visitors', 42);

-- Richieste totali
INSERT OR IGNORE INTO analytics (day_ts, metric, value) VALUES (1713312000, 'requests', 1200);
INSERT OR IGNORE INTO analytics (day_ts, metric, value) VALUES (1713225600, 'requests', 1450);
INSERT OR IGNORE INTO analytics (day_ts, metric, value) VALUES (1713139200, 'requests', 980);
