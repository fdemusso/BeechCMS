# 1. Feature Definition and Core Value

L'attuale architettura del Client SDK (`@beechcms/client`) presenta un entrypoint unico e universale che include metodi di scrittura e lettura all'interno dello stesso modulo. Questa configurazione introduce un grave rischio di sicurezza: l'esposizione accidentale di chiavi API di scrittura, secret server-side o logiche di mutazione all'interno dei bundle JavaScript distribuiti ai browser.

La presente feature risolve alla radice questa vulnerabilità attraverso un'architettura **Strict-by-Design**. Separa fisicamente a livello di package gli entrypoint per ambienti browser e ambienti server, eliminando qualsiasi metodo di mutazione dal bundle client e garantendo che il codice frontend possa eseguire unicamente operazioni di lettura autorizzate. Il valore fondamentale è l'azzeramento strutturale del rischio di leak di credenziali e una Developer Experience deterministica basata su standard Web API universali.

# 2. Domain Boundaries and Business Rules

### Confine di Dominio
Il perimetro della feature è circoscritto rigorosamente al package `packages/client`. Non sono ammesse modifiche o dipendenze incrociate verso la logica interna del backend (`apps/api`), verso la dashboard (`apps/dashboard`), o verso il toolkit dei form (`packages/forms-react`).

### Entità Logiche e Ruoli
* **Browser Client (`@beechcms/client/browser`):** Client HTTP specializzato e confinato all'ambiente browser/client-side.
* **Server Client (`@beechcms/client/server`):** Client HTTP completo specializzato per ambienti protetti (Node.js, Edge Workers, Server Components, API routes).
* **Root Module (`@beechcms/client`):** Esportatore puro di contratti e definizioni di tipo TypeScript, con utility deterministiche di serializzazione query.
* **Webhooks Module (`@beechcms/client/webhooks`):** Modulo isolato per la verifica crittografica delle firme dei webhook in ingresso.

### Regole di Business Non Negoziabili
1. **Segregazione Rigorosa dei Metodi:** Il Browser Client deve esporre esclusivamente operazioni di lettura (`list`, `get`). I metodi di mutazione (`create`, `update`) non devono esistere nella sua interfaccia né nel codice compilato.
2. **CRUD Completo nel Server Client:** Il Server Client deve supportare l'intero spettro di operazioni (`list`, `get`, `create`, `update`).
3. **Root Entrypoint Types-Only:** L'import radice `@beechcms/client` non deve esportare alcuna istanza o factory di client a runtime.
4. **Autenticazione Obbligatoria:** Sia il Browser Client che il Server Client richiedono tassativamente una chiave API in fase di inizializzazione per conformità con le policy di accesso dell'API.
5. **Agnosticismo di Rete:** L'integrazione con runtime specifici (Cloudflare Service Bindings, ambienti di test, sistemi di caching Next.js) deve avvenire esclusivamente tramite standard Web API (`fetch` custom opzionale e pass-through dei parametri di richiesta), senza dipendenze proprietarie da framework esterni.
6. **Result Pattern Deterministico:** Il client non deve mai lanciare eccezioni non gestite a seguito di errori HTTP o risposte di validazione fallite; deve restituire un oggetto discriminato contenente alternativamente il dato tipizzato o il dettaglio standardizzato del problema.

# 3. Primary Requirements (User Stories)

* AS A Frontend Developer I WANT un entrypoint dedicato `@beechcms/client/browser` privo di metodi di mutazione SO THAT sia impossibile includere accidentalmente logiche di scrittura o secret server-side nel bundle inviato agli utenti.
* AS A Fullstack Developer I WANT un entrypoint dedicato `@beechcms/client/server` con supporto a custom fetch e opzioni di richiesta native SO THAT possa eseguire operazioni CRUD complete e sfruttare le ottimizzazioni di rete del mio runtime senza vendor lock-in.
* AS A TypeScript Developer I WANT importare tipi condivisi e costruttori di query dall'entrypoint radice `@beechcms/client` SO THAT possa tipizzare le risposte e comporre filtri senza caricare codice runtime non necessario.
* AS A Backend Developer I WANT un entrypoint isolato `@beechcms/client/webhooks` SO THAT possa validare l'integrità e l'autenticità dei payload webhook HMAC-SHA256 ricevuti dal CMS.

# 4. Secondary Requirements and Logical Constraints

* **Gestione degli Errori RFC 9457:** Tutte le risposte non andate a buon fine (4xx, 5xx) devono essere normalizzate nella struttura problem details standard definita dal backend, popolando i dettagli specifici dei campi non validi in caso di errore 422.
* **Resilienza alle Eccezioni di Rete:** Errori a basso livello (mancanza di connettività, DNS unreachable, timeout o interruzioni di fetch) devono essere intercettati e incapsulati in un problema standardizzato con codice di stato zero, impedendo crash non gestiti nell'applicazione host.
* **Validazione dei Parametri di Configurazione:** L'assenza dell'URL base o della chiave API deve generare un errore immediato e descrittivo in fase di inizializzazione del client.
* **Normalizzazione degli URL:** Il client deve gestire in modo trasparente e tollerante la presenza o assenza di slash finali nell'URL di base fornito in configurazione.
* **Trasparenza dei Parametri di Query:** La serializzazione di filtri complessi, logiche di ordinamento, paginazione e ricerca full-text deve mappare fedelmente i parametri attesi dalla Public API.

# 5. Out of Scope (Discarded during sparring)

* **Auto-Parsing HTML TipTap nel Client HTTP:** Escluso per preservare la purezza dei tipi TypeScript ed evitare overhead di calcolo a runtime e bundle bloat nell'SDK di rete. La trasformazione dell'AST TipTap sarà gestita in una feature separata tramite utility pure dedicate.
* **Pipeline Dati Riservati e Cifratura Backend:** Escluse tutte le modifiche alle logiche di cifratura AES-GCM, campi confidenziali e gestione in-memory per automazioni email in `apps/api`, trattandosi di un dominio backend autonomo.
* **Protezione Anti-Bot per Form Pubblici:** Esclusa l'implementazione di Time-Trap token, Honeypot e validazione Origin in `packages/forms-react`, che costituirà un'iniziativa separata per l'ingestione pubblica.
* **Retrocompatibilità della Root:** Esclusa qualsiasi factory legacy o alias deprecato nella root `@beechcms/client`; la rottura con il vecchio client universale è intenzionale e non negoziabile per garantire la sicurezza by-design.
