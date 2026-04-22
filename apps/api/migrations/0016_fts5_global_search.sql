-- Generic migration for FTS5 global search

CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
  entry_id    UNINDEXED,   -- PK di content_entries, non cercabile
  schema_slug UNINDEXED,   -- per filtrare per tipo senza MATCH
  title,                   -- campo testo principale
  body,                    -- campo richtext/text secondario
  tags,                    -- campo tags (array JSON → stringa piatta)
  status      UNINDEXED,   -- per filtrare per status
  tokenize = 'unicode61 remove_diacritics 1'
);

-- Backfill dati esistenti (DELETE prima per idempotenza)
DELETE FROM content_fts;
INSERT INTO content_fts (entry_id, schema_slug, title, body, tags, status)
SELECT
  id,
  schema_slug,
  COALESCE(
    json_extract(data, '$.art_01'),   -- articoli → title
    json_extract(data, '$.prd_01'),   -- prodotti → name
    json_extract(data, '$.pag_01'),   -- pagine   → title
    json_extract(data, '$.tm_01'),    -- team     → name
    json_extract(data, '$.tes_02'),   -- testimonanze → company
    ''
  ),
  COALESCE(
    json_extract(data, '$.art_05'),   -- articoli → body
    json_extract(data, '$.prd_07'),   -- prodotti → description
    json_extract(data, '$.pag_03'),   -- pagine   → body
    ''
  ),
  COALESCE(
    json_extract(data, '$.art_04'),   -- articoli → tags
    ''
  ),
  status
FROM content_entries;

-- Sync Triggers

-- AFTER INSERT
CREATE TRIGGER IF NOT EXISTS fts_after_insert
AFTER INSERT ON content_entries BEGIN
  INSERT INTO content_fts (entry_id, schema_slug, title, body, tags, status)
  VALUES (
    new.id,
    new.schema_slug,
    COALESCE(json_extract(new.data, '$.art_01'), json_extract(new.data, '$.prd_01'),
             json_extract(new.data, '$.pag_01'), json_extract(new.data, '$.tm_01'),
             json_extract(new.data, '$.tes_02'), ''),
    COALESCE(json_extract(new.data, '$.art_05'), json_extract(new.data, '$.prd_07'),
             json_extract(new.data, '$.pag_03'), ''),
    COALESCE(json_extract(new.data, '$.art_04'), ''),
    new.status
  );
END;

-- AFTER UPDATE
CREATE TRIGGER IF NOT EXISTS fts_after_update
AFTER UPDATE ON content_entries BEGIN
  DELETE FROM content_fts WHERE entry_id = old.id;
  INSERT INTO content_fts (entry_id, schema_slug, title, body, tags, status)
  VALUES (
    new.id,
    new.schema_slug,
    COALESCE(json_extract(new.data, '$.art_01'), json_extract(new.data, '$.prd_01'),
             json_extract(new.data, '$.pag_01'), json_extract(new.data, '$.tm_01'),
             json_extract(new.data, '$.tes_02'), ''),
    COALESCE(json_extract(new.data, '$.art_05'), json_extract(new.data, '$.prd_07'),
             json_extract(new.data, '$.pag_03'), ''),
    COALESCE(json_extract(new.data, '$.art_04'), ''),
    new.status
  );
END;

-- AFTER DELETE
CREATE TRIGGER IF NOT EXISTS fts_after_delete
AFTER DELETE ON content_entries BEGIN
  DELETE FROM content_fts WHERE entry_id = old.id;
END;
