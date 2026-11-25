## ── Sprint 15: Soft Deletes & Trash Bin Lifecycle ──

### Problema
I metodi di eliminazione in Beech cancellano fisicamente i record dal database (`DELETE FROM`). Se un utente del pannello admin cancella accidentalmente un ordine pagato o un cliente registrato, il dato è irrecuperabile. In un backend reale, i dati critici devono essere protetti tramite "Soft Delete" (Cestino).

### Soluzione proposta: Soft Delete e Tabella Trash
Abilitare il supporto al Cestino configurabile per ciascun Seed.

#### 1. Attivazione nel Seed
```typescript
export const ORDINI_SEED: Seed = {
  slug: 'ordini',
  softDelete: true, // Abilita il cestino
  branches: [...]
}
```

#### 2. Comportamento a livello Repository
- Quando viene chiamato `repo.delete(id)` su un Seed con softDelete attivo, il repository esegue un `UPDATE` impostando la colonna di sistema `deleted_at = unixepoch()`.
- Tutte le chiamate `findMany` e `findById` escludono automaticamente le righe dove `deleted_at IS NOT NULL`.
- Viene creato un endpoint `/api/content/:slug/trash` per elencare, ripristinare (`POST /restore/:id`) o eliminare definitivamente (`DELETE /purge/:id`) i record nel cestino.

### Checklist di Implementazione (Sprint 15)
- [ ] Aggiungere `softDelete: boolean` all'interfaccia `Seed` in core.
- [ ] Aggiornare il DDL generator per inserire la colonna `deleted_at INTEGER DEFAULT NULL` in caso di soft delete abilitato.
- [ ] Aggiornare `D1ContentRepository` per iniettare `AND deleted_at IS NULL` in tutte le letture e intercettare i delete.
- [ ] Implementare le API di gestione del cestino e visualizzarle nella Dashboard.
