# 1. Feature Definition and Core Value

Il publish di una bozza in BeechCMS sovrascrive ciecamente la riga live, senza mai verificare se qualcun altro (utente, admin, chiamata API diretta) l'ha modificata nel frattempo. Risultato: **perdita silenziosa di dati**, senza errore, senza log, senza possibilità di recupero. Il lock pessimista (Issue #70) copre solo la contesa in-sessione UI; non copre bypass API, decadimento lock, o editing concorrente fuori dall'editor.

Il valore indispensabile non è "MVCC completo" — è il minimo che serve per **rendere visibile un conflitto invece di farlo sparire**: uno snapshot timestamp confrontato al momento del publish, che blocca la scrittura distruttiva e restituisce un 409 esplicito. Nessuna UI di merge, nessun versioning storico: solo la rete di sicurezza mancante.

# 2. Domain Boundaries and Business Rules

**Entità coinvolte:**
- `ContentEntry` (riga live in `content_{slug}`) — proprietario di `updated_at`.
- `ContentDraft` (riga in `content_{slug}_drafts`) — proprietario di `live_snapshot_at`, nuovo campo.
- `DraftConflictError` — nuovo tipo di errore di dominio, `extends RepositoryError`, vive in `@beechcms/core`.
- `Seed` config (`allowDrafts: boolean`) — flag che determina se la regola si applica.
- Attori: Editor (UI), Admin, Integrazione API diretta — nessuna distinzione di privilegio nella regola di conflitto: chiunque scrive per ultimo su `publishDraft` è soggetto allo stesso controllo.

**Regole ferree:**
1. Il controllo di conflitto vive **esclusivamente** nel Repository layer (`D1ContentRepository`), non nell'handler HTTP e non nella Dashboard. L'handler si limita a tradurre l'errore in Problem Details.
2. Lo snapshot è scritto **una sola volta** per ciclo di vita bozza (creazione), mai risovrascritto da autosave successivi (`COALESCE`).
3. La regola si applica **solo** a seed con `allowDrafts: true`. Per `allowDrafts: false`, `publishDraft` resta no-op — zero cross-dependency introdotta.
4. Nessuna nuova entità di dominio (no "ConflictResolution", no "MergeRequest"): il conflitto è binario, bloccante, e la risoluzione (discard/retry) è responsabilità del chiamante, fuori da questa feature.
5. Il Botanical Engine (DDL generator) è responsabile solo dello schema (`live_snapshot_at` come colonna), non della logica di confronto — mantiene la separazione Engine/Repository della Vertical Slice Architecture.

# 3. Primary Requirements (User Stories)

* AS AN editor I WANT il publish di una bozza bloccato con errore esplicito quando la versione live è stata modificata dopo la creazione della mia bozza SO THAT non sovrascrivo silenziosamente il lavoro di qualcun altro.

* AS A consumer API (integrazione diretta o dashboard) I WANT una risposta 409 in formato RFC 7807 standard quando il publish entra in conflitto SO THAT il mio client può intercettare l'errore con la gestione errori già esistente, senza logica ad-hoc.

* AS A developer del Botanical Engine I WANT che `generateDraftTable` includa `live_snapshot_at` nello schema generato SO THAT ogni nuovo seed con `allowDrafts: true` nasce già protetto, senza migrazioni manuali future.

* AS A maintainer di dati esistenti I WANT che le bozze create prima di questa feature (`live_snapshot_at IS NULL`) pubblichino senza errore SO THAT non si introduce un blocco operativo retroattivo su dati legacy.

# 4. Secondary Requirements and Logical Constraints

- **Race condition TOCTOU (bloccante per l'Architect):** il design descritto in `idea.md` fa "SELECT live.updated_at" poi confronto in codice applicativo, poi batch di scrittura. Tra la SELECT e la UPDATE due publish concorrenti potrebbero entrambi superare il check prima che l'altro scriva. Vincolo per la fase di planning: il confronto **deve** essere incorporato nella clausola `WHERE` della UPDATE stessa (es. `UPDATE content_{slug} SET ... WHERE id = ? AND updated_at = ?` con verifica `rowsAffected`), non lasciato a una lettura separata. Questo non è un dettaglio implementativo rimandabile: senza atomicità nella scrittura, la feature non risolve il problema che dichiara di risolvere.
- **Ambiguità "re-basata":** `idea.md` menziona che lo snapshot viene preso "alla creazione o re-basata" ma nessun meccanismo di rebase è nel checklist implementativo. Decisione di scope: **nessun rebase esiste in questa feature**. Se in futuro serve un endpoint per "aggiorna il mio snapshot al live corrente", è una feature separata.
- Nuova entry creata direttamente in draft (nessuna riga in `_drafts`, status `'draft'` sulla tabella live): nessun conflitto possibile per definizione — nessuna logica aggiuntiva richiesta, solo assenza di falsi positivi.
- Migrazione per DB esistenti: `ALTER TABLE ... ADD COLUMN live_snapshot_at INTEGER` deve essere nullable e non distruttiva — segue le convenzioni in `_config/database_workflow.md` (da caricare in fase di planning/implementazione, non qui).
- Testing: la feature richiede minimo tre livelli di verifica — unit su `D1ContentRepository` (successo/conflitto), compatibilità legacy (null snapshot), integration sull'endpoint HTTP (409 reale). Le convenzioni esatte (tier, posizione, anatomia) sono in `_config/testing_conventions.md`, da rispettare nella fase di test, non anticipate qui.
- Nessun impatto su UI/dashboard oltre alla gestione 409 già esistente per Problem Details — nessun nuovo componente grafico è nel perimetro di questa feature.

# 5. Out of Scope (Discarded during sparring)

- **Rebase/merge automatico della bozza** contro il live aggiornato — nessuna logica di merge campo-per-campo, nessun tentativo di risoluzione automatica. Il chiamante deve scartare la bozza o ricrearla manualmente.
- **UI di risoluzione conflitti / diff viewer** — fuori perimetro; la dashboard riceve solo il 409 e mostra l'errore standard.
- **Notifica realtime del conflitto (WebSocket/polling)** — competenza del lock pessimista (Issue #70), non di questo meccanismo ottimistico.
- **Versioning storico / audit trail completo delle modifiche live** — questa feature non introduce uno storico, solo un singolo timestamp di confronto puntuale (MVCC-flavored, non MVCC completo).
- **Estensione della regola a seed con `allowDrafts: false`** — non applicabile per definizione, nessuna modifica al loro flusso.
- **Retry automatico o backoff sul conflitto** — la gestione del retry, se necessaria, è responsabilità del client chiamante, non della feature.
- **Differenziazione di privilegio tra attori (editor vs admin vs API)** nel conflitto — la regola è cieca al ruolo, si applica identicamente a chiunque scriva per ultimo.
