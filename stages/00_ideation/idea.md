## Optimistic Conflict Detection al Publish delle Bozze (MVCC-Flavored Snapshot Guard) — Issue #74

### Problema
In BeechCMS, quando un Seed ha abilitato `allowDrafts: true`, le modifiche a un record esistente vengono salvate separatamente nella tabella `content_{slug}_drafts` e promosse alla versione live tramite l'endpoint `POST /api/content/:slug/:id/draft/publish`.

Attualmente, il metodo `publishDraft` in `D1ContentRepository` esegue una transazione batch che sovrascrive ciecamente la riga live ed elimina la bozza:

```sql
UPDATE content_{slug} SET [campi bozza...], status = 'published', updated_at = unixepoch() WHERE id = ?;
DELETE FROM content_{slug}_drafts WHERE entry_id = ?;
```

Questo meccanismo presenta una grave falla di concorrenza (**silent overwrite / data loss**):
Se un editor apre e salva una bozza al tempo $T_0$, e un altro utente/admin (o integrazione API diretta) aggiorna la versione live al tempo $T_1$, quando il primo editor pubblica la bozza al tempo $T_2$ le modifiche apportate in $T_1$ vengono **irrimediabilmente sovrascritte e perse**, senza alcun avviso né traccia del conflitto.

Il sistema di lock pessimista (Issue #70) copre la contesa in tempo reale all'interno della sessione di editing dell'interfaccia, ma lascia scoperto il publish qualora il lock decada o la modifica live avvenga fuori dall'interfaccia UI (es. chiamate API dirette o bypass con warning).

---

### Soluzione proposta: Snapshot Guard Leggero (MVCC-flavored)
Introdurre un meccanismo ottimistico non invasivo basato su token temporale snapshot (`live_snapshot_at`), integrato nel ciclo di vita della bozza su Cloudflare D1.

#### 1. Tracciamento dello Snapshot (`live_snapshot_at`)
Aggiungere una colonna `live_snapshot_at INTEGER` alla tabella `content_{slug}_drafts`.
Questa colonna memorizza l'`updated_at` della versione live nel momento in cui la bozza è stata creata o re-basata.

#### 2. Acquisizione Snapshot in `saveDraft`
All'interno di `D1ContentRepository.saveDraft`:
- Recupera il `updated_at` della riga live corrispondente:
  ```sql
  SELECT updated_at FROM content_{slug} WHERE id = ? LIMIT 1;
  ```
- Nella query di `INSERT ... ON CONFLICT(entry_id) DO UPDATE SET`:
  - Se è un nuovo draft, imposta `live_snapshot_at = live.updated_at`.
  - **Preservazione nei salvataggi successivi (Autosave)**: per evitare che autosave continui sovrascrivano il token cancellando il conflitto intermedio, il valore esistente di `live_snapshot_at` viene preservato se già valorizzato:
    ```sql
    live_snapshot_at = COALESCE(content_{slug}_drafts.live_snapshot_at, EXCLUDED.live_snapshot_at)
    ```

#### 3. Controllo di Conflitto in `publishDraft`
All'interno di `D1ContentRepository.publishDraft`:
- Prima di comporre e sottomettere il batch di scrittura:
  1. Legge `draft.live_snapshot_at`.
  2. Legge `live.updated_at`.
  3. Se `draft.live_snapshot_at IS NOT NULL` e `live.updated_at > draft.live_snapshot_at`:
     - Interrompe immediatamente l'operazione.
     - Solleva un errore dedicato: `DraftConflictError`.

#### 4. Gestione Errore e Risposta HTTP RFC 7807 (`draft.handler.ts`)
Nell'endpoint `POST /api/content/:slug/:id/draft/publish`:
- Intercetta `DraftConflictError` e restituisce uno status `409 Conflict`:
  ```json
  {
    "type": "draft-conflict",
    "title": "Conflict",
    "status": 409,
    "detail": "The live entry was modified after this draft was created. Discard or re-base the draft."
  }
  ```

#### 5. Generatore DDL Botanical Engine (`packages/core/src/engine/ddl.ts`)
- Estendere `generateDraftTable(seed)` per includere `live_snapshot_at INTEGER` nello schema generato per le tabelle draft.
- Fornire istruzioni/migrazione SQL (`ALTER TABLE content_{slug}_drafts ADD COLUMN live_snapshot_at INTEGER;`) per i database esistenti.

---

### Vincoli di Dominio ed Edge Cases

1. **Retrocompatibilità (Draft Legacy)**:
   - Se `draft.live_snapshot_at` è `NULL` (bozze create prima dell'introduzione del campo), il controllo di conflitto viene **saltato** senza errori, garantendo che i dati preesistenti non restino bloccati.
2. **Nuove Entry create direttamente in Draft**:
   - In BeechCMS, una nuova bozza non ancora pubblicata risiede nella tabella live principale con `status = 'draft'` (e non ha record in `_drafts`). In questo caso non esiste una riga live preesistente con cui entrare in conflitto; il flusso aggiorna semplicemente lo stato a `'published'`.
3. **Seed con Bozze Disabilitate (`allowDrafts: false`)**:
   - Completamente inalterati, il metodo `publishDraft` continua a essere un no-op.
4. **Nessun impatto o breaking change sulla UI**:
   - La risposta 409 sfrutta il formato standard Problem Details già supportato dal client e dalla gestione errori globale della dashboard.

---

### Checklist di Implementazione
- [ ] **Core**: Creare ed esportare `DraftConflictError extends RepositoryError` in `@beechcms/core` (`packages/core/src/content/content.repository.ts` e `packages/core/src/index.ts`).
- [ ] **Engine DDL**: Aggiornare `generateDraftTable` in `packages/core/src/engine/ddl.ts` con la colonna `live_snapshot_at INTEGER` e aggiornare gli unit test in `ddl.test.ts`.
- [ ] **Repository D1**:
  - In `saveDraft`, salvare `live_snapshot_at` proteggendo la persistenza del token iniziale contro sovrascritture da autosave.
  - In `publishDraft`, verificare `live.updated_at > draft.live_snapshot_at` e sollevare `DraftConflictError`.
- [ ] **API Handler**: In `apps/api/src/features/draft/draft.handler.ts`, catturare `DraftConflictError` e rispondere con Problem Details HTTP 409.
- [ ] **Testing**:
  - Test unitario su `D1ContentRepository`: pubblicazione con live immutato (successo) vs live aggiornato posteriormente (lancio di `DraftConflictError`).
  - Test di compatibilità bozze legacy (`live_snapshot_at: null`).
  - Integration test dell'endpoint `/draft/publish` che verifica la ricezione di `409 Conflict`.
