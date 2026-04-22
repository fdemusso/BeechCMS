-- Media library: traccia ogni file caricato su R2.
-- Abilita: media library UI, rilevamento orfani, utilizzo storage per utente.
-- Il contatore in system_stats rimane per compatibilità; SUM(size_bytes) qui è la fonte canonica.

CREATE TABLE IF NOT EXISTS media_objects (
  key          TEXT PRIMARY KEY,           -- chiave R2 (es. "1713600000-img.jpg")
  filename     TEXT NOT NULL,              -- nome originale pre-sanitize
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  uploaded_by  TEXT NOT NULL DEFAULT '',   -- users.id (soft ref, nessun FK per portabilità D1)
  created_at   INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_media_user    ON media_objects(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_media_created ON media_objects(created_at DESC);
