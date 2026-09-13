# 1. Feature Definition and Core Value

BeechCMS oggi esegue cancellazioni fisiche immediate (`DELETE FROM`) su ogni contenuto. Un errore operativo su un ordine, cliente o lead è irrecuperabile, e non esiste alcuna garanzia formale che una richiesta GDPR di cancellazione ("diritto all'oblio") sopravviva a un ripristino di backup (D1 Time Travel).

Il problema reale da risolvere: separare in modo netto due concetti oggi fusi in un'unica operazione distruttiva —
1. la rimozione **reversibile** di un contenuto dalle viste operative (Cestino),
2. la rimozione **irreversibile e legalmente vincolante** dei dati (Purge/GDPR), che deve restare irreversibile anche dopo un restore del database.

Senza questa separazione, ogni feature futura che tocca cancellazione (ordini, media, lead) eredita lo stesso rischio di perdita dati accidentale e la stessa mancanza di conformità GDPR.

# 2. Domain Boundaries and Business Rules

**Entità coinvolte:**
- `Seed` (definizione schema) — proprietà opt-in `softDelete: boolean`.
- `Content Record` (riga `content_{slug}`) — acquisisce colonna `deleted_at`.
- `Trash` (vista logica, non un'entità fisica separata) — record con `deleted_at IS NOT NULL`.
- `Deletion Ledger` — log esterno append-only (fuori da D1), unica fonte di verità sui purge GDPR eseguiti.
- `R2 Asset` — media associati a un record, ciclo di vita disaccoppiato dalla riga DB.

**Regole ferree:**
- Soft Delete e Purge sono operazioni distinte con effetti diversi: solo Purge tocca R2, junction table, `_drafts` e Ledger.
- Il Deletion Ledger vive **fuori da D1** (R2 JSONL append-only). Nessuna tabella di sistema locale in D1, perché un restore D1 la riavvolgerebbe insieme al resto, vanificandone lo scopo.
- La Public API (`/api/v1/public/*`) non deve mai poter osservare, direttamente o per relazione espansa, un record cestinato.
- Il layer Repository (`D1ContentRepository`) è responsabile esclusivamente di operazioni DB (righe, junction, ledger esterno tramite scrittura I/O dedicata) e di eseguire gli hook di ciclo di vita. Non orchestra mai la cancellazione degli asset R2.
- Gli handler HTTP (`apps/api/src/features/content/handlers/`) restano thin orchestrator: ricevono i dati ritornati dal repository e invocano separatamente `deleteR2Objects`, in linea con la Vertical Slice Architecture (zero SQL raw negli handler, zero I/O esterno nel repository).
- Gli hook di ciclo di vita (`beforeDelete`/`afterDelete`) si applicano sia a Soft Delete sia a Purge — nessuna via di cancellazione (diretta, bulk, o futura automazione da retention) può bypassarli.
- Lo slug è un dettaglio di sistema, non un vincolo verso l'utente da negoziare a monte: la sua unicità è garantita a livello DB (indice parziale), e un conflitto in fase di restore si risolve automaticamente (auto-rename in catch), non con un'interazione utente bloccante.
- L'esecuzione automatica della retention (`retentionDays`) è fuori dal perimetro di questa issue a livello di runtime: viene predisposta solo l'interfaccia (query pura), l'adapter/scheduler reale appartiene a un'iniziativa futura dedicata alle automazioni ricorrenti.
- I tool MCP di manipolazione contenuti (`beech_content_*`) restano fuori perimetro; MCP eredita solo il supporto schema (`softDelete` su `Seed`) a costo zero via `@beechcms/core`.

# 3. Primary Requirements (User Stories)

* AS A editor I WANT cancellare un contenuto senza perderlo definitivamente SO THAT posso recuperare da un errore operativo prima che sia troppo tardi.
* AS A editor I WANT vedere e gestire un Cestino per ogni seed con soft delete abilitato SO THAT posso rivedere, ripristinare o eliminare definitivamente i contenuti cestinati.
* AS A editor I WANT selezionare più contenuti cestinati contemporaneamente SO THAT posso ripristinarli o eliminarli in blocco senza ripetere l'azione uno a uno.
* AS A compliance officer I WANT che una cancellazione GDPR (purge) resti irreversibile anche dopo un restore da backup D1 SO THAT non rischio di violare il diritto all'oblio di un utente che ha già ottenuto la cancellazione dei suoi dati.
* AS A developer I WANT che la Public API non esponga mai, nemmeno indirettamente via relazioni, un record cestinato SO THAT non introduco fughe di dati non intenzionali verso i consumer esterni.
* AS A developer I WANT che gli asset R2 non vengano toccati da un soft delete SO THAT un contenuto cestinato resta ripristinabile in modo completo, media inclusi.
* AS A platform engineer I WANT un'interfaccia per interrogare i record scaduti per retention SO THAT una futura automazione ricorrente possa collegarsi senza dover riprogettare la query.

# 4. Secondary Requirements and Logical Constraints

- **Slug reuse dopo soft delete**: un contenuto cestinato libera il proprio slug tramite indice unico parziale (`WHERE deleted_at IS NULL`), permettendo la creazione di un nuovo contenuto attivo con lo stesso slug.
- **Restore con slug in conflitto**: se lo slug del record da ripristinare è nel frattempo stato riassegnato a un contenuto attivo, la `UPDATE` di restore fallisce per vincolo DB; il fallimento viene intercettato in `catch` e risolto con auto-rename dello slug ripristinato (nessun 409 verso l'utente, nessuna conferma manuale richiesta).
- **Isolamento R2 dal ciclo soft delete**: `deleteR2Objects` viene invocato solo in caso di purge definitivo (seed senza `softDelete`, o flag esplicito `?purge=true`), mai su un semplice soft delete.
- **Deletion Ledger esterno**: ogni purge scrive un evento append-only su storage esterno a D1 (R2 JSONL), che sopravvive a un restore D1 Time Travel. Non esiste tabella `deletion_ledger` locale in D1.
- **Reconciliation post-restore**: un comando/hook dedicato legge il log esterno e riapplica forzatamente il purge su qualsiasi record "resuscitato" da un restore, usando il log esterno come unica fonte di verità (nessuna tabella locale da cui divergere).
- **Relation expansion e subquery (Public API)**: un record correlato espanso che risulta cestinato viene risolto a `null` (mantenendo l'FK grezza); i filtri di relation subquery ignorano sempre i record cestinati.
- **Hook di ciclo di vita simmetrici**: `beforeDelete`/`afterDelete` girano sia su soft delete sia su purge (diretto, bulk, e in futuro da retention automatica) — nessun percorso di cancellazione è esente.
- **Retention come interfaccia, non job**: viene predisposta solo una query pura (es. "trova record scaduti per retention di un dato seed"), documentata per un adapter/scheduler futuro; nessun cron, nessuna esecuzione automatica in questa issue.
- **Bulk operations**: `bulk-restore` e `bulk-purge` sono in scope pieno, coerenti con la selezione multipla già presente nella dashboard.
- **Migrazione schema incrementale**: seed esistenti che attivano `softDelete: true` in un secondo momento devono ricevere `ALTER TABLE ADD COLUMN deleted_at` via piano di evoluzione schema, senza richiedere un reset del contenuto esistente.

# 5. Out of Scope (Discarded during sparring)

- **Tabella `deletion_ledger` locale in D1**: scartata a favore del solo store esterno (R2 JSONL), per evitare doppia scrittura/sync e perché una tabella locale sarebbe comunque vanificata da un restore D1.
- **Scheduler/cron reale per `retentionDays`**: rimandato a una futura iniziativa dedicata alle automazioni ricorrenti; questa issue predispone solo l'interfaccia di query.
- **409 esplicito su conflitto slug in restore**: scartato in favore di auto-rename automatico via `catch`, perché lo slug è un dettaglio di sistema e non giustifica un'interazione utente bloccante.
- **Cascading polimorfo non dichiarato**: nessun soft-delete a cascata su grafi di relazioni non esplicitamente collegati da foreign key dirette.
- **Cestino per configurazioni di schema**: il soft delete si applica solo alle istanze di contenuto (`content_*`), mai alle definizioni dei Seed o alle tabelle di sistema.
- **Tool MCP di manipolazione contenuti** (`beech_content_delete`, `restore`, ecc.): deferiti a un futuro upgrade dedicato dell'MCP (Content CRUD & Operations).
