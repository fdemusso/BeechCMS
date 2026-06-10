## ── Sprint 14: Multi-Field FTS5 Indexing ──

### Problema
Attualmente la ricerca Full-Text (FTS5) integrata in Beech indicizza esclusivamente il campo `body` di tipo `richtext`. Se un utente cerca un termine contenuto nel titolo o nella descrizione breve di un prodotto (campi di tipo standard `text`), la ricerca FTS non restituisce alcun risultato. Questo costringe il developer a implementare filtri lenti con clausole `LIKE` bypassando l'indice.

### Soluzione proposta: Schema FTS Multi-campo configurabile
Consentire agli sviluppatori di contrassegnare molteplici campi del Seed per l'indicizzazione FTS automatica.

#### 1. Dichiarazione nei Seed
```typescript
export const POST_SEED: Seed = {
  slug: 'posts',
  branches: [
    { alias: 'title', type: 'text', searchIndex: true },       // Indicizzato in FTS
    { alias: 'summary', type: 'text', searchIndex: true },     // Indicizzato in FTS
    { alias: 'body', type: 'richtext' }                        // Indicizzato di default
  ]
}
```

#### 2. SQL Triggers Automatici
Il compilatore del Botanical Engine genererà i trigger SQLite concatenando i campi per popolare la tabella virtuale FTS:

```sql
CREATE TRIGGER fts_posts_insert AFTER INSERT ON content_posts BEGIN
  INSERT INTO fts_posts(entry_id, body) VALUES (
    new.id, 
    coalesce(new.title, '') || ' ' || coalesce(new.summary, '') || ' ' || coalesce(new.body, '')
  );
END;
```

### Checklist di Implementazione (Sprint 14)
- [ ] Aggiungere la proprietà `searchIndex: boolean` al tipo `Branch`.
- [ ] Modificare il modulo `seed-ddl.ts` di `@beechcms/core` per concatenare tutti i campi marcati con `searchIndex` o di tipo `richtext` all'interno della DDL dei trigger SQLite FTS5 (`fts_{slug}_insert`, `fts_{slug}_update`).
- [ ] Testare le performance di ricerca FTS a livello database con query multi-campo.
