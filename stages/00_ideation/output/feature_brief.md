# Feature Brief: Unified Beech CLI (`pnpm beech`)

Questo Feature Brief descrive gli obiettivi, i requisiti e l'architettura proposta per l'unificazione e la modernizzazione di tutti i comandi di sviluppo di **BeechCMS** sotto un unico binario ed entrypoint principale: `pnpm beech` (collegato a `bin/cli.mjs`).

---

## 1. Obiettivo della Feature

Consolidare la complessa serie di script di sviluppo, comandi Docker e migrazioni del database D1 sparsi nel monorepo sotto un'unica interfaccia a riga di comando (CLI) coerente, moderna e ben organizzata.

Il nuovo CLI deve:
1. Offrire un'esperienza **interattiva e moderna** per gli sviluppatori umani (usando `@clack/prompts`).
2. Essere **completamente utilizzabile dagli agenti IA e in contesti CI** tramite modalità non interattiva (rilevando automaticamente TTY o supportando flag come `--yes` o `--json`).
3. Fornire una guida all'uso chiara e colorata (`pnpm beech help` / `pnpm beech --help`).
4. Centralizzare l'esecuzione, eliminando la necessità per lo sviluppatore di ricordare comandi complessi come `pnpm --filter @beechcms/api db:reset:local` o i vari comandi Docker.

---

## 2. Requisiti Principali

### A. Interfaccia Moderna ed Elegante
* Utilizzo del pacchetto `@clack/prompts` e `picocolors` per presentare menu interattivi, prompt guidati, spinner di caricamento e note informative leggibili.
* Un comando principale `pnpm beech help` (o `pnpm beech --help`) formattato in sezioni logiche, colorate e facili da scansionare visivamente.

### B. Flessibilità e Supporto IA / CI (Modalità Non Interattiva)
* Se il comando viene eseguito senza TTY attivo (es. all'interno di una pipeline CI o da un agente IA che cattura lo standard output) oppure se viene fornito il flag `--yes` / `-y`, il CLI deve evitare qualsiasi prompt interattivo ed eseguire i comandi con valori predefiniti sicuri.
* Gestione robusta degli errori e codici di uscita (`exit code 1` su fallimenti) per un tracciamento ottimale da parte degli agenti IA.

### C. Integrazione nel Monorepo
* Creazione di un alias `"beech": "node bin/cli.mjs"` nel `package.json` principale in modo da permettere l'esecuzione locale diretta tramite `pnpm beech <command>`.
* Il CLI deve mappare i comandi richiamando programmaticamente i relativi script esistenti del monorepo, l'eseguibile di Wrangler o i comandi Docker.

### D. Lingua e Coerenza (Coerenza e Universalità)
* Tutti i messaggi generati dal CLI (testi dell'help, prompt interattivi, messaggi di log, errori) e tutta la relativa documentazione devono essere scritti esclusivamente in **lingua inglese** per garantire coerenza con il resto del codebase di BeechCMS e assicurarne l'universalità d'uso.

---

## 3. Mappatura dei Comandi Proposti

Il CLI `beech` centralizzerà i comandi organizzandoli nelle seguenti categorie:

### 1. Gestione Locale e Onboarding
* **`pnpm beech init [--db] [--remote] [--db-name <n>]`**
  * Inizializza i file di progetto e opzionalmente il database locale.
* **`pnpm beech onboard [--remote] [--yes] [--db <name>]`**
  * Esegue la configurazione completa automatica (`init --db` + `seed:load`). Ottimizzato per l'uso immediato da parte di agenti e CI.
* **`pnpm beech update`**
  * Aggiorna le dipendenze interne e applica le nuove migrazioni di sistema al database locale.

### 2. Database e Migrazioni (D1 / Wrangler)
* **`pnpm beech db:migrate`**
  * Applica tutte le migrazioni D1 locali pendenti (alias di `pnpm --filter @beechcms/api db:migrate:local`).
* **`pnpm beech db:reset`**
  * Rimuove lo stato locale di Wrangler e riesegue da zero il bootstrap del database locale.

### 3. Gestione dei Seed e Schema
* **`pnpm beech seed:create`**
  * Avvia il wizard interattivo per definire un nuovo schema Seed in `seeds.ts`.
* **`pnpm beech seed:load [--diff] [--remote] [--db <name>] [--dry-run]`**
  * Sincronizza lo schema dei Seed attuali nel database locale o remoto D1.
* **`pnpm beech schema:diff [--write] [--name <name>] [--remote] [--db <name>]`**
  * Genera una migrazione SQL additiva confrontando `SEED_REGISTRY` e lo stato del database.
* **`pnpm beech validate`**
  * Valida il file `seeds.ts` per rilevare duplicati o errori di configurazione.
* **`pnpm beech generate:types [--out <path>] [--local]`**
  * Rigenera le interfacce TypeScript a partire dallo schema del database locale/remoto.

### 4. Stack di Sviluppo e Docker
* **`pnpm beech dev`** (o **`pnpm beech start`**)
  * Avvia l'intero ambiente di sviluppo locale (Stack Docker + API Worker + Dashboard).
* **`pnpm beech dev:stop`**
  * Ferma i container Docker senza eliminare i volumi persistenti.
  * *Esegue: `docker compose -f docker/docker-compose.yml stop`*
* **`pnpm beech dev:reset`**
  * Esegue un reset completo dello stack Docker arrestando i container e distruggendo tutti i volumi e i dati persistenti (MinIO, Mailpit, database, ecc.).
  * *Esegue: `docker compose -f docker/docker-compose.yml down -v`*
* **`pnpm beech dev:tunnel`**
  * Mostra l'indirizzo Cloudflare Tunnel attivo per i test pubblici.
* **`pnpm beech mailpit:clear`**
  * Pulisce l'inbox delle email di test in Mailpit locale.

### 5. Log di Sviluppo (Streaming)
* **`pnpm beech logs <service>`**
  * Mostra in streaming continuo i log di un servizio Docker specifico.
  * Valori accettati per `<service>`:
    * `mailpit` (inbox email locale)
    * `db` / `sqlite` (interfaccia SQLite Web)
    * `tunnel` (Cloudflare Tunnel)
    * `storage` / `minio` (local storage S3)
  * *Esegue: `docker compose logs -f <service>`*

### 6. Controllo Qualità e Deployment
* **`pnpm beech test [--coverage] [--diff]`**
  * Esegue la suite completa di test tramite Turborepo o Vitest.
* **`pnpm beech lint`**
  * Esegue ESLint su tutto il monorepo.
* **`pnpm beech deploy [--skip-seed] [--skip-check]`**
  * Compila e distribuisce l'applicazione in ambiente Cloudflare Workers/D1 di produzione.
* **`pnpm beech doctor`**
  * Esegue la diagnostica di React Doctor per rilevare problemi sulla dashboard.

---

## 4. Dettagli di Implementazione Proposti

### Fase A: Registrazione dello Script
Nel file `package.json` a livello di root, verrà aggiunta la riga:
```json
"scripts": {
  "beech": "node bin/cli.mjs"
}
```

### Fase B: Aggiornamento del CLI Entrypoint (`bin/cli.mjs`)
1. **Supporto Esteso dei Comandi**: Espandere l'oggetto `COMMANDS` e i relativi gestori per accogliere i nuovi comandi di sviluppo (es. `dev`, `logs`, `db:migrate`, `db:reset`).
2. **Uso di `@clack/prompts`**:
   * Utilizzare Clack per rendere graficamente piacevole la visualizzazione iniziale e le note importanti.
   * Riconoscere quando la sessione non è TTY o se è presente `--yes` per bypassare i prompt interattivi e consentire il funzionamento ottimizzato per agenti e script automatici.
3. **Esecuzione di Comandi Esterni**:
   * Per comandi che richiedono esecuzioni di processi esterni (come `docker compose` o `pnpm run test`), utilizzare `node:child_process` (`spawnSync` o `execSync`) inoltrando gli stream `stdio: 'inherit'` per preservare i colori della shell originale e consentire l'interattività.

---

## 5. Aggiornamenti della Documentazione (`docs/`)

La documentazione del progetto deve riflettere questa unificazione:
1. **`CLAUDE.md`**: Sarà aggiornato per presentare `pnpm beech` come comando centrale di interazione con il workspace.
2. **`_config/commands.md`**: Verrà aggiornato documentando dettagliatamente ogni opzione di `pnpm beech` al posto dei comandi spezzati.
3. **`docs/SYSTEM_MAP.md`**: Includerà la mappa dei comandi `pnpm beech` per facilitare il reperimento da parte degli agenti IA.

---

## 6. Criteri di Accettazione

* **Consistenza**: Tutti i comandi descritti sono accessibili tramite `pnpm beech <comando>`.
* **Usabilità IA**: Un comando come `pnpm beech db:reset --yes` o `pnpm beech db:migrate` viene eseguito senza richiedere input utente se rilevato non-TTY o con flag appositi.
* **Supporto Help**: L'esecuzione di `pnpm beech` senza argomenti o con `--help` / `-h` mostra una lista formattata ed elegante di tutti i comandi disponibili categorizzati.
* **Integrazione**: Tutti i vecchi flussi di sviluppo continuano a funzionare passando dal nuovo wrapper.
