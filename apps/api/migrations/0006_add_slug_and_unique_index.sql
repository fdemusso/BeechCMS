-- Migrazione 0006: Colonna slug e indice univoco (schema_slug, slug)
-- Retrocompatibile: slug nullable; entry esistenti restano con slug = NULL.
-- SQLite: UNIQUE su colonna nullable permette più righe con NULL.

ALTER TABLE content_entries ADD COLUMN slug TEXT;

CREATE UNIQUE INDEX idx_content_entries_schema_slug_slug ON content_entries(schema_slug, slug);
