# 1. Feature Definition and Core Value

La protezione dei dati personali sensibili (GDPR / privacy compliance) richiede che le informazioni fornite dagli utenti esterni (come indirizzi email, numeri di telefono o dati personali) siano cifrate a riposo nel database e mai esposte tramite endpoint pubblici di lettura. Tuttavia, la cifratura a riposo non deve compromettere l'esecuzione immediata delle automazioni transazionali (es. invio di email di conferma a `{{this.email}}` o webhook operativi) né impedire agli operatori autorizzati di visualizzare i dati gestionali tramite dashboard protetta.

La feature risolve questo problema introducendo la gestione end-to-end della classificazione `confidential` con cifratura trasparente a riposo, regole granulari di scrittura e modifica pubblica definite a livello di schema (Seed/Branch), ed esecuzione delle pipeline di automazione in memoria prima della persistenza crittografica.

# 2. Domain Boundaries and Business Rules

### Entità Logiche Coinvolte
* **Seed & Branch Policy Engine (`@beechcms/core`):** Definisce lo schema dei contenuti e le policy di classificazione dei dati (`public`, `internal`, `confidential`, `restricted`), con regole granulari per permessi di lettura, scrittura in creazione (`add`) e modifica (`edit`).
* **Content Repository (`apps/api` / `@beechcms/core`):** Si occupa della persistenza crittografica trasparente su Cloudflare D1 (AES-256-GCM) per i campi `confidential` e della decifratura automatica in fase di lettura per contesti autorizzati.
* **Public Ingestion Handlers (`apps/api` - `public-add`, `public-edit`):** Gestiscono la validazione, sanitizzazione e controllo accessi per le richieste provenienti da client non autenticati.
* **Automation Runner (`apps/api`):** Motore di esecuzione delle automazioni operante in contesto di sistema (`system`), responsabile della valutazione delle condizioni e dell'esecuzione delle azioni.

### Regole di Business (Business Rules)
1. **Isolamento della Classificazione `confidential`:**
   * I campi classificati come `confidential` sono cifrati automaticamente prima della persistenza a DB e memorizzati nel formato crittografico standard.
   * I campi `confidential` sono rigorosamente omessi in qualsiasi risposta API pubblica di lettura (`actor: 'public'`).
   * I campi `confidential` sono decifrati e resi visibili nelle risposte API autenticate (`actor: 'authenticated'`) per gli operatori della Dashboard.
2. **Politiche di Scrittura e Modifica Pubblica dei Campi `confidential`:**
   * **Creazione Pubblica (`add`):** Consentita di default per i campi `confidential` (a meno che non sia specificato esplicitamente `public: false` nella dichiarazione del branch).
   * **Modifica Pubblica (`edit`):** Bloccata di default per i campi `confidential`. La modifica pubblica è permessa SOLO se esplicitamente autorizzata nella configurazione delle policy del branch all'interno del Seed.
3. **Protezione dei Campi `internal` e `restricted`:**
   * I campi classificati come `internal` e `restricted` sono ad uso esclusivo del backend e non possono mai essere scritti o modificati tramite endpoint pubblici (né in `add` né in `edit`).
4. **Pipeline delle Automazioni in Memoria (`In-Memory Pipeline`):**
   * L'Automation Runner opera con contesto privilegiato `system` e riceve l'entry con i valori in chiaro direttamente in memoria al momento del dispatch dell'evento (`create`/`update`).
   * Nessuna maschera o filtro restrittivo viene applicato ai template o ai payload delle azioni configurate (email, notifiche, webhook).

# 3. Primary Requirements (User Stories)

* AS A sviluppatore frontend / utente anonimo I WANT inviare dati personali sensibili tramite endpoint pubblici di creazione SO THAT la mia richiesta di contatto o registrazione venga registrata in sicurezza senza esporre i miei dati ad altri utenti pubblici
* AS A amministratore di sistema I WANT che i dati sensibili marcati come confidenziali siano cifrati a riposo nel database SO THAT la piattaforma sia pienamente conforme agli standard di sicurezza e conformità GDPR
* AS A amministratore di sistema I WANT configurare automazioni email o webhook che utilizzino i campi confidenziali in chiaro SO THAT i messaggi transazionali e le notifiche vengano inviati immediatamente senza errori di templating
* AS A operatore di dashboard autenticato I WANT visualizzare e consultare i campi confidenziali delle voci di contenuto SO THAT io possa svolgere le consuete attività operative e di supporto senza barriere manuali di decifratura
* AS A progettista di schemi (Seed Designer) I WANT definire a livello di singolo campo se un dato confidenziale possa essere modificato pubblicamente oltre che creato SO THAT io possa proteggere i dati sensibili da sovrascritture non autorizzate dopo la sottomissione iniziale

# 4. Secondary Requirements and Logical Constraints

### Gestione Errori e Validazioni
* **Rifiuto Modifica Campo Confidenziale non Autorizzato:** Se una richiesta pubblica di `edit` include un campo `confidential` la cui configurazione di seed non autorizza esplicitamente la modifica pubblica, l'API deve rispondere con status HTTP `422 Unprocessable Entity` e un messaggio dettagliato conforme allo standard Problem Details: `"Cannot edit sensitive field '<alias>': edit permission not granted by seed declaration"`.
* **Rifiuto Scrittura Campi Interni/Ristretti:** Qualsiasi tentativo di scrittura o modifica pubblica di campi `internal` o `restricted` deve fallire con status HTTP `422 Unprocessable Entity` (`Cannot write internal/restricted fields: <aliases>`).
* **Integrità Payload Automazioni:** L'in-memory entry passata all'Automation Runner deve contenere tutti i campi generati dal sistema (`id`, `slug`, `status`, timestamp) unitamente ai dati del payload in chiaro prima della cifratura su DB.

### Vincoli Temporali e di Stato
* **Esecuzione Asincrona:** Il dispatch delle automazioni avviene in background senza bloccare la risposta HTTP al client, preservando le metriche di latenza dell'endpoint di ingestione.
* **Idempotenza e Coerenza Dati:** In caso di retry o gestione di sottomissioni idempotenti, la cifratura a riposo deve produrre identificatori coerenti (blind indexing / HMAC hash) per le colonne indicizzabili senza esporre il vettore di inizializzazione o la chiave.

# 5. Out of Scope (Discarded during sparring)

* **Decifratura Dinamica Manuale nell'Engine Automazioni:** Esclusa l'aggiunta di logica di decifratura dedicata all'interno di `AutomationRunner`, poiché il payload dell'evento è già in memoria in chiaro e le eventuali letture di relazioni esterne vengono già gestite trasparentemente da `D1ContentRepository`.
* **Filtraggio o Mascheramento Arbitrario dei Webhook:** Escluso qualsiasi filtro preventivo sui campi confidenziali inviati tramite azioni webhook delle automazioni, in quanto le automazioni operano in contesto di sistema (`system`) esplicitamente configurato dall'amministratore.
* **Key Rotation Dinamica a Runtime:** Escluso il supporto alla migrazione massiva o rotazione a caldo delle chiavi di cifratura su Cloudflare D1 per questo sprint.
