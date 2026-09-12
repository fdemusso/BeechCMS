# Idea: Soft Deletes, Trash Bin Lifecycle & GDPR Deletion Ledger (Issue #110)

## 1. Visione e Obiettivo
Introdurre in BeechCMS un ciclo di vita completo per la gestione della cancellazione dati (**Soft Delete & Cestino**), configurabile per singolo Seed (`softDelete: true`).
Oggi i metodi di eliminazione eseguono un hard delete fisico immediato (`DELETE FROM`), rendendo irrecuperabili dati critici (ordini, clienti, lead) in caso di errore operativo.

L'implementazione deve:
1. Consentire la cancellazione logica (**Soft Delete**) proteggendo i dati nelle viste standard e permettendo il recupero dal **Cestino**.
2. Garantire la conformità al **GDPR (Diritto all'Oblio / Purge)** impedendo che i backup ripristinati (D1 Time Travel o R2 snapshot) facciano risorgere dati legalmente cancellati (**Deletion Ledger**).
3. Allinearsi con l'autorità schema di D1, le Public API tipizzate (#382/#383) e il control plane MCP (#328).

---

## 2. Stato Attuale e Analisi dell'Esistente

### Limiti emersi nel codebase
- **Cancellazione distruttiva immediata**: `D1ContentRepository.delete()` esegue `DELETE FROM ${tableName} WHERE id = ?`.
- **Rischio distruzione media prematura**: `deleteHandler` in `apps/api/src/features/content/handlers/delete.ts` invoca `deleteR2Objects` all'istante. Se un elemento con immagini viene cestinato, i file su R2 verrebbero distrutti, rompendo il record in caso di futuro ripristino.
- **Conflitto sui vincoli di unicità (`slug`)**: La colonna `slug` in D1 ha un vincolo inline `slug TEXT NOT NULL UNIQUE`. Se un post viene cancellato logicamente, non è possibile creare un nuovo post con lo stesso slug senza incorrere in un errore SQL.
- **Assenza di filtro nelle letture**: `buildSelectQuery`, `findById` e `findBySlug` non conoscono lo stato di cancellazione e restituirebbero anche i record cestinati.
- **Problema Zombie Data post-restore**: Un restore da backup D1 Time Travel ripristina lo stato del database a un istante $T_0$, resuscitando record che erano stati definitivamente cancellati per conformità GDPR tra $T_0$ e il presente.

---

## 3. Decisioni Architetturali Fondamentali

### A. Distinzione Netta: Soft Delete (Cestino) vs Purge (GDPR)
Non confondere il cestino operativo con la cancellazione GDPR:
- **Soft Delete (`delete`)**:
  - Imposta `deleted_at = unixepoch()`.
  - Il dato rimane integro nel DB, decifrabile e ripristinabile.
  - Gli asset associati su **Cloudflare R2 rimangono intatti**.
  - Non soddisfa una richiesta formale di cancellazione GDPR.
- **Purge (`purge`)**:
  - Esegue la cancellazione fisica definitiva (`DELETE FROM`).
  - Rimuove le righe orfane dalle junction tables (multi-relation) e dalla tabella `_drafts`.
  - Rimuove definitivamente gli oggetti associati su **Cloudflare R2**.
  - Registra l'evento nel **Deletion Ledger** per proteggere l'oblio post-restore.

### B. Indici Parziali SQLite per lo Slug
Nei seed con `softDelete: true`, il vincolo di unicità sullo slug non può essere globale a livello di colonna. Viene sostituito da un **indice parziale**:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_{slug}_slug_active 
  ON content_{slug}(slug) 
  WHERE deleted_at IS NULL;
```
In questo modo, uno slug può essere riutilizzato per un nuovo contenuto attivo se la versione precedente è nel cestino.

### C. Protezione Rigorosa delle Public API (#383)
- Nessun endpoint Public API (`/api/v1/public/*`) accetterà parametri per accedere a record cestinati.
- `GET /api/v1/public/:seed/:id` e `GET /api/v1/public/:seed/slug/:slug` restituiscono `404 Not Found` se `deleted_at IS NOT NULL`.
- **Relation Expansion (`include=`)**: Se un record correlato espanso via `#383` è nel cestino, la Public API lo risolve a `null` (mantenendo l'ID grezzo nella chiave estera), prevenendo fughe di dati trashed.
- **Relation Subqueries**: I filtri relazionali ignorano rigorosamente i record cestinati.

### D. Deletion Ledger & Resurrezione Dati post-Restore (Commento 1)
Per impedire che un restore di D1 (Time Travel o snapshot R2) ripristini record cancellati per GDPR:
1. Tabella di sistema locale in D1:
   ```sql
   CREATE TABLE IF NOT EXISTS deletion_ledger (
     id TEXT PRIMARY KEY,
     tenant_id TEXT NOT NULL,
     seed_slug TEXT NOT NULL,
     entity_id TEXT NOT NULL,
     deleted_at INTEGER NOT NULL,
     purge_after INTEGER NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('active', 'expired')),
     reason TEXT, -- gdpr_request | retention | admin | other
     UNIQUE (tenant_id, seed_slug, entity_id)
   );
   CREATE INDEX IF NOT EXISTS idx_deletion_ledger_lookup
     ON deletion_ledger (tenant_id, seed_slug, entity_id);
   ```
2. **Sopravvivenza al rollback del database**:
   Poiché un restore di D1 riavvolge anche la tabella `deletion_ledger` locale, ogni evento di purge GDPR viene contestualmente accodato/sincronizzato su storage esterno duraturo (Cloudflare KV o file append-only JSONL su R2: `gdpr-ledger/purged.jsonl`).
3. **Reconciliation Tool**:
   Fornire un comando / hook post-restore (`beech gdpr:reconcile` o funzione interna al worker) che legge il log esterno e applica il purge forzato su qualsiasi record resuscitato.

### E. Perimetro MCP (#328)
- Attualmente `@beechcms/mcp` gestisce esclusivamente il **control plane dello schema** (`beech_schema_plan`, `beech_schema_validate`, `beech_list_seeds`, ecc.) e non manipola record a runtime.
- **Decisione**: I tool di manipolazione contenuti via MCP (`beech_content_delete`, `restore`, ecc.) sono **fuori perimetro** per questa issue e saranno oggetto di un futuro upgrade dedicato all'MCP (Content CRUD & Operations).
- MCP eredita automaticamente a costo zero il supporto a `softDelete` su `Seed` (per esportazione schema, validazione e piani DDL) poiché dipende direttamente da `@beechcms/core`.

---

## 4. Specifiche Tecniche di Implementazione

### Fase 1: Core Engine (`@beechcms/core`)
- **`packages/core/src/engine/types.ts`**:
  - Aggiungere `softDelete?: boolean` all'interfaccia `Seed`.
  - Estendere `SelectOptions` con `trashMode?: 'exclude' | 'include' | 'only'` (default: `'exclude'`).
- **`packages/core/src/engine/ddl.ts`**:
  - Aggiungere `'deleted_at'` a `SYSTEM_COLUMNS`.
  - In `generateCreateTable`: se `seed.softDelete === true`, inserire la colonna `deleted_at INTEGER DEFAULT NULL`.
  - In `generateIndexes`: se `seed.softDelete === true`, creare:
    - `CREATE INDEX IF NOT EXISTS idx_{slug}_deleted_at ON content_{slug}(deleted_at);`
    - `CREATE UNIQUE INDEX IF NOT EXISTS idx_{slug}_slug_active ON content_{slug}(slug) WHERE deleted_at IS NULL;` (omettendo `UNIQUE` inline sulla colonna slug).
- **`packages/core/src/engine/seed-ddl.ts` (`planExtendSeed`)**:
  - Supportare l'evoluzione di schema: se `seed.softDelete === true` e la colonna `deleted_at` non è presente nelle colonne esistenti, emettere `ALTER TABLE content_{slug} ADD COLUMN deleted_at INTEGER DEFAULT NULL;`.
- **`packages/core/src/engine/seed-validation.ts`**:
  - Validare che `seed.softDelete`, se definito, sia di tipo booleano.
- **`packages/core/src/engine/schema-fingerprint.ts`**:
  - Includere `softDelete` tra i campi rilevanti per il calcolo del fingerprint canonico dello schema.
- **`packages/core/src/engine/query.ts` (`buildSelectQuery`)**:
  - Se `seed.softDelete === true`:
    - `trashMode === 'exclude'` (o non specificato) $\rightarrow$ inietta `${table}.deleted_at IS NULL`.
    - `trashMode === 'only'` $\rightarrow$ inietta `${table}.deleted_at IS NOT NULL`.
    - `trashMode === 'include'` $\rightarrow$ non aggiunge filtri su `deleted_at`.
- **`packages/core/src/engine/seed-types-generator.ts`**:
  - Nei tipi generati (`beech.generated.ts`), includere `deleted_at?: number | null` se il seed ha `softDelete: true`.

### Fase 2: Repository Layer (`D1ContentRepository`)
- **Metodi di Lettura**:
  - `findMany`: propaga `trashMode` a `buildSelectQuery`.
  - `findById`: se `seed.softDelete` è attivo, verifica `deleted_at IS NULL` (salvo opzione `trashMode`).
  - `findBySlug`: aggiunge clausola `AND deleted_at IS NULL`.
- **Metodi di Modifica Ciclo di Vita**:
  - `delete(seed, id, options)`:
    - Se `seed.softDelete === true`: esegue `UPDATE content_{slug} SET deleted_at = (unixepoch()) WHERE id = ?`. Esegue gli hook `beforeDelete` / `afterDelete`.
    - Se `seed.softDelete !== true`: delega a `purge()`.
  - `restore(seed, id, options)`:
    - Verifica che il record esista ed abbia `deleted_at IS NOT NULL`.
    - Verifica che non vi siano conflitti di unicità attiva su `slug`.
    - Esegue `UPDATE content_{slug} SET deleted_at = NULL WHERE id = ?`.
  - `purge(seed, id, options)`:
    - Esegue la cancellazione fisica `DELETE FROM content_{slug} WHERE id = ?`.
    - Cancella le relazioni nelle junction tables e le bozze in `_drafts`.
    - Restituisce i dati per consentire l'eliminazione fisica su Cloudflare R2.
    - Registra il record nella tabella `deletion_ledger`.

### Fase 3: Handlers & Endpoints REST (`apps/api`)
- **Modifica di `deleteHandler` (`apps/api/src/features/content/handlers/delete.ts`)**:
  - Separare la rimozione asset R2: invocare `deleteR2Objects` **solo se l'operazione è un purge definitivo** (quando `seed.softDelete !== true` o con query flag esplicita `?purge=true`).
  - In caso di soft delete, i file rimangono intatti su R2.
- **Nuove Route Cestino (`/api/content/:slug/trash`)**:
  - `GET /api/content/:slug/trash` — elenca i record cestinati (`trashMode: 'only'`), supporta paginazione e ordinamento per data di cancellazione.
  - `POST /api/content/:slug/trash/:id/restore` — ripristina un record dal cestino.
  - `DELETE /api/content/:slug/trash/:id/purge` — hard delete definitivo + rimozione R2.
  - `POST /api/content/:slug/trash/bulk-restore` — ripristino massivo.
  - `POST /api/content/:slug/trash/bulk-purge` — eliminazione definitiva massiva.
- **Public API Isolation**:
  - Verificare che `read-list.ts`, `read-single.ts`, `relation-include.ts` e `relation-subquery.ts` non espongano mai record con `deleted_at IS NOT NULL`.

### Fase 4: Dashboard UI
- Per i Seed che presentano `softDelete: true`:
  - Aggiungere una tab/vista secondaria **"Cestino"** nella schermata lista contenuti.
  - Modificare il pulsante "Elimina" standard in **"Sposta nel cestino"**.
  - All'interno del cestino: azioni **"Ripristina"** e **"Elimina definitivamente"** (con modale di conferma per prevenire cancellazioni irreversibili).
  - Se è configurato anche `retentionDays`, mostrare un banner informativo con il conto alla rovescia prima del purge automatico.

---

## 5. Out of Scope (Esclusioni deliberate)
1. **Tool di contenuto MCP (`beech_content_*`)**: Deferiti al futuro upgrade MCP incentrato su Content CRUD/Operations.
2. **Cascading polimorfo non dichiarato**: Non applicare soft-delete a cascata arbitrario su grafi non esplicitamente legati da foreign key dirette.
3. **Cestino per configurazioni di schema**: Il soft-delete si applica esclusivamente alle istanze di contenuto (`content_*`), non alle definizioni dei Seed o tabelle di sistema.

---

## 6. Checklist Operativa di Implementazione
- [ ] **Core Engine**: Aggiungere `softDelete: boolean` all'interfaccia `Seed`, validazione e inclusione nel fingerprint.
- [ ] **DDL Generator**: Supportare `deleted_at INTEGER DEFAULT NULL`, indici dedicati e indice parziale per `slug`.
- [ ] **Schema Migration Plan**: Aggiornare `planExtendSeed` per emettere `ALTER TABLE ADD COLUMN deleted_at`.
- [ ] **Type Generator**: Includere `deleted_at` nei tipi generati per backend/admin.
- [ ] **Repository Layer**: Aggiornare `D1ContentRepository` (`findMany`, `findById`, `findBySlug`, `delete`, `restore`, `purge`).
- [ ] **API Content Handlers**: Implementare endpoints `/trash`, `/restore`, `/purge` e proteggere gli asset R2 dal delete prematuro.
- [ ] **Public API**: Verificare l'isolamento totale da record cestinati (letture singole, liste, relazioni `#383`).
- [ ] **GDPR Ledger**: Creare tabella D1 `deletion_ledger` e log di append-only per garantire l'oblio post Time-Travel restore.
- [ ] **Dashboard UI**: Integrare vista Cestino, badge di stato e azioni contestuali di ripristino / svuotamento.
