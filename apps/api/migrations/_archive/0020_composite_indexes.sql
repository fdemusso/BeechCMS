-- Indici compositi su content_entries per ottimizzare le query di lista filtrata.
-- Tutti gli indici sono agnostici rispetto ai seed: funzionano per qualsiasi
-- content type che il developer definirà in @beechcms/core.

-- Copre il pattern più frequente: WHERE schema_slug = ? AND status = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_ce_slug_status_created
  ON content_entries(schema_slug, status, created_at DESC);

-- Copre: ORDER BY updated_at (widget "modificati di recente" nel dashboard)
CREATE INDEX IF NOT EXISTS idx_ce_slug_updated
  ON content_entries(schema_slug, updated_at DESC);

-- Copre: WHERE draft_data IS NOT NULL (filtro bozze pendenti nel dashboard)
CREATE INDEX IF NOT EXISTS idx_ce_draft_pending
  ON content_entries(schema_slug) WHERE draft_data IS NOT NULL;
