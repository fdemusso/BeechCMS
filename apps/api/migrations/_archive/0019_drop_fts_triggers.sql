-- Rimuove i trigger FTS5 hardcoded che usavano branch ID specifici degli attuali seed di esempio.
-- La sincronizzazione FTS è ora gestita a livello applicativo in shared/fts-sync.ts,
-- usando il Botanical Engine per estrarre i campi in modo generico per qualsiasi seed.

DROP TRIGGER IF EXISTS fts_after_insert;
DROP TRIGGER IF EXISTS fts_after_update;
DROP TRIGGER IF EXISTS fts_after_delete;
