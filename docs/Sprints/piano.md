# Sprint: Content Repository & Vertical Slice Migration (Piano Esecutivo)

## 1. Vincoli Architetturali (Non-Negoziabili)
- **Interface Location**: `packages/core/src/content.repository.ts`.
- **Base Class**: Utilizzo di `BaseD1Repository` in `apps/api/src/shared/` per logiche comuni D1 (error mapping, batching).
- **Repository Implementation**: `apps/api/src/shared/content.repository.d1.ts`.
- **Pure Data (Opzione A)**: Il repository restituisce dati grezzi. L'API applica filtri di visibilità e privacy.
- **R2 Cleanup Logic**: Il repository restituisce i dati della riga cancellata; l'handler esegue la pulizia fisica su R2.
- **Atomic Operations**: Uso obbligatorio di `db.batch()` per operazioni Mirror Tables (Bozze).
- **Zero SQL in Handlers**: Isolamento totale delle API dalla logica D1.

## 2. Piano di Azione

### Fase 0: Bonifica Ambiente (Completata)
Rimozione dei file legacy che violano i nuovi vincoli architetturali.
- [x] **Task 0.1**: Eliminare il file ombra `apps/api/src/shared/content.repository.ts`.
- [x] **Task 0.2**: Eliminare la vecchia implementazione `apps/api/src/shared/content.repository.d1.ts`.

### Fase 1: Fondamenta in `@beechcms/core` (Completata)
- [x] **Task 1.1**: Creare `packages/core/src/content.repository.ts`.
- [x] **Task 1.2**: Definire classi di errore: `RepositoryError`, `EntryNotFoundError`, `SlugConflictError`.
- [x] **Task 1.3**: Definire l'interfaccia `ContentRepository`.
- [x] **Task 1.4**: Esportare dal barrel `packages/core/src/index.ts`.

### Fase 2: Implementazione D1 in `apps/api` (Completata)
- [x] **Task 2.1**: Creare la classe astratta `apps/api/src/shared/base.repository.d1.ts` per gestione errori e DB instance.
- [x] **Task 2.2**: Implementare `D1ContentRepository` estendendo la base e implementando l'interfaccia di `@beechcms/core`.
- [x] **Task 2.3**: Implementare metodi privati "Building Blocks" per query riutilizzabili tra live e draft.
- [x] **Task 2.4**: Implementare metodi di lettura: `findMany`, `findById`, `findBySlug`, `getFacets`.
- [x] **Task 2.5**: Implementare metodi di scrittura: `create`, `update`, `delete` (ritorno riga per R2).
- [x] **Task 2.6**: Implementare logica Mirror Tables: `saveDraft`, `getDraft`, `publishDraft` (batch), `deleteDraft`.

### Fase 3: Iniezione e Middleware Hono (Completata)
- [x] **Task 3.1**: Aggiornare `apps/api/src/types.ts` con `repo: ContentRepository` nelle `Variables`.
- [x] **Task 3.2**: Creare `apps/api/src/middleware/repository.middleware.ts`.
- [x] **Task 3.3**: Registrare il middleware in `apps/api/src/factory.ts`.

### Fase 4: Migrazione Vertical Slice (Feature "Content")
- [x] **Task 4.1**: Creare struttura `apps/api/src/features/content/handlers/`.
- [x] **Task 4.2**: Refactoring Handlers: List, Get, Create, Update, Delete, Facets.
- [x] **Task 4.3**: Implementare la logica di cleanup R2 nei nuovi handler usando i dati del repo.
- [x] **Task 4.4**: Configurare il Barrel `index.ts` della feature e collegarlo all'app.

### Fase 5: Allineamento Feature Esistenti (Completata)
- [x] **Task 5.1**: Migrare `apps/api/src/features/draft/draft.handler.ts`.
- [x] **Task 5.2**: Migrare rotte pubbliche.

### Fase 6: Mocking e Validazione Test
- [x] **Task 6.1**: Implementare `StaticContentRepository` e `StaticIdempotencyRepository` in `apps/api/test/mocks/`. Iniezione via `BeechConfig` in `createBeechApp`.
- [ ] **Task 6.2**: Migrare la suite di test esistente al nuovo pattern deterministico (sostituire `createMockD1*` inline in `content.test.ts`, `public-read.test.ts`, `public-add.test.ts`, `public-edit.test.ts`).
