-- Migration 0007: Pulizia dati di test (schema_slug = 'progetti')
-- Il seed "progetti" è stato rimosso dal registro. Le entry orfane
-- non causano errori a runtime ma occupano spazio e confondono i test.
DELETE FROM content_entries WHERE schema_slug = 'progetti';
