# Idea Draft: `@beechcms/mcp` — AI Schema Control Plane & Agent Skill per BeechCMS

## 1. Visione Generale e Obiettivo Strategico

Con la chiusura di 21 issue su 22 nella milestone **v0.8.0 ("AI-Native Ecosystem & Core Polish")**, l'**Issue #328** rappresenta l'ultimo e fondamentale tassello per completare la release.

L'obiettivo è realizzare **`@beechcms/mcp`**: un server standard conforme al **Model Context Protocol (MCP)** accompagnato da un'**Agent Skill** ufficiale per BeechCMS. 
`@beechcms/mcp` è il **control plane architetturale governato a runtime** attraverso cui gli agenti AI (Antigravity, Cursor, Claude Desktop, Windsurf) e gli sviluppatori nell'IDE possono ispezionare, pianificare, validare e mutare la struttura dati (Seeds e Branches) in tempo reale, **lavorando direttamente contro Cloudflare D1 tramite payload JSON strutturati**, senza intermediari fragili su filesystem, senza parsing AST e senza diluizioni di dominio.

---

## 2. Il Contesto: La Lezione della PR #370 e lo Stack Edge

### A. D1 è l'Unica Autorità a Runtime (Nessun File Statico)
La PR #370 ha eliminato `seeds.ts` e i vecchi comandi di sync per cancellare alla radice il problema della doppia fonte di verità (*split-brain*). 
* In un'architettura edge/serverless, D1 è il database attivo e sovrano.
* Le mutazioni a runtime appartengono al **Botanical Engine** (`@beechcms/core`), che gestisce gli invarianti:
  - Mirroring tabelle bozze (`content_<slug>_drafts`) vs produzione (`content_<slug>`).
  - Indici di ricerca full-text **FTS5** (`fts_content_<slug>`) e trigger di aggiornamento.
  - Vincoli di integrità referenziale e tabelle di giunzione M2M.
  - Concurrency control atomico tramite `seed_meta.registry_version`.

### B. Il Modello di Utilizzo Standard (`docs/start/first-project.md`)
Nel flusso documentato in `first-project.md`, il workspace dell'utente è minimale: un Worker che delega ad `@beechcms/api`, bindings D1/R2 in `wrangler.jsonc` e segreti in `.dev.vars`. 
Attualmente, la modellazione dei Seed avviene **esclusivamente a mano** tramite l'interfaccia visuale della dashboard web (`/admin`).

---

## 3. Il Problema Reale: L'Agente AI nell'IDE è "Cieco Architetturalmente"

Quando uno sviluppatore apre il progetto in un editor AI e chiede di creare o estendere un modello dati:
1. **Cecità totale**: L'agente non ha file sorgente da modificare perché i Seed risiedono a runtime in D1.
2. **Il pericolo dell'SQL arbitrario**: Se l'agente tentasse di eseguire comandi DDL o SQL grezzi su D1, distruggerebbe gli invarianti del Botanical Engine (rottura delle tabelle draft, perdita dei trigger FTS5, disallineamento dell'audit log).
3. **Nessun bisogno di Content CRUD**: L'agente non è un content editor; non ha bisogno di gestire upload R2 o testo formattato TipTap. Il vero blocco è la **definizione e l'evoluzione dello schema**.

---

## 4. Cosa Vogliamo: Schema & Model Control Plane 100% JSON & D1-First

Vogliamo un server MCP chirurgico, focalizzato al 100% sull'evoluzione dello schema:

### 1. Interfaccia Nativa JSON (Zero AST, Zero File Drift)
Gli agenti AI dialogano con l'MCP via JSON-RPC. Tutti i tool accettano e restituiscono strutture JSON native conformi alle interfacce `Seed` e `Branch` di `@beechcms/core`. D1 viene interrogato e aggiornato in tempo reale attraverso l'Admin API.

### 2. Il Paradigma di Sicurezza: Plan & Apply
Per impedire allucinazioni o alterazioni distruttive accidentali:
* **Discovery (Read-Only)**:
  * `beech_list_seeds`: Restituisce l'elenco dei Seed attivi, conteggio campi, stato bozze e l'attuale `schemaVersion` (`seed_meta.registry_version`).
  * `beech_get_seed`: Restituisce la definizione JSON canonica di un singolo Seed.
  * `beech_schema_export`: Esporta l'intero schema del database in uno snapshot JSON stabile.
* **Planning (Simulazione Non-Mutante)**:
  * `beech_schema_validate`: Valida un oggetto JSON Seed tramite `validateSeedDefinitions` (controllo alias riservati, formati slug, integrità relazioni).
  * `beech_schema_plan`: Confronta lo schema desiderato (JSON) con lo stato reale in D1 e genera un piano deterministico con:
    - `planId` univoco.
    - Classificazione di sicurezza: `additive` (nuove tabelle/colonne) o `destructive` (drop/retype/rename).
    - Flag `requiresConfirmation: true` in caso di operazioni distruttive.
* **Apply (Esecuzione Controllata e Concurrency Guard)**:
  * `beech_schema_apply`: Applica il piano richiedendo obbligatoriamente `planId` ed `expectedSchemaVersion`. Se D1 è cambiato nel frattempo (es. modifica concorrente da web), l'operazione viene respinta con errore di conflitto (409 Stale Plan).
  * Per modifiche distruttive è richiesta la conferma esplicita con token dedicato (`confirm: "<slug>.<branch>"`).
* **Direct Mutations (Scaffolding veloce per nuovi Seed)**:
  * `beech_create_seed`: Creazione diretta e validata di un nuovo content type con relative tabelle e indici.
  * `beech_add_branch`: Aggiunta atomica di un nuovo campo a un Seed esistente.

### 3. BeechCMS Agent Skill (`SKILL.md`)
Un file di documentazione operativa conforme agli standard degli agenti AI (Antigravity/Cursor/Claude) che codifica:
* Le regole sintattiche del Botanical Engine (slug `^[a-z0-9_]+$`, branch ID `^br_[A-Za-z0-9]+$`).
* Il workflow obbligatorio: *Inspect $\to$ Plan $\to$ Apply*.
* La priorità della conservazione dati.

---

## 5. Perché ci Serve: Obiettivi e Valore di Business

1. **Scaffolding Architetturale da Linguaggio Naturale**:
   Lo sviluppatore può dire all'AI: *"Crea il seed per i Prodotti con titolo, prezzo, categoria correlata e immagini"*. L'agente valida, genera il piano e lo applica a D1 in tempo reale.
2. **Sicurezza Assoluta (No Data Loss)**:
   Nessun drop di colonna o tabella può avvenire per errore o allucinazione: il Botanical Engine intercetta le modifiche distruttive e l'MCP impone la conferma.
3. **Zero Complessità di Parsing / Zero Split-Brain**:
   Nessun parser AST TypeScript. Nessun file locale che va fuori sincrono con la Dashboard. D1 rimane l'unica fonte di verità.
4. **Completamento Milestone v0.8.0**:
   Chiude l'ultimo issue aperto (#328) fornendo la chiusura dell'ecosistema AI-native di BeechCMS.

---

## 6. Confini Rigidi e Out of Scope (YAGNI)

* **Nessun Content CRUD**: La creazione, manipolazione o cancellazione delle singole voci di contenuto non fa parte di questo server MCP. Il consumo dati spetta all'applicazione tramite `@beechcms/client`.
* **Nessun caricamento o upload di Media su R2**: La gestione file binari e presigned upload rimane confinata alla Dashboard e all'API standard.
* **Nessun parser AST o generazione di file TypeScript (`beech.schema.ts`)**: L'Issue #381 è completamente scorporata e rimane una feature opzionale per sviluppatori umani via CLI. L'MCP lavora solo con JSON.
* **Nessun SQL arbitrario**: L'agente non può eseguire query SQL dirette né bypassare il Botanical Engine.
* **Nessuna persistenza di codice eseguibile in D1**: D1 memorizza solo definizioni di schema serializzabili.
