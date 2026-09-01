# 1. Feature Definition and Core Value
BeechCMS ha introdotto la gestione dinamica a runtime dei content type (Seed), persistiti direttamente nella tabella di sistema `seeds` su Cloudflare D1 e gestiti tramite API transazionali dedicate. Tuttavia, la CLI (`seed:load`, `seed:create`, `schema:diff`), lo scaffolding di nuovi progetti (`create-beech`), il comando di rilascio (`beech deploy`) e la documentazione ufficiale sono rimasti ancorati a un modello legacy basato sul file statico `seeds.ts`.

Questa dualità genera disallineamenti silenti (schema drift), esecuzioni DDL parziali o fallimentari in produzione durante i deploy e confusione architetturale per sviluppatori e agenti IA.

La feature disaccoppia completamente BeechCMS, la sua CLI e il ciclo di vita del deployment dal file `seeds.ts`, formalizzando il Database Cloudflare D1 come unica sorgente di verità canonica per gli schemi e i content types.

# 2. Domain Boundaries and Business Rules
* **Canonical Schema Authority:** Il database Cloudflare D1 (tabella di sistema `seeds` e tabelle fisiche `content_*`) è l'unica sorgente canonica della struttura dei dati. Nessun file statico su filesystem locale può agire da autorità di schema.
* **Pure Worker Deployment:** Il comando di deploy rilascia esclusivamente il codice del Worker Cloudflare e gli asset correlati. Non esegue sincronizzazioni né manipolazioni DDL sul database D1 durante il deploy.
* **Clean Database Provisioning:** Il processo di onboarding e inizializzazione crea unicamente le tabelle di sistema fondamentali (`seeds`, `seed_meta`, `users`, ecc.), senza richiedere né verificare la presenza di file di seed locali.
* **Atomic Runtime Schema Evolution:** Tutte le operazioni di creazione, modifica ed eliminazione dei content types sono delegate esclusivamente all'API di runtime, che garantisce validazione semantica, esecuzione DDL atomica e invalidazione della cache.
* **Static Types Independence:** La generazione dei tipi TypeScript interroga direttamente lo schema fisico e le tabelle attive su D1, restando totalmente disaccoppiata da file di definizione su disco.

# 3. Primary Requirements (User Stories)
* AS A developer deploying BeechCMS I WANT the deploy command to publish only the Worker without running seed sync routines SO THAT production deployments are fast, decoupled from database state, and immune to silent schema corruption.
* AS A developer provisioning a new BeechCMS project I WANT the onboarding and initialization commands to bootstrap system tables without requiring a static seeds file SO THAT I can start a fresh instance immediately and manage schemas via runtime interfaces.
* AS A developer scaffolding a new project with the creation wizard I WANT the generated project structure to be free of legacy static seed definition files SO THAT my project relies exclusively on the database as the canonical source of truth.
* AS A developer using the BeechCMS CLI I WANT obsolete and confusing code-first schema sync commands to be removed SO THAT the CLI interface is clean, coherent, and aligned with the runtime architecture.
* AS A developer consulting the project documentation I WANT the guides, architectural maps, and reference manuals to reflect the database-first schema model and highlight the breaking changes SO THAT I have clear instructions on how to create and manage content types.

# 4. Secondary Requirements and Logical Constraints
* **Scaffolding Wizard Cleanup:** Il comando di creazione guidata del progetto non deve richiedere la selezione di template di seed né generare file di schema su disco.
* **Non-blocking Initialization:** I controlli di preflight e il comando di inizializzazione non devono sollevare avvisi né bloccare l'esecuzione se non trovano file di seed nel filesystem.
* **Graceful Command Deprecation:** I comandi rimossi o deprecati (`seed:load`, `seed:create`, `schema:diff`, `validate` basato su file) devono restituire indicazioni chiare sulla nuova architettura se invocati per errore.
* **Documentation Migration Notes:** Tutta la documentazione ufficiale deve formalizzare il Breaking Change, fornendo una guida di migrazione chiara per i progetti esistenti.
* **Architectural Maps Consistency:** Le mappe di sistema interne e gli schemi visuali devono eliminare ogni riferimento al compilatore di seed alimentato da file statici.

# 5. Out of Scope (Discarded during sparring)
* **MCP Server for AI Agents:** L'implementazione del server Model Context Protocol (MCP) e dei tool dedicati alla manipolazione dei content types da parte di agenti IA è esplicitamente esclusa da questa fase e verrà gestita in un'iniziativa separata.
* **Bidirectional Schema Sync / GitOps Sync:** Qualsiasi meccanismo di sincronizzazione bidirezionale (push/pull da database a file di schema su disco) e di generazione automatica di migrazioni D1 da sorgenti locali è scartato per mantenere il principio YAGNI.
* **Modifiche al Motore DDL di Backend:** Nessuna modifica logica o architetturale alle routine di migrazione a runtime già presenti nell'API, che restano il riferimento canonico.
